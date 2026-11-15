import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const ZIP_FILE = path.join(RELEASE_DIR, 'pixora-v1.0.0-chrome-extension.zip');

if (!fs.existsSync(DIST_DIR)) {
  console.log('Building project before packaging...');
  execSync('npm run build', { stdio: 'inherit' });
}

if (!fs.existsSync(RELEASE_DIR)) {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });
}

if (fs.existsSync(ZIP_FILE)) {
  fs.unlinkSync(ZIP_FILE);
}

// Use PowerShell Compress-Archive on Windows
console.log(`Packaging extension into ${ZIP_FILE}...`);
const psCommand = `Compress-Archive -Path "${DIST_DIR}\\*" -DestinationPath "${ZIP_FILE}" -Force`;
execSync(`powershell -NoProfile -Command "${psCommand}"`, { stdio: 'inherit' });

console.log(`Release created successfully: ${ZIP_FILE}`);
