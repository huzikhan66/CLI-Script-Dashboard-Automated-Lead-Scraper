/**
 * server.js - Express Backend for CLI Script Dashboard & Runner
 *
 * Responsibilities:
 * 1. Background execution via child_process.spawn (original script logic untouched)
 * 2. Input file upload & validation (input.csv)
 * 3. Live terminal output streamed via Server-Sent Events (SSE)
 * 4. Real-time regex parsing of progress percentage, stage, items, and statistics
 * 5. Crash-resume & checkpoint handling via cache.json
 * 6. File downloads for output.csv, suspicious.csv, cache.json, and logs
 * 7. Clean separation: Server is purely data/logic, serves public/ static files
 */

const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Storage config for uploaded input file
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, process.cwd()),
    filename: (req, file, cb) => {
      // Save as input.csv or keep original name if requested
      const targetName = req.query.name || 'input.csv';
      cb(null, targetName);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

// Paths to tracked files
const PATHS = {
  SCRIPT_DEFAULT: 'email-scraper.js',
  INPUT: 'input.csv',
  OUTPUT: 'output.csv',
  SUSPICIOUS: 'suspicious.csv',
  CACHE: 'cache.json',
  SESSION: 'fb-session.json',
  LOGS_BACKUP: 'process_run.log'
};

// ─── STATE MANAGEMENT ──────────────────────────────────────────
let activeProcess = null;
let processStatus = 'idle'; // 'idle' | 'running' | 'completed' | 'stopped' | 'error'
let processExitCode = null;
let activeScriptName = PATHS.SCRIPT_DEFAULT;

const sseClients = new Set();
const logHistory = []; // In-memory ring buffer (up to 2000 lines)
const MAX_LOG_HISTORY = 2000;

let currentProgress = {
  stage: 'Idle',
  processed: 0,
  total: 0,
  percent: 0,
  found: 0,
  notFound: 0,
  suspicious: 0,
  errors: 0,
  eta: '--',
  currentItem: '',
  startedAt: null,
  endedAt: null,
  isResumed: false
};

// ─── SSE HELPER ───────────────────────────────────────────────
function sendSseEvent(client, eventType, data) {
  try {
    client.write(`event: ${eventType}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (err) {
    sseClients.delete(client);
  }
}

function broadcast(eventType, data) {
  for (const client of sseClients) {
    sendSseEvent(client, eventType, data);
  }
}

function appendLog(rawText, stream = 'stdout') {
  const timestamp = new Date().toISOString();
  const logItem = {
    id: Date.now() + Math.random().toString(36).substring(2, 6),
    time: timestamp,
    stream,
    text: rawText
  };

  logHistory.push(logItem);
  if (logHistory.length > MAX_LOG_HISTORY) {
    logHistory.shift();
  }

  // Also append to backup log file
  try {
    fs.appendFileSync(PATHS.LOGS_BACKUP, `[${timestamp}] [${stream}] ${rawText}\n`);
  } catch {}

  broadcast('log', logItem);
}

// ─── TERMINAL OUTPUT REGEX PARSER ─────────────────────────────
// Parses the CLI script's rich output format into structured progress
function parseTerminalLine(line) {
  const cleanLine = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
  if (!cleanLine) return;

  let progressUpdated = false;

  // 1. Status bar line:
  // e.g.: "[ HUZAIFA CYBER PROXY ]  30/60 50% ✔12 ✘4 ETA:0h 15m"
  const cyberProxyMatch = cleanLine.match(/\[\s*HUZAIFA CYBER PROXY\s*\]\s+(\d+)\/(\d+)\s+(\d+)%\s+✔(\d+)\s+✘(\d+)\s+ETA:([^\s]+)/i);
  if (cyberProxyMatch) {
    currentProgress.processed = parseInt(cyberProxyMatch[1], 10);
    currentProgress.total = parseInt(cyberProxyMatch[2], 10);
    currentProgress.percent = parseInt(cyberProxyMatch[3], 10);
    currentProgress.found = parseInt(cyberProxyMatch[4], 10);
    currentProgress.notFound = parseInt(cyberProxyMatch[5], 10);
    currentProgress.eta = cyberProxyMatch[6];
    progressUpdated = true;
  }

  // 2. Generic format: "[45%] 30/60 done" or "30/60 [45%]"
  const bracketPctMatch = cleanLine.match(/\[(\d+)%\]\s*(\d+)\/(\d+)/i) || cleanLine.match(/(\d+)\/(\d+)\s*\[(\d+)%\]/i);
  if (bracketPctMatch) {
    const isFirstFormat = cleanLine.includes('%]') && cleanLine.indexOf('%]') < cleanLine.indexOf('/');
    const pct = isFirstFormat ? parseInt(bracketPctMatch[1], 10) : parseInt(bracketPctMatch[3], 10);
    const proc = isFirstFormat ? parseInt(bracketPctMatch[2], 10) : parseInt(bracketPctMatch[1], 10);
    const tot = isFirstFormat ? parseInt(bracketPctMatch[3], 10) : parseInt(bracketPctMatch[2], 10);

    currentProgress.percent = pct;
    currentProgress.processed = proc;
    currentProgress.total = tot;
    progressUpdated = true;
  }

  // 3. URL Header:
  // e.g.: "[1/60] HCP>> https://example.com 12:34:56"
  const urlHeaderMatch = cleanLine.match(/\[(\d+)\/(\d+)\]\s+HCP>>\s+([^\s]+)/i);
  if (urlHeaderMatch) {
    currentProgress.processed = parseInt(urlHeaderMatch[1], 10);
    currentProgress.total = parseInt(urlHeaderMatch[2], 10);
    currentProgress.currentItem = urlHeaderMatch[3];
    if (currentProgress.total > 0) {
      currentProgress.percent = Math.round((currentProgress.processed / currentProgress.total) * 100);
    }
    progressUpdated = true;
  }

  // 4. Initial summary setup:
  // e.g.: "Total URLs   : 100"
  const totalMatch = cleanLine.match(/Total URLs\s*:\s*(\d+)/i);
  if (totalMatch) {
    currentProgress.total = parseInt(totalMatch[1], 10);
    progressUpdated = true;
  }
  const resumeMatch = cleanLine.match(/Resume from\s*:\s*(\d+)\s+already done/i);
  if (resumeMatch) {
    currentProgress.processed = parseInt(resumeMatch[1], 10);
    currentProgress.isResumed = true;
    if (currentProgress.total > 0) {
      currentProgress.percent = Math.round((currentProgress.processed / currentProgress.total) * 100);
    }
    progressUpdated = true;
  }

  // 5. Result line:
  // e.g.: "> [HUZAIFA CYBER PROXY] FOUND: info@example.com [website] 2.1s"
  if (/FOUND:/i.test(cleanLine)) {
    const foundMatch = cleanLine.match(/FOUND:\s*([^\[]+)/i);
    if (foundMatch) {
      currentProgress.lastFound = foundMatch[1].trim();
      currentProgress.stage = 'Email Discovered';
      progressUpdated = true;
    }
  }

  // 6. Suspicious / detail stats:
  // e.g.: "📧 Emails: 2 | 🚩 Suspicious: 1 | 📞 Phones: 1"
  const detailMatch = cleanLine.match(/Emails:\s*(\d+)\s*\|\s*🚩\s*Suspicious:\s*(\d+)/i);
  if (detailMatch) {
    const susp = parseInt(detailMatch[2], 10);
    if (susp > 0) {
      currentProgress.suspicious += susp;
      progressUpdated = true;
    }
  }

  // 7. Stage indicators
  if (/FB Browser launch/i.test(cleanLine)) {
    currentProgress.stage = 'FB Browser Launch';
    progressUpdated = true;
  } else if (/FB fresh login/i.test(cleanLine) || /FB login check/i.test(cleanLine)) {
    currentProgress.stage = 'Facebook Authentication';
    progressUpdated = true;
  } else if (/FB direct:/i.test(cleanLine)) {
    currentProgress.stage = 'Checking Facebook Direct Link';
    progressUpdated = true;
  } else if (/FB search:/i.test(cleanLine)) {
    currentProgress.stage = 'Searching Facebook Pages';
    progressUpdated = true;
  } else if (/CF decoded/i.test(cleanLine)) {
    currentProgress.stage = 'Decoded Cloudflare Protection';
    progressUpdated = true;
  } else if (/🔍/i.test(cleanLine)) {
    currentProgress.stage = 'Crawling Website Pages';
    progressUpdated = true;
  } else if (/MISSION COMPLETE/i.test(cleanLine)) {
    currentProgress.stage = 'Completed';
    currentProgress.percent = 100;
    progressUpdated = true;
  }

  if (progressUpdated) {
    broadcast('progress', currentProgress);
  }
}

// ─── FILE INSPECTION HELPERS ──────────────────────────────────
function getFileInfo(filename) {
  const filePath = path.join(process.cwd(), filename);
  if (!fs.existsSync(filePath)) {
    return { exists: false, size: 0, rows: 0, mtime: null };
  }
  try {
    const stat = fs.statSync(filePath);
    let rows = 0;
    if (filename.endsWith('.csv')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      rows = lines.length > 0 ? lines.length - 1 : 0; // exclude header
    } else if (filename.endsWith('.json')) {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      rows = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    }
    return {
      exists: true,
      size: stat.size,
      rows,
      mtime: stat.mtime
    };
  } catch {
    return { exists: true, size: 0, rows: 0, mtime: null };
  }
}

function getCheckpointStats() {
  const cacheInfo = getFileInfo(PATHS.CACHE);
  const inputInfo = getFileInfo(PATHS.INPUT);
  const outputInfo = getFileInfo(PATHS.OUTPUT);
  const suspiciousInfo = getFileInfo(PATHS.SUSPICIOUS);

  return {
    hasCheckpoint: cacheInfo.exists && cacheInfo.rows > 0,
    cachedUrls: cacheInfo.rows,
    totalInputUrls: inputInfo.rows,
    outputRows: outputInfo.rows,
    suspiciousRows: suspiciousInfo.rows,
    canResume: cacheInfo.exists && cacheInfo.rows > 0 && inputInfo.exists
  };
}

// ─── API ENDPOINTS ────────────────────────────────────────────

// 1. Health check & status
app.get('/api/status', (req, res) => {
  const checkpoint = getCheckpointStats();
  res.json({
    status: processStatus,
    isRunning: processStatus === 'running',
    exitCode: processExitCode,
    script: activeScriptName,
    progress: currentProgress,
    checkpoint,
    files: {
      input: getFileInfo(PATHS.INPUT),
      output: getFileInfo(PATHS.OUTPUT),
      suspicious: getFileInfo(PATHS.SUSPICIOUS),
      cache: getFileInfo(PATHS.CACHE),
      session: getFileInfo(PATHS.SESSION)
    }
  });
});

// 2. Server-Sent Events stream
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  res.write(': sse-connected\n\n');
  sseClients.add(res);

  // Send initial snapshot
  sendSseEvent(res, 'init', {
    status: processStatus,
    exitCode: processExitCode,
    script: activeScriptName,
    progress: currentProgress,
    checkpoint: getCheckpointStats()
  });

  // Send recent log history so client doesn't see a blank terminal
  const recentLogs = logHistory.slice(-200);
  for (const logItem of recentLogs) {
    sendSseEvent(res, 'log', logItem);
  }

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 3. Upload input file (input.csv)
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });

    if (records.length === 0) {
      return res.status(400).json({ error: 'Uploaded CSV is empty' });
    }

    const columns = Object.keys(records[0]);
    const urlCol = columns.find(k =>
      ['url', 'website', 'link', 'domain', 'site'].includes(k.toLowerCase())
    );

    appendLog(`Uploaded input file '${req.file.originalname}' (${records.length} records, URL column: '${urlCol || "none"}')`, 'stdout');

    res.json({
      success: true,
      filename: req.file.filename,
      totalRows: records.length,
      columns,
      urlColumn: urlCol || null,
      preview: records.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to process uploaded file: ${err.message}` });
  }
});

