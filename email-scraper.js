// ═══════════════════════════════════════════════════════════════
//   [ HUZAIFA CYBER PROXY ] — EMAIL SCRAPER ULTIMATE
//   Website → CloudFlare → FB Direct → FB Search
//   STABLE MODE | Crash-Safe | Resume | Hacker UI
//   ── v2: JSON-LD, attributes, text-node extraction, [at]/[dot],
//          email source + confidence, suspicious tracking,
//          multi-row cache restore ──
// ═══════════════════════════════════════════════════════════════

const axios         = require('axios');
const cheerio       = require('cheerio');
const puppeteer     = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs            = require('fs');
const { parse }     = require('csv-parse/sync');

const { stringify } = require('csv-stringify/sync');

puppeteer.use(StealthPlugin());

// ─── COLORS ────────────────────────────────────────────────
const C = {
  reset:'\x1b[0m', bright:'\x1b[1m',
  red:'\x1b[31m',  green:'\x1b[32m', yellow:'\x1b[33m',
  blue:'\x1b[34m', magenta:'\x1b[35m',cyan:'\x1b[36m',
  white:'\x1b[37m',gray:'\x1b[90m',  black:'\x1b[30m',
};
const clr = (t,...cs) => cs.map(c=>C[c]||'').join('')+t+C.reset;

// ─── CONFIG — STABLE MIDDLE GROUND ─────────────────────────
// Target: 1000 URLs in 3-4 hours = ~12s avg per URL
const CONFIG = {
  INPUT_FILE:      'input.csv',
  OUTPUT_FILE:     'output.csv',
  SUSPICIOUS_FILE: 'suspicious.csv',
  CACHE_FILE:      'cache.json',
  SESSION_FILE:    'fb-session.json',

  REQUEST_TIMEOUT: 12000,   // 12s web timeout
  CONCURRENCY:     2,       // 2 parallel (stable)
  RETRY_ATTEMPTS:  1,

  PRIORITY_PAGES: [
    '/contact','/contact-us','/about','/about-us',
    '/team','/reach-us','/get-in-touch','/info',
  ],
  CONTACT_KEYWORDS: ['contact','about','reach','touch','connect','enquir'],

  FB_EMAIL:    process.env.FB_EMAIL    || '03177155380',
  FB_PASSWORD: process.env.FB_PASSWORD || '@khan4747Hk',
  FB_HEADLESS: false,

  // ⚖️  MIDDLE GROUND DELAYS — na bohot fast na bohot slow
  DELAY_TYPING:    { min: 70,  max: 120  }, // human typing
  DELAY_PAGE_LOAD: { min: 2500, max: 3500 }, // FB page load wait
  DELAY_WEB:       { min: 200,  max: 500  }, // between web requests
  DELAY_BETWEEN:   { min: 500,  max: 1200 }, // between URLs
  DELAY_FB_SEARCH: { min: 4000, max: 6000 }, // FB search results wait
  DELAY_FB_ABOUT:  { min: 3000, max: 4500 }, // FB about page wait
  DELAY_FB_NAV:    { min: 1500, max: 2500 }, // between FB pages

  FB_TIMEOUT:  30000,  // 30s FB timeout
  WEB_TIMEOUT: 12000,
};

// ─── PATTERNS ──────────────────────────────────────────────
// Strict email regex — must start with a letter, not digit/symbol.
// (Still used inside the Facebook page.evaluate sandbox.)
const EMAIL_REGEX = /(?<![0-9.\-+])(?<![A-Za-z0-9._%+\-]{0,30}[0-9]{4,})[a-zA-Z][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Permissive finder — captures glued junk too; normalizeEmail() cleans it afterwards.
const EMAIL_FIND  = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
// Loose phone regex — used separately for the phone column only
const PHONE_REGEX = /(\+?1?\s?)?(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})/g;

