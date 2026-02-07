// Temporary debug log server — receives logs from the extension via POST
// Usage: node debug/log-server.js
// Logs written to debug/events.log

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 7777;
const LOG_FILE = path.join(__dirname, 'events.log');

// Clear log on start
fs.writeFileSync(LOG_FILE, `--- Debug session started ${new Date().toISOString()} ---\n`);

const server = http.createServer((req, res) => {
  // CORS headers for service worker fetch
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/log') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ts = new Date().toISOString().slice(11, 23);
        const line = `${ts} [${data.service || '?'}] ${data.event} ${data.target || ''} ${data.detail || ''}\n`;
        fs.appendFileSync(LOG_FILE, line);
        process.stdout.write(line);
      } catch {
        fs.appendFileSync(LOG_FILE, `${body}\n`);
      }
      res.writeHead(200);
      res.end('ok');
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Debug log server running on http://127.0.0.1:${PORT}`);
  console.log(`Logs: ${LOG_FILE}`);
});