// 4. Direct URLs input (generate input.csv on the fly)
app.post('/api/input-urls', (req, res) => {
  try {
    const { urls } = req.body;
    if (!urls || (!Array.isArray(urls) && typeof urls !== 'string')) {
      return res.status(400).json({ error: 'urls must be an array of strings or newline-separated text' });
    }

    const list = Array.isArray(urls)
      ? urls.map(u => String(u).trim()).filter(Boolean)
      : urls.split('\n').map(u => u.trim()).filter(Boolean);

    if (list.length === 0) {
      return res.status(400).json({ error: 'No valid URLs provided' });
    }

    const csvContent = 'url\n' + list.map(u => `"${u.replace(/"/g, '""')}"`).join('\n') + '\n';
    fs.writeFileSync(path.join(process.cwd(), PATHS.INPUT), csvContent, 'utf8');

    appendLog(`Generated ${PATHS.INPUT} with ${list.length} URLs directly from dashboard`, 'stdout');

    res.json({
      success: true,
      totalRows: list.length,
      preview: list.slice(0, 5)
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to write input.csv: ${err.message}` });
  }
});

// 5. Start CLI Script in background
app.post('/api/start', (req, res) => {
  if (processStatus === 'running' && activeProcess) {
    return res.status(409).json({ error: 'A script is already running' });
  }

  const {
    scriptName = PATHS.SCRIPT_DEFAULT,
    args = [],
    resume = true,
    clearCache = false,
    env = {}
  } = req.body;

  const scriptPath = path.join(process.cwd(), scriptName);
  if (!fs.existsSync(scriptPath)) {
    return res.status(404).json({ error: `Script file '${scriptName}' not found in workspace` });
  }

  const inputPath = path.join(process.cwd(), PATHS.INPUT);
  if (!fs.existsSync(inputPath)) {
    return res.status(400).json({ error: `Input file '${PATHS.INPUT}' not found. Please upload or paste URLs first.` });
  }

  // Handle checkpoint reset if explicitly requested
  if (clearCache) {
    const cachePath = path.join(process.cwd(), PATHS.CACHE);
    if (fs.existsSync(cachePath)) {
      const backupPath = path.join(process.cwd(), `cache_backup_${Date.now()}.json`);
      try {
        fs.renameSync(cachePath, backupPath);
        appendLog(`Archived previous checkpoint to ${path.basename(backupPath)} to start fresh.`, 'stdout');
      } catch {}
    }
  }

  // Reset or prepare progress state
  const checkpoint = getCheckpointStats();
  currentProgress = {
    stage: 'Initializing',
    processed: checkpoint.hasCheckpoint && resume ? checkpoint.cachedUrls : 0,
    total: checkpoint.totalInputUrls,
    percent: checkpoint.totalInputUrls > 0 && checkpoint.hasCheckpoint && resume
      ? Math.round((checkpoint.cachedUrls / checkpoint.totalInputUrls) * 100)
      : 0,
    found: 0,
    notFound: 0,
    suspicious: 0,
    errors: 0,
    eta: '--',
    currentItem: '',
    startedAt: new Date().toISOString(),
    endedAt: null,
    isResumed: checkpoint.hasCheckpoint && resume
  };

  processStatus = 'running';
  processExitCode = null;
  activeScriptName = scriptName;

  appendLog(`══════════════════════════════════════════════════════`, 'stdout');
  appendLog(`[DASHBOARD] Spawning: node ${scriptName} ${args.join(' ')}`, 'stdout');
  appendLog(`[DASHBOARD] Mode: ${currentProgress.isResumed ? 'RESUME FROM CHECKPOINT' : 'NEW RUN'}`, 'stdout');
  appendLog(`══════════════════════════════════════════════════════`, 'stdout');

  broadcast('status', { status: 'running', script: scriptName });
  broadcast('progress', currentProgress);

  // Spawn child process with unbuffered output
  const scriptArgs = Array.isArray(args) ? args : [];
  const customEnv = {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    NODE_DISABLE_COLORS: '0', // Preserve ANSI colors for our web terminal
    FORCE_COLOR: '3',
    ...env
  };

  try {
    activeProcess = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: process.cwd(),
      env: customEnv,
      stdio: ['pipe', 'pipe', 'pipe']
    });
  } catch (err) {
    processStatus = 'error';
    appendLog(`Failed to spawn child process: ${err.message}`, 'stderr');
    broadcast('status', { status: 'error', error: err.message });
    return res.status(500).json({ error: `Spawn error: ${err.message}` });
  }

  // Handle stdout
  activeProcess.stdout.on('data', chunk => {
    const text = chunk.toString();
    // Split by carriage return and newline for terminal emulation
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.length > 0);
    for (const line of lines) {
      appendLog(line, 'stdout');
      parseTerminalLine(line);
    }
  });

  // Handle stderr
  activeProcess.stderr.on('data', chunk => {
    const text = chunk.toString();
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.length > 0);
    for (const line of lines) {
      appendLog(line, 'stderr');
      parseTerminalLine(line);
    }
  });

  // Handle process completion / exit
  activeProcess.on('close', (code, signal) => {
    processExitCode = code;
    processStatus = code === 0 ? 'completed' : 'stopped';
    currentProgress.endedAt = new Date().toISOString();
    currentProgress.stage = code === 0 ? 'Completed' : `Exited (${signal || code})`;

    appendLog(`══════════════════════════════════════════════════════`, 'stdout');
    appendLog(`[DASHBOARD] Process exited with code ${code}${signal ? ` (signal: ${signal})` : ''}`, 'stdout');
    appendLog(`══════════════════════════════════════════════════════`, 'stdout');

    activeProcess = null;
    broadcast('status', { status: processStatus, exitCode: code });
    broadcast('progress', currentProgress);
  });

  activeProcess.on('error', err => {
    processStatus = 'error';
    appendLog(`[DASHBOARD ERROR] ${err.message}`, 'stderr');
    activeProcess = null;
    broadcast('status', { status: 'error', error: err.message });
  });

  res.json({
    success: true,
    pid: activeProcess.pid,
    script: scriptName,
    resumed: currentProgress.isResumed
  });
});

// 6. Stop / Abort running process
app.post('/api/stop', (req, res) => {
  if (!activeProcess || processStatus !== 'running') {
    return res.status(400).json({ error: 'No process is currently running' });
  }

  appendLog('[DASHBOARD] Stop requested by user. Terminating process...', 'stderr');

  try {
    // Send SIGINT first to allow graceful cleanup / cache flush, then SIGTERM
    activeProcess.kill('SIGINT');
    setTimeout(() => {
      if (activeProcess && !activeProcess.killed) {
        try { activeProcess.kill('SIGKILL'); } catch {}
      }
    }, 2500);

    processStatus = 'stopped';
    broadcast('status', { status: 'stopped' });
    res.json({ success: true, message: 'Process termination signal sent' });
  } catch (err) {
    res.status(500).json({ error: `Failed to terminate process: ${err.message}` });
  }
});

// 7. Clear terminal logs in memory
app.post('/api/clear-logs', (req, res) => {
  logHistory.length = 0;
  broadcast('clear_logs', {});
  res.json({ success: true });
});

// 8. Download Output Files
app.get('/api/download/:type', (req, res) => {
  const type = req.params.type.toLowerCase();
  let targetFile = null;
  let downloadName = null;

  switch (type) {
    case 'output':
      targetFile = PATHS.OUTPUT;
      downloadName = 'output.csv';
      break;
    case 'suspicious':
      targetFile = PATHS.SUSPICIOUS;
      downloadName = 'suspicious.csv';
      break;
    case 'cache':
      targetFile = PATHS.CACHE;
      downloadName = 'cache.json';
      break;
    case 'input':
      targetFile = PATHS.INPUT;
      downloadName = 'input.csv';
      break;
    case 'logs':
      targetFile = PATHS.LOGS_BACKUP;
      downloadName = `scraper_run_${Date.now()}.log`;
      break;
    default:
      return res.status(400).json({ error: 'Invalid file type requested' });
  }

  const filePath = path.join(process.cwd(), targetFile);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: `File '${targetFile}' does not exist yet. Run the script first.` });
  }

  res.download(filePath, downloadName);
});

// 9. Preview Output CSV / Suspicious CSV in JSON
app.get('/api/preview/:type', (req, res) => {
  const type = req.params.type.toLowerCase();
  const targetFile = type === 'suspicious' ? PATHS.SUSPICIOUS : PATHS.OUTPUT;
  const filePath = path.join(process.cwd(), targetFile);

  if (!fs.existsSync(filePath)) {
    return res.json({ exists: false, rows: [] });
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const records = parse(content, { columns: true, skip_empty_lines: true, trim: true });
    res.json({
      exists: true,
      totalCount: records.length,
      rows: records.slice(-50).reverse() // Show latest 50 records
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to parse file: ${err.message}` });
  }
});

