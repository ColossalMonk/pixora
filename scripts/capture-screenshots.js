import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const screenshotsDir = path.join(projectRoot, 'docs', 'screenshots');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, 'http://127.0.0.1:4173');
  let pathname = parsedUrl.pathname;
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const filePath = path.join(distDir, pathname);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4173, '127.0.0.1', async () => {
  console.log('Static server listening on http://127.0.0.1:4173');

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

  const runChrome = (args) =>
    new Promise((resolve, reject) => {
      execFile(chromePath, args, (error, stdout, stderr) => {
        if (error) {
          console.error('Chrome execution failed:', error);
          reject(error);
        } else {
          resolve({ stdout, stderr });
        }
      });
    });

  try {
    console.log('Capturing pixora-preview.jpg...');
    const previewOut = path.join(screenshotsDir, 'pixora-preview.jpg');
    await runChrome([
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=5000',
      '--window-size=1440,810',
      `--screenshot=${previewOut}`,
      'http://127.0.0.1:4173/?scene=butterflies',
    ]);
    console.log('Captured:', previewOut);

    console.log('Capturing pixora-tweaks.jpg...');
    const tweaksOut = path.join(screenshotsDir, 'pixora-tweaks.jpg');
    await runChrome([
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--virtual-time-budget=5000',
      '--window-size=1440,810',
      `--screenshot=${tweaksOut}`,
      'http://127.0.0.1:4173/?scene=butterflies&drawer=true',
    ]);
    console.log('Captured:', tweaksOut);

    console.log('All screenshots captured successfully!');
  } catch (err) {
    console.error('Screenshot capture failed:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
