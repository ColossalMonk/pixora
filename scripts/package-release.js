import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const version = pkg.version || '1.1.0';
const ZIP_FILE = path.join(RELEASE_DIR, `pixora-v${version}-chrome-extension.zip`);
const LATEST_ZIP = path.join(RELEASE_DIR, 'pixora-chrome-extension.zip');

// Always rebuild so the zip can never contain a stale dist/.
console.log('Building project before packaging...');
execSync('npm run build', { stdio: 'inherit' });

if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE);
if (fs.existsSync(LATEST_ZIP)) fs.unlinkSync(LATEST_ZIP);

// Zip with forward-slash paths so the archive extracts correctly on every OS.
// (PowerShell 5's Compress-Archive writes backslashes, which breaks on macOS/Linux.)
console.log(`Packaging extension into ${ZIP_FILE}...`);
if (process.platform === 'win32') {
  const tar = path.join(process.env.SystemRoot || 'C:\Windows', 'System32', 'tar.exe'); // bsdtar
  execSync(`"${tar}" -a -c -f "${ZIP_FILE}" -C "${DIST_DIR}" *`, { stdio: 'inherit', shell: 'cmd.exe' });
} else {
  execSync(`cd "${DIST_DIR}" && zip -r -X "${ZIP_FILE}" .`, { stdio: 'inherit' });
}
fs.copyFileSync(ZIP_FILE, LATEST_ZIP);

console.log(`Release created successfully: ${ZIP_FILE}`);