// 9.5 Quick single-URL scrape (Direct crawler integration for dashboard)
app.post('/api/quick-scrape', async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid URL is required' });
  }

  const targetUrl = url.startsWith('http') ? url : `https://${url}`;
  appendLog(`[QUICK SCRAPE] Crawling target: ${targetUrl}`, 'stdout');

  try {
    const response = await axios.get(targetUrl, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const emails = new Set();
    const phones = new Set();

    // 1. Mailto links
    $('a[href^="mailto:"]').each((_, el) => {
      const e = ($(el).attr('href') || '').replace(/^mailto:/i, '').split('?')[0].trim();
      if (e && e.includes('@')) emails.add(e.toLowerCase());
    });

    // 2. Tel links
    $('a[href^="tel:"]').each((_, el) => {
      const p = ($(el).attr('href') || '').replace(/^tel:/i, '').trim();
      if (p) phones.add(p);
    });

    // 3. Regex scan
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const matches = (typeof html === 'string' ? html : '').match(emailRegex) || [];
    const blacklist = ['example.com', 'test.com', 'domain.com', 'wixpress.com', 'sentry.io', 'png', 'jpg', 'svg', 'webp'];
    for (const m of matches) {
      const low = m.toLowerCase();
      if (!blacklist.some(b => low.includes(b))) {
        emails.add(low);
      }
    }

    const emailList = [...emails];
    const phoneList = [...phones];

    // Append to output.csv
    const outputPath = path.join(process.cwd(), PATHS.OUTPUT);
    const hasOutput = fs.existsSync(outputPath);
    const row = `"${targetUrl.replace(/"/g, '""')}","${emailList.join('; ')}","${phoneList.join('; ')}","quick-crawl","${new Date().toISOString()}"\n`;

    if (!hasOutput) {
      fs.writeFileSync(outputPath, 'url,email,phone,source,timestamp\n' + row, 'utf8');
    } else {
      fs.appendFileSync(outputPath, row, 'utf8');
    }

    appendLog(`[QUICK SCRAPE] Result for ${targetUrl}: Found ${emailList.length} email(s) [${emailList.join(', ')}]`, 'stdout');

    res.json({
      success: true,
      url: targetUrl,
      emails: emailList,
      phones: phoneList,
      source: 'live-web-crawl'
    });
  } catch (err) {
    appendLog(`[QUICK SCRAPE ERROR] ${targetUrl}: ${err.message}`, 'stderr');
    res.status(500).json({ error: `Failed to scrape website: ${err.message}` });
  }
});