const EMAIL_BLACKLIST = [
  'example.com','test.com','domain.com','email.com','youremail.com',
  'sentry.io','wixpress.com','schema.org','facebook.com','fb.com',
  'instagram.com','twitter.com','linkedin.com','tiktok.com',
  'wordpress','jquery','bootstrap','google','apple','microsoft',
  'png','jpg','jpeg','gif','svg','webp','css','js','woff','ttf',
];
const FB_SOCIAL = /facebook\.com\/(?!share|sharer|dialog|login|help|policies|groups\/|events\/|marketplace|watch|gaming|ads|pages\/create)([^/?#"'\s]+)/i;

// Known typo TLDs / provider domains — FLAGGED as suspicious, never auto-corrected.
const SUSPICIOUS_TLDS = new Set([
  'con','cmo','vom','comm','ocm','xom','coom','cim','clm','coon','nte','ogr','orgg',
]);
const SUSPICIOUS_DOMAINS = new Set([
  'gmial.com','gmai.com','gmil.com','gmail.co','gmail.con','gmaill.com',
  'hotmial.com','hotmai.com','hotmal.com','yaho.com','yahooo.com','outlok.com',
]);

// ─── STATS ─────────────────────────────────────────────────
const STATS = {
  total:0, processed:0, found:0,
  fromWeb:0, fromFbDirect:0, fromFbSearch:0,
  notFound:0, errors:0, suspicious:0, startTime: Date.now(),
};

// ─── UTILS ─────────────────────────────────────────────────
const rInt   = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const sleep  = ms => new Promise(r=>setTimeout(r,ms));
const rSleep = r => sleep(rInt(r.min,r.max));
const confRank = c => ({ high:3, medium:2, low:1 })[c] || 0;

function normalizeUrl(url) {
  url = url.trim();
  if (!url.startsWith('http')) url = 'https://'+url;
  return url.replace(/\/$/,'');
}
function getBusinessName(url) {
  try {
    return new URL(url).hostname.replace('www.','').split('.')[0]
      .replace(/[-_]/g,' ')
      .replace(/\b(inc|llc|ltd|co|corp|group)\b/gi,'')
      .trim();
  } catch { return url; }
}

// ─── ENTITY / ESCAPE DECODER ───────────────────────────────
// Fixes the "u003e…" prefix bug: sites encode ">" as \u003e; when the
// backslash is lost upstream you get a literal "u003e" glued to the email.
function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    // \u003e style escapes (backslash still present)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // leftover escapes whose backslash was stripped: u003e, u0040 …
    .replace(/u00([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    // numeric HTML entities: &#64;  &#x40;
    .replace(/&#x([0-9a-fA-F]+);?/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g,           (_, d) => String.fromCharCode(parseInt(d, 10)))
    // named entities that show up around emails
    .replace(/&gt;/gi, '>').replace(/&lt;/gi, '<')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&nbsp;/gi, ' ');
}

// ─── DE-OBFUSCATOR — turns "name [at] domain [dot] com" into an email ───
function deobfuscateText(text) {
  let t = String(text);
  // bracketed forms: (at) [at] {at} <at>  /  (dot) [dot] {dot} <dot>
  t = t.replace(/\s*[\[\](){}<>]\s*at\s*[\[\](){}<>]\s*/gi, '@');
  t = t.replace(/\s*[\[\](){}<>]\s*dot\s*[\[\](){}<>]\s*/gi, '.');
  // spelled-out unbracketed form, only when it forms a full email
  t = t.replace(/([a-z0-9._%+\-]+)\s+at\s+([a-z0-9.\-]+)\s+dot\s+([a-z]{2,})/gi, '$1@$2.$3');
  return t;
}

// ─── EMAIL NORMALIZER ──────────────────────────────────────
// Returns { email, suspicious, reason } or null.
//   • conservative "u003e" decode              (repaired, kept)
//   • conservative phone-prefix strip          (repaired, kept)
//   • TLD/domain typos (.con etc.)             (FLAGGED suspicious, NOT changed)
function normalizeEmail(raw) {
  if (!raw) return null;
  const original = String(raw).trim();

  let e = decodeEntities(original).trim();
  e = e.replace(/^mailto:/i, '').split('?')[0].trim();
  if (!e.includes('@')) return null;

  // drop trailing glued words (Opens, PHONE, TEL, …)
  e = e.replace(/(Opens|PHONE|TEL|FAX|MOB|MOBILE|CALL|CONTACT|EMAIL|GMAIL|HOTMAIL)\s*$/i, '').trim();

  // grab the maximal local@domain candidate (digits allowed so a glued phone
  // is captured whole, then cleaned below)
  const m = e.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  if (!m) return null;

  let [local, domain] = m[0].split('@');
  if (!local || !domain) return null;

  const reasons = [];
  if (/^u00[0-9a-fA-F]{2}/i.test(original)) reasons.push('decoded-escape');

  // strip a phone number glued to the FRONT of the local part:
  //   usa2527283899info → info      |      il773.276.8888hello → hello
  const beforePhone = local;
  local = local.replace(/^[a-z]{0,4}\+?\d[\d.\-\s]{7,}\d(?=[a-z])/i, '');
  if (/\d{5,}/.test(local)) {
    const tail = local.replace(/^.*\d{4,}/, '');
    if (/^[a-z][a-z0-9._%+\-]*$/i.test(tail)) local = tail;
  }
  if (local !== beforePhone) reasons.push('stripped-phone-prefix');

  local = local.replace(/^[._%+\-]+/, '').replace(/[._%+\-]+$/, '');
  if (!/^[a-zA-Z]/.test(local)) return null;
  if (local.length < 1 || local.length > 64) return null;

  // domain validation — DO NOT auto-repair typos, only flag them
  domain = domain.toLowerCase().replace(/^\.+|\.+$/g, '');
  if (!domain.includes('.')) return null;
  const tld = domain.split('.').pop();
  if (tld.length < 2 || tld.length > 10) return null;
  if (/^\d+$/.test(domain.replace(/\./g, ''))) return null;

  let suspicious = false;
  if (SUSPICIOUS_TLDS.has(tld))       { suspicious = true; reasons.push('suspicious-tld:.'+tld); }
  if (SUSPICIOUS_DOMAINS.has(domain)) { suspicious = true; reasons.push('suspicious-domain:'+domain); }

  return {
    email: (local + '@' + domain).toLowerCase(),
    suspicious,
    reason: reasons.join('; '),
  };
}

// ─── CANDIDATE REFINER — normalize, blacklist, dedupe, split suspicious ───
// Input:  [{ raw, source, confidence, page }]
// Output: { clean:[cand], suspicious:[cand] }   (cand has email/source/confidence/suspicious/reason/page)
function refineCandidates(cands) {
  const best = new Map(); // email -> chosen candidate (highest confidence wins)
  for (const c of cands) {
    const n = normalizeEmail(c.raw);
    if (!n) continue;
    if (EMAIL_BLACKLIST.some(b => n.email.includes(b))) continue;

    const cand = {
      email:      n.email,
      source:     c.source || '',
      confidence: c.confidence || 'low',
      suspicious: n.suspicious,
      reason:     n.reason,
      page:       c.page || '',
    };
    const prev = best.get(n.email);
    if (!prev || confRank(cand.confidence) > confRank(prev.confidence)) best.set(n.email, cand);
  }
  const all = [...best.values()];
  return {
    clean:      all.filter(c => !c.suspicious),
    suspicious: all.filter(c =>  c.suspicious),
  };
}

function filterPhones(arr) {
  return [...new Set(arr.filter(p => {
    const d = String(p).replace(/\D/g,'');
    return d.length >= 10 && d.length <= 15;
  }))];
}

function eta() {
  const elapsed = (Date.now() - STATS.startTime) / 1000;
  const rate    = STATS.processed / elapsed;
  const rem     = STATS.total - STATS.processed;
  const etaSec  = rate > 0 ? rem / rate : 0;
  const h = Math.floor(etaSec/3600);
  const m = Math.floor((etaSec%3600)/60);
  return `${h}h ${m}m`;
}

// ─── CRASH SAFE ────────────────────────────────────────────
function loadCache() {
  if (!fs.existsSync(CONFIG.CACHE_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG.CACHE_FILE,'utf8')); }
  catch { return {}; }
}
function saveCache(cache) {
  try {
    const t = CONFIG.CACHE_FILE+'.tmp';
    fs.writeFileSync(t, JSON.stringify(cache,null,2));
    fs.renameSync(t, CONFIG.CACHE_FILE);
  } catch { try { fs.writeFileSync(CONFIG.CACHE_FILE, JSON.stringify(cache,null,2)); } catch {} }
}
function saveOutput(results) {
  try {
    const t = CONFIG.OUTPUT_FILE+'.tmp';
    fs.writeFileSync(t, stringify(results,{header:true}));
    fs.renameSync(t, CONFIG.OUTPUT_FILE);
  } catch { try { fs.writeFileSync(CONFIG.OUTPUT_FILE, stringify(results,{header:true})); } catch {} }
}

// ─── SUSPICIOUS STORE (saved separately) ───────────────────
const suspiciousResults = [];
function loadSuspicious() {
  if (!fs.existsSync(CONFIG.SUSPICIOUS_FILE)) return;
  try {
    const rows = parse(fs.readFileSync(CONFIG.SUSPICIOUS_FILE,'utf8'),
      { columns:true, skip_empty_lines:true, trim:true });
    suspiciousResults.push(...rows);
  } catch {}
}
function saveSuspicious() {
  if (!suspiciousResults.length) return;
  try {
    const t = CONFIG.SUSPICIOUS_FILE+'.tmp';
    fs.writeFileSync(t, stringify(suspiciousResults,{header:true}));
    fs.renameSync(t, CONFIG.SUSPICIOUS_FILE);
  } catch { try { fs.writeFileSync(CONFIG.SUSPICIOUS_FILE, stringify(suspiciousResults,{header:true})); } catch {} }
}
function recordSuspicious(url, biz, list, channel) {
  if (!list || !list.length) return;
  const now = new Date().toISOString();
  const seen = new Set(suspiciousResults.map(r => r.url + '|' + r.email));
  for (const c of list) {
    const key = url + '|' + c.email;
    if (seen.has(key)) continue;
    seen.add(key);
    suspiciousResults.push({
      url,
      business_name: biz,
      email:         c.email,
      email_source:  c.source,
      confidence:    c.confidence,
      reason:        c.reason,
      source_page:   c.page || '',
      channel,
      scraped_at:    now,
    });
    STATS.suspicious++;
  }
  saveSuspicious();
}

// ══════════════════════════════════════════════════════════
//  HACKER ASCII UI
// ══════════════════════════════════════════════════════════
const MX = '01アイウエオカキクケコ@#$%<>[]{}?!';
const mx  = n => Array.from({length:n},()=>MX[Math.floor(Math.random()*MX.length)]).join('');

// Mini Cicada butterfly — cycles line by line in the status bar
const _B = '\x1b[38;2;80;140;255m';   // blue
const _W = '\x1b[38;2;200;220;255m';  // white-blue
const _C = '\x1b[38;2;100;200;255m';  // cyan
const _D = '\x1b[2m';                  // dim
const _R = '\x1b[0m';                  // reset
const HACKER_LINES = [
  `${_D}${_W}  ·  ✦  ·  ✦  ·  ${_R}`,
  `${_W} ▄▀▀▄${_B}╬${_W}▄▀▀▄ ${_R}`,
  `${_W}▓${_B}░▄███▄░${_W}▓${_R}`,
  `${_B}▓╬${_W}◈${_B}╬╬╬${_W}◈${_B}╬▓${_R}`,
  `${_B} ▀╬╬╬╬╬╬╬▀ ${_R}`,
  `${_B}  ▄${_W}█████${_B}▄  ${_R}`,
  `${_B} ▓╬${_W}▀███▀${_B}╬▓ ${_R}`,
  `${_B}  ╬╬╬╬╬╬╬  ${_R}`,
  `${_B} ▄╬╬╬╬╬╬╬▄ ${_R}`,
  `${_W}▀▄${_B}╬╬╬╬╬${_W}▄▀${_R}`,
  `${_D}${_W}▀▀▄▄▄▄▄▀▀ ${_R}`,
  `${_C}  ≡ CICADA ≡  ${_R}`,
];

let cyberInt   = null;
let hackerLine = 0;
let frameCount = 0;

function drawCyberPanel() {
  frameCount++;
  const pct  = STATS.total > 0 ? Math.round((STATS.processed/STATS.total)*100) : 0;


  const name = clr('[ HUZAIFA CYBER PROXY ]', 'green','bright');
  const proc = clr(`${STATS.processed}/${STATS.total}`, 'cyan','bright');
  const pctS = clr(`${pct}%`, 'yellow','bright');
  const fnd  = clr(`✔${STATS.found}`, 'green','bright');
  const nf   = clr(`✘${STATS.notFound}`, 'red');
  const etaS = clr(`ETA:${eta()}`, 'gray');

  // Hacker figure line (cycle through)
  const fig  = clr(HACKER_LINES[hackerLine % HACKER_LINES.length], 'green');
  if (frameCount % 3 === 0) hackerLine++;

  process.stdout.write(
    `\r  ${name}  ${proc} ${pctS} ${fnd} ${nf} ${etaS}  ${fig}  `
  );
}

function startCyberUI() {
  cyberInt = setInterval(drawCyberPanel, 180);
}
function stopCyberUI() {
  if (cyberInt) clearInterval(cyberInt);
  console.log('');
}

// Per URL header
function urlHeader(url, idx) {
  const t   = clr(new Date().toLocaleTimeString(), 'gray');
  const hcp = clr('HCP>>', 'green','bright');
  const idS = clr(`[${idx}/${STATS.total}]`, 'cyan');

  const u   = clr(url.length > 55 ? url.slice(0,55)+'...' : url, 'white','bright');
  console.log(`\n ${idS} ${hcp} ${u} ${t}`);
}

// Per URL result
function urlResult(biz, emails, source, elapsed) {
  const hcp = clr('[HUZAIFA CYBER PROXY]', 'green','bright');
  const e   = clr(`${elapsed}s`, 'gray');
  if (emails.length > 0) {
    console.log(` ${clr('>','green','bright')} ${hcp} ${clr('FOUND:','green','bright')} ${clr(emails.join(' | '),'green','bright')} ${clr('['+source+']','gray')} ${e}`);
  } else {
    console.log(` ${clr('>','red')} ${hcp} ${clr('NOT FOUND','red')} ${clr('['+biz+']','gray')} ${e}`);
  }
}

// Simple log
function log(msg, type='INFO') {
  if (['SKIP','HUMAN'].includes(type)) return;
  const t = clr(new Date().toLocaleTimeString(), 'gray');
  const map = {
    INFO:'white', OK:'green', ERROR:'red', WARN:'yellow',
    FOUND:'green', FB:'blue', WEB:'cyan', CF:'magenta',
  };
  console.log(` ${t}  ${clr(msg, map[type]||'white')}`);
}

// ─── BANNER ────────────────────────────────────────────────
function printBanner() {
  // 24-bit ANSI color helpers
  const rgb  = (r,g,b) => `\x1b[38;2;${r};${g};${b}m`;
  const bgRgb= (r,g,b) => `\x1b[48;2;${r};${g};${b}m`;
  const RST  = '\x1b[0m';
  const BOLD = '\x1b[1m';
  const DIM  = '\x1b[2m';

  // Palette
  const W    = rgb(220,230,255);          // bright white-blue
  const B1   = rgb(80,140,255);           // bright blue
  const B2   = rgb(40,90,200);            // mid blue
  const B3   = rgb(20,50,140);            // dark blue
  const CY   = rgb(100,200,255);          // cyan accent
  const GR   = rgb(130,150,180);          // gray-blue
  const DGR  = rgb(60,70,100);            // dark gray

  const w = (process.stdout.columns || 100);
  const pad = (s, total) => {
    const visLen = s.replace(/\x1b\[[^m]*m/g,'').length;
    const left   = Math.max(0, Math.floor((total - visLen) / 2));
    return ' '.repeat(left) + s;
  };
  const ln = (s) => console.log(pad(s, w));

  console.clear();
  console.log('');

  // ── OUTER BORDER TOP ──
  ln(`${B2}╔${'═'.repeat(91)}╗${RST}`);
  ln(`${B2}║${' '.repeat(91)}║${RST}`);

  // ── BINARY SIDES + BUTTERFLY ROWS ──
  const BIN = [
    ['00100010 01000110 01100101','01101100 01101110 01101111'],
    ['01100001 01110010 01101110','00100000 01010031 01100031'],
    ['01101111 01110100 00101100','01110010 01100001 01110030'],
    ['00100000 01001000 01100101','01100101 01110010 00101110'],
  ];

  const BUTTERFLY = [
    `${DIM}${W}          ·  ·  ✦  ·  ✦  ·  ✦  ·  ·          ${RST}`,
    `${W}      ░▒▓ ▄▀▀▀▀▀▄ ░${B1}✦${W}░ ▄▀▀▀▀▀▄ ▓▒░      ${RST}`,
    `${W}    ▒▓█ ▄█▀░░▄▄░░▀█▄${B1}╬${W}▄█▀░░▄▄░░▀█▄ █▓▒    ${RST}`,
    `${W}   ▓██▄▀█▓░${CY}▄███▄${W}░▓${B1}╬╬${W}▓░${CY}▄███▄${W}░▓█▀▄██▓   ${RST}`,
    `${W}  ▓███▀░▓░${CY}█${B1}◈◈◈${CY}█${W}░▓${B1}╬╬╬${W}▓░${CY}█${B1}◈◈◈${CY}█${W}░▓░▀███▓  ${RST}`,
    `${W}  ███▓░░▓${CY}▄█████▄${W}▓${B1}╬╬╬╬${W}▓${CY}▄█████▄${W}▓░░▓███  ${RST}`,
    `${B1}  ▓██░▒▓${W}▀▀▀█▀▀▀${B1}▓╬╬╬╬╬▓${W}▀▀▀█▀▀▀${B1}▓▒░██▓  ${RST}`,
    `${B1}  ░██▄▒${W}░▄▄▄▄▄▄▄${B1}▓╬╬╬╬╬╬▓${W}▄▄▄▄▄▄▄${B1}░▒▄██░  ${RST}`,
    `${B1}   ▀███${W}▄${B1}▓▓▓▓▓▓▓╬╬╬╬╬╬╬╬▓▓▓▓▓▓▓${W}▄${B1}███▀   ${RST}`,
    `${B2}    ▀▀██${B1}▓╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬▓${B2}██▀▀    ${RST}`,
    `${B2}     ${B1}▀▓╬╬╬╬${W}░░▄${B1}╬╬╬╬╬╬╬${W}▄░░${B1}╬╬╬╬▓${B2}▀     ${RST}`,
    `${B3}      ${B2}▓╬╬╬${B1}╬╬╬${W}▄▄▀${B1}╬╬╬╬╬${W}▀▄▄${B1}╬╬╬${B2}╬╬╬▓${B3}      ${RST}`,
    `${B3}       ${B2}░${B1}╬╬╬╬╬${W}▄▄▄${B1}╬╬╬╬╬${W}▄▄▄${B1}╬╬╬╬╬${B2}░${B3}       ${RST}`,
    `${B3}        ${B1}▓╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬▓${B3}        ${RST}`,
    `${B3}         ${B2}▀▓${B1}╬╬╬╬╬╬╬${W}▄▀▄${B1}╬╬╬╬╬╬╬${B2}▓▀${B3}         ${RST}`,
    `${B3}          ${B2}░▓${B1}╬╬╬╬╬${W}█████${B1}╬╬╬╬╬${B2}▓░${B3}          ${RST}`,
    `${B3}           ${B2}▒${B1}╬╬╬╬╬${W}▀███▀${B1}╬╬╬╬╬${B2}▒${B3}           ${RST}`,
    `${B3}            ${B1}▄╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬▄${B3}            ${RST}`,
    `${B2}           ${B1}▓╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬▓${B2}           ${RST}`,
    `${B2}          ${W}▄${B1}╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬${W}▄${B2}          ${RST}`,
    `${B2}         ${W}▄▀${B1}╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬╬${W}▀▄${B2}         ${RST}`,
    `${B1}        ${W}▄▀▀${B1}╬╬╬╬╬${W}░░${B1}╬╬╬╬╬╬╬${W}░░${B1}╬╬╬╬╬${W}▀▀▄${B1}        ${RST}`,
    `${B1}       ${W}▄▀░░▀${B1}▄╬╬╬${W}░░${B1}╬╬╬╬╬╬╬${W}░░${B1}╬╬╬${W}▄▀░░▀▄${B1}       ${RST}`,
    `${W}      ▄▀░▒▒░░▀▄${B1}╬╬╬╬╬╬╬╬╬╬╬${W}▄▀░▒▒░░▀▄      ${RST}`,
    `${W}     ▀░░▒▒▒▒░░░▀▄▄${B1}╬╬╬╬╬${W}▄▄▀░░▒▒▒▒░░░▀     ${RST}`,
    `${GR}    ▀▄░░▒▒▒▒▒░▄▀  ▀${B1}╬╬╬${GR}▀  ▀▄░▒▒▒▒▒░░▄▀    ${RST}`,
    `${GR}      ▀▀▄▄▄▄▀▀      ${B1}▓▓▓      ${GR}▀▀▄▄▄▄▀▀      ${RST}`,
    `${DIM}${GR}                   ▄█▄                          ${RST}`,
    `${DIM}${GR}                  █████                         ${RST}`,
    `${DIM}${GR}                   ▀█▀                          ${RST}`,
  ];

  // Print butterfly rows with binary flanking (first 4 rows)
  for (let i = 0; i < BUTTERFLY.length; i++) {
    const bf  = BUTTERFLY[i];
    if (i < BIN.length) {
      const binL = `${DIM}${B2}${BIN[i][0]}${RST}`;
      const binR = `${DIM}${B2}${BIN[i][1]}${RST}`;
      ln(`${B2}║${RST}  ${binL}   ${bf}   ${binR}  ${B2}║${RST}`);
    } else {
      ln(`${B2}║${RST}  ${' '.repeat(25)} ${bf} ${' '.repeat(25)}  ${B2}║${RST}`);
    }
  }

  ln(`${B2}║${' '.repeat(91)}║${RST}`);

  // ── CICADA 3301 TITLE ──
  const T = BOLD+B1;
  const TD= BOLD+rgb(30,70,180);
  const titleLines = [
    `${T}  ██████╗ ██╗ ██████╗ █████╗ ██████╗  █████╗     ██████╗ ██████╗  ██████╗  ██╗  ${RST}`,
    `${T} ██╔════╝ ██║██╔════╝██╔══██╗██╔══██╗██╔══██╗   ╚════██╗╚════██╗██╔═══██╗███║  ${RST}`,
    `${T} ██║      ██║██║     ███████║██║  ██║███████║    █████╔╝  █████╔╝██║   ██║╚██║  ${RST}`,
    `${T} ██║      ██║██║     ██╔══██║██║  ██║██╔══██║    ╚═══██╗ ╚═══██╗██║   ██║ ██║  ${RST}`,
    `${T} ╚██████╗ ██║╚██████╗██║  ██║██████╔╝██║  ██║   ██████╔╝ ██████╔╝╚██████╔╝ ██║  ${RST}`,
    `${TD} ╚═════╝ ╚═╝ ╚═════╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝   ╚═════╝  ╚═════╝  ╚═════╝  ╚═╝  ${RST}`,
  ];
  for (const tl of titleLines) {
    ln(`${B2}║${RST}${tl}${B2}║${RST}`);
  }

  ln(`${B2}║${' '.repeat(91)}║${RST}`);

  // ── BEGIN ENCRYPTED TRANSMISSION ──
  const subT = `${BOLD}${W}[ ${CY}B E G I N   E N C R Y P T E D   T R A N S M I S S I O N${W} ]${RST}`;
  ln(`${B2}║${RST}${pad(subT, 91)}${B2}║${RST}`);

  ln(`${B2}║${' '.repeat(91)}║${RST}`);

  // ── MESSAGE BOX ──
  const boxW = 55;
  const boxL = `${B1}╔${'═'.repeat(boxW-2)}╗${RST}`;
  const boxB = `${B1}╚${'═'.repeat(boxW-2)}╝${RST}`;
  const boxLine = (txt, color) => {
    const vis = txt.replace(/\x1b\[[^m]*m/g,'').length;
    const pad2 = Math.max(0, Math.floor((boxW - 2 - vis) / 2));
    const padR = Math.max(0, boxW - 2 - vis - pad2);
    return `${B1}║${RST}${' '.repeat(pad2)}${color}${txt}${RST}${' '.repeat(padR)}${B1}║${RST}`;
  };

  const msgLine1 = boxLine('Hello.',       W+BOLD);
  const msgLine2 = boxLine('Your scraper has begun.', W+BOLD);
  const msgLine3 = boxLine('Good luck.',   W+BOLD);
  const msgLine4 = boxLine('WE ARE EVERYWHERE', CY+BOLD);

  ln(`${B2}║${RST}  ${boxL}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${msgLine1}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${msgLine2}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${msgLine3}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${boxLine('─'.repeat(boxW-12), DGR)}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${msgLine4}  ${B2}║${RST}`);
  ln(`${B2}║${RST}  ${boxB}  ${B2}║${RST}`);

  ln(`${B2}║${' '.repeat(91)}║${RST}`);

  // ── BORDER BOTTOM ──
  ln(`${B2}╚${'═'.repeat(91)}╝${RST}`);

  console.log('');

  // ── COLOR GUIDE ──
  const G = `${BOLD}${W}`;
  console.log(pad(`${G}COLOR GUIDE:${RST}`, w));
  console.log('');
  console.log(pad(`  ${BOLD}${W}✔ WHITE/BLUE${RST}  ${W}= Email FOUND (website ya FB se)${RST}`, w));
  console.log(pad(`  ${BOLD}${rgb(255,60,60)}✘ RED       ${RST}  ${W}= NOT FOUND${RST}`, w));
  console.log(pad(`  ${BOLD}${B1}● BLUE      ${RST}  ${W}= Facebook action (search/login/direct)${RST}`, w));
  console.log(pad(`  ${BOLD}${rgb(255,80,255)}● MAGENTA   ${RST}  ${W}= CloudFlare email decode${RST}`, w));
  console.log(pad(`  ${BOLD}${CY}● CYAN      ${RST}  ${W}= Website crawling${RST}`, w));
  console.log(pad(`  ${BOLD}${rgb(255,220,50)}● YELLOW    ${RST}  ${W}= Warning / phone number${RST}`, w));
  console.log('');
}

// ══════════════════════════════════════════════════════════
//  CLOUDFLARE DECODE
// ══════════════════════════════════════════════════════════
function decodeCfEmail(hex) {
  try {
    hex = hex.replace(/[^0-9a-fA-F]/g,'');
    const key = parseInt(hex.substring(0,2),16);
    let email = '';
    for (let i=2; i<hex.length; i+=2)
      email += String.fromCharCode(parseInt(hex.substring(i,i+2),16) ^ key);
    return email.includes('@') ? email : null;
  } catch { return null; }
}

function extractCfEmails($, html) {
  const out = [];
  $('[data-cfemail]').each((_,el) => {
    const d = decodeCfEmail($(el).attr('data-cfemail'));
    if (d) out.push(d);
  });
  $('a[href*="email-protection"]').each((_,el) => {
    const m = ($(el).attr('href')||'').match(/#([0-9a-fA-F]+)/);
    if (m) { const d = decodeCfEmail(m[1]); if (d) out.push(d); }
  });
  (html.match(/(?:data-cfemail|email-protection#)([0-9a-fA-F]+)/g)||[]).forEach(m => {
    const hex = m.split(/[#"]/)[1];
    if (hex) { const d = decodeCfEmail(hex); if (d) out.push(d); }
  });
  return out;
}

// ══════════════════════════════════════════════════════════
//  STRUCTURED EXTRACTORS
// ══════════════════════════════════════════════════════════

// JSON-LD — pull email + telephone from any nested schema.org object
function walkJsonLd(node, emails, phones) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(n => walkJsonLd(n, emails, phones)); return; }
  for (const [k, v] of Object.entries(node)) {
    const key = k.toLowerCase();
    if (typeof v === 'string') {
      if (key === 'email' || key.endsWith('email')) emails.push(v.replace(/^mailto:/i,'').trim());
      if (key === 'telephone' || key === 'phone' || key.endsWith('phone')) phones.push(v.trim());
    } else if (v && typeof v === 'object') {
      walkJsonLd(v, emails, phones);
    }
  }
}
function extractJsonLd($) {
  const emails = [], phones = [];
  $('script[type]').each((_,el) => {
    const type = ($(el).attr('type')||'').toLowerCase();
    if (!type.includes('ld+json')) return;
    const txt = $(el).contents().text() || $(el).text() || '';
    let data;
    try { data = JSON.parse(txt); }
    catch {
      // some sites concatenate multiple JSON-LD blocks — try a lenient split
      try { data = JSON.parse('[' + txt.replace(/}\s*{/g, '},{') + ']'); } catch { return; }
    }
    walkJsonLd(data, emails, phones);
  });
  return { emails, phones };
}

// data-email / data-mail (high), plus aria-label / content / title / alt / value (medium)
function extractAttrCandidates($) {
  const out = [];
  const MED_ATTRS = ['aria-label','content','title','alt','value','data-original-title'];
  $('*').each((_,el) => {
    const a = el.attribs;
    if (!a) return;
    for (const name of ['data-email','data-mail']) {
      if (a[name] && a[name].includes('@')) out.push({ raw:a[name], source:name, confidence:'high' });
    }
    for (const name of MED_ATTRS) {
      if (a[name] && a[name].includes('@')) out.push({ raw:a[name], source:'attr-'+name, confidence:'medium' });
    }
  });
  return out;
}

// Visible text via SEPARATE text nodes joined with spaces (prevents phone/email glue).
// Assumes script/style/template/noscript already removed from $.
function extractTextWithSpaces($) {
  const parts = [];
  const scope = $('body').length ? $('body') : $.root();
  scope.find('*').addBack().contents().each((_, node) => {
    if (node.type === 'text') {
      const t = (node.data || '').replace(/\s+/g,' ').trim();
      if (t) parts.push(t);
    }
  });
  return parts.join(' ');
}

// ══════════════════════════════════════════════════════════
//  WEBSITE SCRAPER
// ══════════════════════════════════════════════════════════
async function fetchHtml(url) {
  const res = await axios.get(url, {
    timeout: CONFIG.WEB_TIMEOUT,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    maxRedirects: 5,
  });
  return res.data;
}

// parsePage → { cands:[{raw,source,confidence,page}], phones, fbLinks, contLinks }
function parsePage(html, pageUrl, baseUrl) {
  const $ = cheerio.load(html);
  const cands = [], phones = [], fbLinks = [], contLinks = [];
  const push = (raw, source, confidence) => {
    if (raw && String(raw).includes('@')) cands.push({ raw, source, confidence, page: pageUrl });
  };

  // 1. mailto: links — most reliable
  $('a[href^="mailto:"]').each((_,el) => {
    const e = ($(el).attr('href')||'').replace(/^mailto:/i,'').split('?')[0].trim();
    if (e) push(e, 'mailto', 'high');
  });

  // 2. JSON-LD email + telephone (high) — must run BEFORE scripts are stripped
  const ld = extractJsonLd($);
  ld.emails.forEach(e => push(e, 'json-ld', 'high'));
  phones.push(...ld.phones);

  // 3. attributes: data-email/data-mail (high), aria-label/content/… (medium)
  for (const a of extractAttrCandidates($)) push(a.raw, a.source, a.confidence);

  // 4. CloudFlare decoded (high)
  const cf = extractCfEmails($, html);
  if (cf.length) { log(`CF decoded: ${cf.join(', ')}`, 'CF'); cf.forEach(e => push(e, 'cloudflare', 'high')); }

  // 5. raw HTML matches (LOW confidence)
  (html.match(EMAIL_FIND) || []).forEach(e => push(e, 'html', 'low'));

  // ─── PHONES (kept separate from email extraction) ───
  $('a[href^="tel:"]').each((_,el) => {
    phones.push(($(el).attr('href')||'').replace(/^tel:/i,'').trim());
  });

  // ─── FACEBOOK LINKS ───
  $('a[href*="facebook.com"]').each((_,el) => {
    const href = ($(el).attr('href')||'').split('?')[0].replace(/\/$/,'');
    const m    = href.match(FB_SOCIAL);
    if (m && m[1]) fbLinks.push(`https://www.facebook.com/${m[1]}`);
  });

  // ─── CONTACT PAGE LINKS ───
  try {
    const origin = new URL(baseUrl).origin;
    $('a[href]').each((_,el) => {
      const href = $(el).attr('href')||'';
      const text = ($(el).text()||'').toLowerCase();
      const full = href.startsWith('http') ? href : href.startsWith('/') ? origin+href : null;
      if (!full || !full.startsWith(origin)) return;
      if (CONFIG.CONTACT_KEYWORDS.some(kw => full.toLowerCase().includes(kw) || text.includes(kw)))
        contLinks.push(full.split('?')[0]);
    });
  } catch {}

  // ─── VISIBLE TEXT (medium) — strip non-visible content first ───
  $('script, style, template, noscript, svg').remove();
  const vis = extractTextWithSpaces($);
  (vis.match(EMAIL_FIND) || []).forEach(e => push(e, 'text', 'medium'));

  // ─── DE-OBFUSCATED [at]/[dot] emails (medium) ───
  const deob = deobfuscateText(vis);
  (deob.match(EMAIL_FIND) || []).forEach(e => push(e, 'deobfuscated', 'medium'));

  // phones from visible text (not raw html — avoids markup noise)
  phones.push(...(vis.match(PHONE_REGEX) || []));

  const refined = refineCandidates(cands);
  log(`  🔍 ${pageUrl.slice(0,50)} → ${refined.clean.length} email(s), ${refined.suspicious.length} suspicious, ${filterPhones(phones).length} phone(s)`, 'WEB');

  return {
    cands,
    phones:    filterPhones(phones),
    fbLinks:   [...new Set(fbLinks)],
    contLinks: [...new Set(contLinks)].slice(0,5),
  };
}

async function scrapeWebsite(baseUrl) {
  const cands = [], allPhones = [], allFb = [];
  const visited = new Set();
  let mainParsed = null;

  async function doPage(url) {
    const clean = url.split('?')[0].replace(/\/$/,'');
    if (visited.has(clean)) return null;
    visited.add(clean);
    try {
      await sleep(rInt(CONFIG.DELAY_WEB.min, CONFIG.DELAY_WEB.max));
      const html   = await fetchHtml(url);
      const parsed = parsePage(html, url, baseUrl);
      cands.push(...parsed.cands);
      allPhones.push(...parsed.phones);
      allFb.push(...parsed.fbLinks);
      return parsed;
    } catch { return null; }
  }

  // "strong" = at least one high/medium confidence CLEAN email
  const hasStrong = () => refineCandidates(cands).clean.some(c => c.confidence === 'high' || c.confidence === 'medium');

  mainParsed = await doPage(baseUrl);

  // Sub-pages — crawl if we don't yet have a strong email
  if (!hasStrong()) {
    await Promise.allSettled(CONFIG.PRIORITY_PAGES.map(s => doPage(baseUrl+s)));
  }

  // Contact links — KEEP crawling when we only have low-confidence (or no) emails
  if (!hasStrong() && mainParsed?.contLinks?.length > 0) {
    for (const link of mainParsed.contLinks) {
      await doPage(link);
      if (hasStrong()) break;
    }
  }

  const refined = refineCandidates(cands);
  return {
    emails:     refined.clean,       // [{email,source,confidence,suspicious:false,reason,page}]
    suspicious: refined.suspicious,  // [{...suspicious:true}]
    phones:     filterPhones(allPhones),
    fbLinks:    [...new Set(allFb)],
  };
}

// ══════════════════════════════════════════════════════════
//  FACEBOOK SCRAPER — STABLE
// ══════════════════════════════════════════════════════════
let browser = null, fbPage = null;

async function launchBrowser() {
  if (browser) return;
  log('FB Browser launch...', 'FB');
  browser = await puppeteer.launch({
    headless: CONFIG.FB_HEADLESS,
    args: [
      '--no-sandbox','--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars','--window-size=1366,768',
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    defaultViewport: { width:1366, height:768 },
  });
  fbPage = await browser.newPage();
  await fbPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator,'webdriver',{get:()=>undefined});
    Object.defineProperty(navigator,'plugins',{get:()=>[1,2,3,4,5]});
    Object.defineProperty(navigator,'languages',{get:()=>['en-US','en']});
    window.chrome = { runtime:{} };
  });
  await fbPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Navigation abort ko gracefully handle karo
  fbPage.on('error', () => {});
  fbPage.on('pageerror', () => {});
}

async function humanType(sel, text) {
  await fbPage.click(sel);
  await sleep(rInt(200,400));
  await fbPage.evaluate(s => { const el=document.querySelector(s); if(el) el.value=''; }, sel);
  for (const ch of text) {
    await fbPage.keyboard.type(ch, { delay: rInt(CONFIG.DELAY_TYPING.min, CONFIG.DELAY_TYPING.max) });
    if (Math.random()<0.03) await sleep(rInt(60,180));
  }
}

async function saveSession() {
  try {
    fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(await fbPage.cookies(),null,2));
  } catch {}
}
async function loadSession() {
  if (!fs.existsSync(CONFIG.SESSION_FILE)) return false;
  try {
    await fbPage.setCookie(...JSON.parse(fs.readFileSync(CONFIG.SESSION_FILE,'utf8')));
    return true;
  } catch { return false; }
}

async function checkFbLogin() {
  try {
    await fbPage.goto('https://www.facebook.com/', {
      waitUntil: 'domcontentloaded', timeout: CONFIG.FB_TIMEOUT
    });
    await sleep(2200);
    const html = await fbPage.content().catch(()=>'');
    return !fbPage.url().includes('/login') && !html.includes('id="email"');
  } catch { return false; }
}

async function loginFacebook() {
  log('FB login check...', 'FB');
  await launchBrowser();
  await loadSession();
  if (await checkFbLogin()) { log('FB session OK ✔', 'OK'); return true; }

  log('FB fresh login...', 'FB');
  try {
    await fbPage.goto('https://www.facebook.com/login', {
      waitUntil: 'networkidle2', timeout: CONFIG.FB_TIMEOUT
    });
    await rSleep(CONFIG.DELAY_PAGE_LOAD);

    await humanType('#email', CONFIG.FB_EMAIL);
    await sleep(rInt(600,1000));
    await humanType('#pass',  CONFIG.FB_PASSWORD);
    await sleep(rInt(400,700));

    await fbPage.click('[name="login"]');
    await fbPage.waitForNavigation({ waitUntil:'networkidle2', timeout:CONFIG.FB_TIMEOUT })
                .catch(()=>{});
    await rSleep(CONFIG.DELAY_PAGE_LOAD);

    const url  = fbPage.url();
    const html = await fbPage.content().catch(()=>'');
    if (url.includes('checkpoint') || html.includes('captcha') || html.includes('confirm your identity')) {
      console.log('');
      console.log(clr('  ⚠️  CAPTCHA! Browser mein solve karo → CMD mein ENTER dabao', 'yellow','bright'));
      await new Promise(r => process.stdin.once('data', r));
      await sleep(2500);
    }

    if (await checkFbLogin()) {
      await saveSession();
      log('FB Login ✔', 'OK');
      return true;
    }
    log('FB Login fail', 'ERROR');
    return false;
  } catch(e) {
    log(`FB login error: ${e.message}`, 'ERROR');
    return false;
  }
}

// Safe FB navigate — ERR_ABORTED handle karo
async function fbGoto(url) {
  try {
    await fbPage.goto(url, { waitUntil:'domcontentloaded', timeout:CONFIG.FB_TIMEOUT });
  } catch(e) {
    // ERR_ABORTED = page redirected mid-load — normal on FB, ignore
    if (!e.message.includes('ERR_ABORTED') && !e.message.includes('net::')) throw e;
  }
}

// Re-login — sirf zaroorat par (har 50 URLs ya error par)
let fbCheckCounter = 0;
async function ensureFbLogin() {
  try {
    fbCheckCounter++;
    // Har 50 URLs par ya pehli baar check karo
    if (fbCheckCounter % 50 !== 1) return;
    const loggedIn = await checkFbLogin();
    if (!loggedIn) {
      log('FB session expire — re-login...', 'WARN');
      fbCheckCounter = 0;
      await loginFacebook();
    }
  } catch {}
}

// FB About page se emails (returns raw strings; refined by caller)
async function scrapeFbAbout(fbUrl) {
  const emails = [], phones = [];
  const base   = fbUrl.split('?')[0].replace(/\/$/,'');

  const sections = [base, base+'/about', base+'/about_contact_and_basic_info'];

  for (const url of sections) {
    try {
      log(`FB visiting: ${url.split('facebook.com/')[1]||url}`, 'FB');
      await fbGoto(url);
      await sleep(rInt(CONFIG.DELAY_FB_ABOUT.min, CONFIG.DELAY_FB_ABOUT.max));

      // Scroll slowly
      await fbPage.evaluate(() => {
        window.scrollTo(0, 0);
        window.scrollBy(0, window.innerHeight * 2);
      }).catch(()=>{});
      await sleep(1500);

      const found = await fbPage.evaluate((ebl, erx, prx) => {
        const rx  = new RegExp(erx,'g');
        const px  = new RegExp(prx,'g');
        const txt = document.body?.innerText  || '';
        const htm = document.body?.innerHTML || '';
        const allE = [...new Set([...(txt.match(rx)||[]),...(htm.match(rx)||[])])];
        const allP = [...new Set([...(txt.match(px)||[])])];
        return {
          emails: allE.filter(e => !ebl.some(b => e.toLowerCase().includes(b))),
          phones: allP,
        };
      }, EMAIL_BLACKLIST, EMAIL_REGEX.source, PHONE_REGEX.source).catch(()=>({emails:[],phones:[]}));

      if (found.emails.length) { emails.push(...found.emails); break; }
      if (found.phones.length) phones.push(...found.phones);

      await sleep(rInt(CONFIG.DELAY_FB_NAV.min, CONFIG.DELAY_FB_NAV.max));
    } catch(e) {
      if (!e.message?.includes('ERR_ABORTED')) log(`FB section error: ${e.message}`, 'WARN');
    }
  }
  return { emails: [...new Set(emails)], phones: filterPhones(phones) };
}

// FB Search
const SKIP_FB = ['/search','/login','/help','/policies','/groups/','/events/',
                 '/marketplace','/watch','/gaming','/ads','/business','pages/create'];

async function searchFbPage(biz) {
  try {
    await ensureFbLogin();
    log(`FB search: ${biz}`, 'FB');

    await fbGoto(`https://www.facebook.com/search/pages?q=${encodeURIComponent(biz)}`);
    await sleep(rInt(CONFIG.DELAY_FB_SEARCH.min, CONFIG.DELAY_FB_SEARCH.max));

    await fbPage.evaluate(()=>window.scrollBy(0,500)).catch(()=>{});
    await sleep(2000);

    const bodyLen = await fbPage.evaluate(()=>document.body?.innerText?.trim()?.length||0).catch(()=>0);

    if (bodyLen < 50) {
      // Fallback: top search
      await fbGoto(`https://www.facebook.com/search/top?q=${encodeURIComponent(biz)}`);
      await sleep(rInt(CONFIG.DELAY_FB_SEARCH.min, CONFIG.DELAY_FB_SEARCH.max));
      await fbPage.evaluate(()=>window.scrollBy(0,500)).catch(()=>{});
      await sleep(2000);
    }

    return await fbPage.evaluate(skip => {
      for (const a of document.querySelectorAll('a[href*="facebook.com/"]')) {
        const href = (a.href||'').split('?')[0];
        if (!href.includes('facebook.com/')) continue;
        if (skip.some(s => href.includes(s))) continue;
        const slug = href.split('facebook.com/')[1];
        if (!slug || slug.length < 3) continue;
        if (slug.startsWith('profile.php') || slug.startsWith('pages/')) continue;
        return href;
      }
      return null;
    }, SKIP_FB).catch(()=>null);

  } catch(e) {
    if (!e.message?.includes('ERR_ABORTED')) log(`FB search error: ${e.message}`, 'ERROR');
    return null;
  }
}

// ══════════════════════════════════════════════════════════
//  COMBINED FLOW
// ══════════════════════════════════════════════════════════
// ─── BUILD ROWS — one row per email ───────────────────────
// emailObjs: [{email,source,confidence,suspicious,reason,page}]
// Returns an ARRAY of rows (one per email, or one no-email row)
function buildRows(url, biz, emailObjs, phones, fbUrl, status, channel='', error='') {
  const now = new Date().toISOString();
  const phonesStr = (phones||[]).join(' | ');

  if (!emailObjs || emailObjs.length === 0) {
    return [{
      url, business_name: biz,
      email: '',
      phone: phonesStr,
      email_count: 0,
      email_source: '',
      confidence: '',
      suspicious: false,
      notes: '',
      source_page: '',
      fb_page_url: fbUrl,
      channel,
      status, error,
      scraped_at: now,
    }];
  }

  return emailObjs.map(o => ({
    url, business_name: biz,
    email: o.email,
    phone: phonesStr,
    email_count: emailObjs.length,
    email_source: o.source || '',
    confidence: o.confidence || '',
    suspicious: !!o.suspicious,
    notes: o.reason || '',
    source_page: o.page || '',
    fb_page_url: fbUrl,
    channel,
    status, error,
    scraped_at: now,
  }));
}

async function processUrl(url, fbReady, idx) {
  const norm  = normalizeUrl(url);
  const biz   = getBusinessName(norm);
  const start = Date.now();

  urlHeader(norm, idx);

  // STEP 1: Website
  let web = { emails:[], suspicious:[], phones:[], fbLinks:[] };
  try { web = await scrapeWebsite(norm); } catch {}

  if (web.suspicious?.length) recordSuspicious(norm, biz, web.suspicious, 'website');

  log(`  📧 Emails: ${web.emails.length} | 🚩 Suspicious: ${web.suspicious.length} | 📞 Phones: ${web.phones.length}`, 'INFO');

  if (web.emails.length > 0) {
    const el = ((Date.now()-start)/1000).toFixed(1);
    urlResult(biz, web.emails.map(e=>e.email), 'website', el);
    STATS.found++; STATS.fromWeb++;
    return buildRows(norm, biz, web.emails, web.phones, '', 'found', 'website');
  }

  // STEP 2: FB direct link on website
  if (fbReady && web.fbLinks.length > 0) {
    log(`FB direct: ${web.fbLinks[0]}`, 'FB');
    try {
      const fb = await scrapeFbAbout(web.fbLinks[0]);
      const r  = refineCandidates(fb.emails.map(e => ({ raw:e, source:'facebook', confidence:'medium', page:web.fbLinks[0] })));
      if (r.suspicious.length) recordSuspicious(norm, biz, r.suspicious, 'facebook_direct');
      log(`  📧 FB Emails: ${r.clean.length} | 🚩 Suspicious: ${r.suspicious.length} | 📞 FB Phones: ${fb.phones.length}`, 'INFO');
      if (r.clean.length > 0) {
        const el = ((Date.now()-start)/1000).toFixed(1);
        urlResult(biz, r.clean.map(e=>e.email), 'fb_direct', el);
        STATS.found++; STATS.fromFbDirect++;
        return buildRows(norm, biz, r.clean, [...web.phones,...fb.phones], web.fbLinks[0], 'found', 'facebook_direct');
      }
    } catch {}
  }

  // STEP 3: FB search
  if (fbReady) {
    try {
      const fbUrl = await searchFbPage(biz);
      if (fbUrl) {
        const fb = await scrapeFbAbout(fbUrl);
        const r  = refineCandidates(fb.emails.map(e => ({ raw:e, source:'facebook', confidence:'medium', page:fbUrl })));
        if (r.suspicious.length) recordSuspicious(norm, biz, r.suspicious, 'facebook_search');
        log(`  📧 FB Search Emails: ${r.clean.length} | 🚩 Suspicious: ${r.suspicious.length} | 📞 FB Search Phones: ${fb.phones.length}`, 'INFO');
        if (r.clean.length > 0) {
          const el = ((Date.now()-start)/1000).toFixed(1);
          urlResult(biz, r.clean.map(e=>e.email), 'fb_search', el);
          STATS.found++; STATS.fromFbSearch++;
          return buildRows(norm, biz, r.clean, [...web.phones,...fb.phones], fbUrl, 'found', 'facebook_search');
        }
        STATS.notFound++;
        return buildRows(norm, biz, [], web.phones, fbUrl, 'not_found', '');
      }
    } catch {}
  }

  const el = ((Date.now()-start)/1000).toFixed(1);
  urlResult(biz, [], '', el);
  STATS.notFound++;
  return buildRows(norm, biz, [], web.phones, '', 'not_found', '');
}

// ─── MAIN ──────────────────────────────────────────────────
async function main() {
  printBanner();

  if (!fs.existsSync(CONFIG.INPUT_FILE)) {
    console.log(clr('  ERROR: input.csv nahi mila!', 'red','bright'));
    process.exit(1);
  }

  const rows = parse(fs.readFileSync(CONFIG.INPUT_FILE,'utf8'),
    { columns:true, skip_empty_lines:true, trim:true }
  );
  const col = Object.keys(rows[0]).find(k =>
    ['url','website','link','domain','site'].includes(k.toLowerCase())
  );
  if (!col) {
    console.log(clr('  ERROR: url column nahi mila!', 'red'));
    process.exit(1);
  }

  const urls  = rows.map(r=>r[col]).filter(Boolean);
  STATS.total = urls.length;

  loadSuspicious();
  const cache   = loadCache();
  const results = [];

  // ─── RESUME — restore ALL email rows per URL (not just the first) ───
  let processedUrls = 0;
  for (const u of urls) {
    const key = u.trim();
    if (!cache[key]) continue;
    let arr = cache[key];
    if (!Array.isArray(arr)) arr = [arr];   // backward-compat with old single-row cache
    results.push(...arr);
    processedUrls++;
    const rep = arr[0] || {};
    if (rep.status === 'found') {
      STATS.found++;
      if      (rep.channel === 'website')          STATS.fromWeb++;
      else if (rep.channel === 'facebook_direct')  STATS.fromFbDirect++;
      else if (rep.channel === 'facebook_search')  STATS.fromFbSearch++;
    } else if (rep.status === 'error') {
      STATS.errors++;
    } else {
      STATS.notFound++;
    }
  }
  STATS.processed = processedUrls;

  console.log(clr(`  Total URLs   : ${urls.length}`, 'cyan','bright'));
  console.log(clr(`  Resume from  : ${STATS.processed} already done`, 'gray'));
  console.log(clr(`  New to scrape: ${urls.length - STATS.processed}`, 'yellow'));
  console.log(clr(`  Concurrency  : ${CONFIG.CONCURRENCY} parallel`, 'green'));
  console.log(clr(`  Target speed : ~12s/URL → 1000 URLs ≈ 3-4 hours`, 'cyan'));
  console.log('');

  // FB Login
  let fbReady = false;
  try { fbReady = await loginFacebook(); }
  catch(e) { log(`FB login fail: ${e.message}`, 'WARN'); }

  const queue = urls.filter(u => !cache[u.trim()]);
  console.log('');
  startCyberUI();

  let running = 0;
  let idx     = STATS.processed;

  async function runOne(url) {
    running++;
    idx++;
    const trimmed = url.trim();
    let builtRows;
    try {
      builtRows = await processUrl(trimmed, fbReady, idx);
    } catch(e) {
      STATS.errors++;
      builtRows = buildRows(normalizeUrl(trimmed), getBusinessName(trimmed), [], [], '', 'error', '', e.message);
    }
    // Cache: store the FULL array of rows so resume restores every email row
    cache[trimmed] = builtRows;
    results.push(...builtRows);
    saveCache(cache);
    saveOutput(results);
    STATS.processed++;
    running--;
  }

  for (let i=0; i<queue.length; i++) {
    while (running >= CONFIG.CONCURRENCY) await sleep(150);
    runOne(queue[i]);
    await sleep(rInt(CONFIG.DELAY_BETWEEN.min, CONFIG.DELAY_BETWEEN.max));
  }
  while (running > 0) await sleep(200);

  stopCyberUI();

  // ─── FINAL ────────────────────────────────────────────
  const totalTime = ((Date.now()-STATS.startTime)/60000).toFixed(1);
  console.log('');
  console.log(clr('  ══════════════════════════════════════════════════════', 'green','bright'));
  console.log(clr('  [ HUZAIFA CYBER PROXY ] — MISSION COMPLETE', 'green','bright'));
  console.log(clr('  ══════════════════════════════════════════════════════', 'green','bright'));
  console.log(clr(`  Total Scraped   : ${results.length}`, 'white','bright'));
  console.log(clr(`  Emails Found    : ${STATS.found}`, 'green','bright'));
  console.log(clr(`  Website         : ${STATS.fromWeb}`, 'cyan'));
  console.log(clr(`  FB Direct       : ${STATS.fromFbDirect}`, 'blue'));
  console.log(clr(`  FB Search       : ${STATS.fromFbSearch}`, 'magenta'));
  console.log(clr(`  Suspicious      : ${STATS.suspicious}`, 'yellow'));
  console.log(clr(`  Not Found       : ${STATS.notFound}`, 'red'));
  console.log(clr(`  Errors          : ${STATS.errors}`, 'yellow'));
  console.log(clr(`  Total Time      : ${totalTime} min`, 'gray'));
  console.log(clr(`  Output File     : ${CONFIG.OUTPUT_FILE}`, 'gray'));
  console.log(clr(`  Suspicious File : ${CONFIG.SUSPICIOUS_FILE}`, 'gray'));
  console.log(clr('  ══════════════════════════════════════════════════════', 'green','bright'));
  console.log('');

  if (browser) await browser.close();
}

// ─── SELF-TEST (pure functions only) — run: node email-scraper.js --selftest ───
function runSelfTest() {
  const cases = [
    ['u003einfo@bakedbyael.com',            'info@bakedbyael.com', false],
    ['u003emealplans@udel.edu',             'mealplans@udel.edu',  false],
    ['usa2527283899info@beaugro.com',       'info@beaugro.com',    false],
    ['il773.276.8888hello@bangbangpie.con', 'hello@bangbangpie.con', true ], // typo kept + flagged
    ['john2024@gmail.com',                  'john2024@gmail.com',  false],
    ['contact@sansoxygen.com',              'contact@sansoxygen.com', false],
    ['&#105;nfo&#64;example.org',           null,                  false],  // blacklisted domain → null
    ['sales@gmial.com',                     'sales@gmial.com',     true ],  // provider typo flagged
  ];
  let pass = 0;
  for (const [raw, expEmail, expSusp] of cases) {
    const n = normalizeEmail(raw);
    const gotEmail = n ? n.email : null;
    const blacklisted = n && EMAIL_BLACKLIST.some(b => n.email.includes(b));
    const finalEmail = blacklisted ? null : gotEmail;
    const ok = finalEmail === expEmail && (finalEmail === null || n.suspicious === expSusp);
    if (ok) pass++;
    console.log(`${ok?'✔':'✘'} ${raw.padEnd(38)} → ${finalEmail}  susp=${n?n.suspicious:'-'}${n&&n.reason?('  ('+n.reason+')'):''}`);
  }
  // de-obfuscation
  const deob = deobfuscateText('reach us: sales (at) foocorp (dot) com or bob at bar dot io');
  console.log('deobfuscate →', deob.match(EMAIL_FIND));
  console.log(`\n${pass}/${cases.length} normalizeEmail cases passed`);
}

if (process.argv.includes('--selftest')) {
  runSelfTest();
} else {
  main().catch(async err => {
    stopCyberUI();
    console.error(clr('\n  FATAL: '+err.message, 'red','bright'));
    if (browser) await browser.close();
    process.exit(1);
  });
}
