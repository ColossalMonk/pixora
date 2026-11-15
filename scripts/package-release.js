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

if (!fs.existsSync(DIST_DIR)) {
  console.log('Building project before packaging...');
  execSync('npm run build', { stdio: 'inherit' });
}

if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

if (fs.existsSync(ZIP_FILE)) fs.unlinkSync(ZIP_FILE);
if (fs.existsSync(LATEST_ZIP)) fs.unlinkSync(LATEST_ZIP);

// Use PowerShell Compress-Archive with suppressed progress on Windows
console.log(`Packaging extension into ${ZIP_FILE}...`);
const psCommand = `$ProgressPreference = 'SilentlyContinue'; Compress-Archive -Path "${DIST_DIR}\\*" -DestinationPath "${ZIP_FILE}" -Force; Copy-Item "${ZIP_FILE}" "${LATEST_ZIP}" -Force`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

console.log(`Release created successfully: ${ZIP_FILE}`);