// 10. Self-test endpoint to run pure unit validation
app.post('/api/selftest', (req, res) => {
  const scriptPath = path.join(process.cwd(), PATHS.SCRIPT_DEFAULT);
  if (!fs.existsSync(scriptPath)) {
    return res.status(404).json({ error: 'email-scraper.js not found' });
  }

  appendLog('[DASHBOARD] Running self-test suite (--selftest)...', 'stdout');
  const child = spawn(process.execPath, [scriptPath, '--selftest'], { cwd: process.cwd() });

  let out = '';
  child.stdout.on('data', d => {
    const s = d.toString();
    out += s;
    appendLog(s, 'stdout');
  });
  child.stderr.on('data', d => {
    const s = d.toString();
    out += s;
    appendLog(s, 'stderr');
  });

  child.on('close', code => {
    res.json({ success: code === 0, exitCode: code, output: out });
  });
});

// ─── SERVE FRONTEND (dist/ if built, otherwise public/index.html or index.html) ───
const distDir = path.join(process.cwd(), 'dist');
const publicDir = path.join(process.cwd(), 'public');

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Fallback route for SPA
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  
  // 1. Check built React app
  const distIndex = path.join(distDir, 'index.html');
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }

  // 2. Check public/index.html
  const publicIndex = path.join(publicDir, 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }

  // 3. Check root index.html
  const rootIndex = path.join(process.cwd(), 'index.html');
  if (fs.existsSync(rootIndex)) {
    return res.sendFile(rootIndex);
  }

  res.status(404).send('Dashboard UI index.html not found');
});

// Start Server
const serverInstance = app.listen(PORT, HOST, () => {
  console.log(`\n⚡ [DASHBOARD SERVER] Running at http://localhost:${PORT}`);
  console.log(`📁 Workspace: ${process.cwd()}`);
  console.log(`🔗 Open the URL in your browser to monitor the script.\n`);
});

module.exports = app;

