# CLI Script Dashboard & Runner (Huzaifa Cyber Proxy)

A modern, dark-themed browser dashboard and Express server wrapper for running command-line Node.js scripts in the background without needing to type into the terminal manually.

Built with a strict separation of concerns:
- **`server.js`**: Express backend handling background process spawning, file uploads, regex progress parsing, SSE streaming, crash-resume, and downloads.
- **`public/index.html`**: Clean dark-theme frontend with embedded JavaScript, live terminal emulator with 24-bit ANSI color rendering, and clear HTML element IDs.
- **`email-scraper.js`**: Original CLI script with **zero modifications** to its internal algorithms or logic.

---

## 🚀 Quick Start Guide

### 1. Install Dependencies
Open your terminal in the project directory and run:
```bash
npm install
```

### 2. Start the Server
Run the Express server:
```bash
node server.js
```
*(Or use `npm run dev` to start with tsx)*

### 3. Open in Browser
Open your browser and navigate to:
```
http://localhost:3000
```

---

## 📋 Features

1. **Background Process Execution (`child_process.spawn`)**:
   - Runs `node email-scraper.js` in the background.
   - Non-blocking execution allows you to monitor, pause, or abort at any time.

2. **Server-Sent Events (SSE) Live Streaming**:
   - `GET /api/events` streams raw stdout and stderr in real-time.
   - Converts ANSI escape codes (including 24-bit RGB colors used in the ASCII banner) directly into colored HTML in the terminal window.

3. **Intelligent Regex Progress Parsing**:
   - Automatically parses terminal output lines such as:
     - `[ HUZAIFA CYBER PROXY ] 30/60 50% ✔12 ✘4 ETA:0h 15m`
     - `[1/60] HCP>> https://example.com 12:34:56`
     - `> [HUZAIFA CYBER PROXY] FOUND: contact@example.com`
     - `📧 Emails: 2 | 🚩 Suspicious: 1 | 📞 Phones: 1`
   - Updates progress percentage bar, current target item, processed count, found count, and ETA in real-time.

4. **Input CSV Management**:
   - **Upload Button / Drag-and-Drop**: Upload your `input.csv` file directly from the browser. Supports columns named `url`, `website`, `domain`, `link`, or `site`.
   - **Manual Paste Modal**: Paste a list of URLs directly into the dashboard; it will automatically format and generate `input.csv`.

5. **Crash-Safe Checkpoint & Auto-Resume**:
   - Scraper progress is continuously saved to `cache.json`.
   - If the process stops or crashes, the dashboard detects the existing checkpoint.
   - You can choose to **"Resume from checkpoint"** (skip already scraped URLs) or **"Start Fresh"** (archives old cache and restarts from item 1).

6. **Output Downloads & Data Preview**:
   - When URLs are scraped, the **Download `output.csv`** button activates.
   - Direct download links for:
     - `output.csv` (clean verified contacts)
     - `suspicious.csv` (flagged domains / typo TLDs)
     - `cache.json` (raw state cache)
     - Full execution logs (`.log`)
   - Interactive table previewing the latest 50 discovered business contacts.

7. **Self-Test Suite**:
   - One-click **"Self-Test"** button in the header triggers `node email-scraper.js --selftest` to verify email normalization and regex functions without initiating network scraping.

---

## 🛠 API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/status` | Current status of child process, progress stats, and file metadata |
| `GET` | `/api/events` | Server-Sent Events (SSE) stream for logs and structured progress |
| `POST` | `/api/start` | Spawns the CLI script in background with options (`resume`, `args`) |
| `POST` | `/api/stop` | Sends termination signal (SIGINT / SIGKILL) to child process |
| `POST` | `/api/upload` | Multipart upload for `input.csv` |
| `POST` | `/api/input-urls` | JSON body with raw URL list to create `input.csv` |
| `GET` | `/api/download/:type` | Downloads `output`, `suspicious`, `cache`, `input`, or `logs` |
| `GET` | `/api/preview/:type` | Returns latest JSON preview rows from `output.csv` or `suspicious.csv` |
| `POST` | `/api/selftest` | Runs pure-function test suite (`--selftest`) |
| `POST` | `/api/clear-logs` | Clears in-memory terminal buffer |

---

## 📁 File Structure

```text
├── server.js              # Express backend (data, process spawn, SSE, uploads)
├── server.ts              # TypeScript runner entry point
├── email-scraper.js       # Untouched CLI script logic
├── public/
│   └── index.html         # Dark-themed dashboard UI (HTML + Tailwind + JavaScript)
├── input.csv              # Input target URLs
├── output.csv             # Clean scraped contacts
├── suspicious.csv         # Flagged suspicious domains/typos
├── cache.json             # Crash-resume state store
├── README.md              # Documentation and instructions
└── package.json           # Dependencies and scripts
```
