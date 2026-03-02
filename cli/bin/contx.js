#!/usr/bin/env node
// ContX CLI — Sets up Native Messaging Host for the ContX Chrome Extension

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const CONTX_DIR = path.join(HOME, '.contx');
const HOST_NAME = 'com.contx.native';
const PLATFORM = process.platform;

const args = process.argv.slice(2);
const command = args[0] || 'setup';

// Parse --id flag
let extensionId = null;
for (const arg of args) {
  if (arg.startsWith('--id=')) {
    extensionId = arg.split('=')[1];
  }
}

if (command === 'setup') {
  setup();
} else if (command === 'uninstall') {
  uninstall();
} else {
  console.log('Usage: contx setup --id=<extension-id>');
  console.log('       contx uninstall');
  process.exit(1);
}

function setup() {
  if (!extensionId) {
    console.error('\n  Missing extension ID.');
    console.error('  Find it at chrome://extensions/ and run:');
    console.error('  npx contx setup --id=YOUR_EXTENSION_ID\n');
    process.exit(1);
  }

  console.log('\n  ContX Setup');
  console.log('  ──────────────────────────\n');

  // 1. Create ~/.contx directory
  if (!fs.existsSync(CONTX_DIR)) {
    fs.mkdirSync(CONTX_DIR, { recursive: true });
  }
  console.log('  [1/5] Created ~/.contx/');

  // 2. Copy native host script
  const hostSrc = path.join(__dirname, '..', 'native-host', 'host.js');
  const hostDst = path.join(CONTX_DIR, 'host.js');
  fs.copyFileSync(hostSrc, hostDst);
  console.log('  [2/5] Installed native messaging host');

  // 3. Create launcher (Windows needs .bat, Mac/Linux use shebang)
  let hostPath;
  if (PLATFORM === 'win32') {
    const batContent = `@echo off\r\nnode "%~dp0host.js"\r\n`;
    const batPath = path.join(CONTX_DIR, 'host.bat');
    fs.writeFileSync(batPath, batContent);
    hostPath = batPath;
  } else {
    fs.chmodSync(hostDst, '755');
    hostPath = hostDst;
  }

  // 4. Create native messaging manifest
  const manifest = {
    name: HOST_NAME,
    description: 'ContX — Save tweets as context for Claude Code',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`]
  };

  const manifestJson = JSON.stringify(manifest, null, 2);

  if (PLATFORM === 'win32') {
    // Windows: save manifest and register in registry
    const manifestPath = path.join(CONTX_DIR, 'native-manifest.json');
    fs.writeFileSync(manifestPath, manifestJson);
    try {
      execSync(`reg add "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /ve /t REG_SZ /d "${manifestPath}" /f`, { stdio: 'pipe' });
    } catch (e) {
      console.error('  Failed to register with Chrome. You may need to run as administrator.');
      process.exit(1);
    }
  } else if (PLATFORM === 'darwin') {
    // Mac: write manifest to Chrome's NativeMessagingHosts directory
    const chromeDir = path.join(HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
    if (!fs.existsSync(chromeDir)) fs.mkdirSync(chromeDir, { recursive: true });
    fs.writeFileSync(path.join(chromeDir, `${HOST_NAME}.json`), manifestJson);
  } else {
    // Linux: write to ~/.config/google-chrome/NativeMessagingHosts/
    const chromeDir = path.join(HOME, '.config', 'google-chrome', 'NativeMessagingHosts');
    if (!fs.existsSync(chromeDir)) fs.mkdirSync(chromeDir, { recursive: true });
    fs.writeFileSync(path.join(chromeDir, `${HOST_NAME}.json`), manifestJson);
  }
  console.log('  [3/5] Registered with Chrome');

  // 5. Create initial tweets.md
  const tweetsFile = path.join(CONTX_DIR, 'tweets.md');
  if (!fs.existsSync(tweetsFile)) {
    fs.writeFileSync(tweetsFile, '# ContX — Saved Tweets\n\nNo tweets saved yet. Right-click a tweet on Twitter/X to get started!\n');
  }
  console.log('  [4/5] Created tweets file');

  // 6. Update Claude's CLAUDE.md
  const claudeMdPath = path.join(HOME, '.claude', 'CLAUDE.md');
  const contxLine = `\n# ContX\nSaved tweets are stored at ${tweetsFile.replace(/\\/g, '/')} — read this file when the user asks about saved tweets or bookmarks.\n`;

  try {
    if (fs.existsSync(claudeMdPath)) {
      const existing = fs.readFileSync(claudeMdPath, 'utf8');
      if (!existing.includes('ContX')) {
        fs.appendFileSync(claudeMdPath, contxLine);
      }
    } else {
      const claudeDir = path.join(HOME, '.claude');
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(claudeMdPath, contxLine);
    }
    console.log('  [5/5] Configured Claude Code');
  } catch (e) {
    console.log('  [5/5] Could not update CLAUDE.md — add this manually:');
    console.log(`        Tweets at: ${tweetsFile}`);
  }

  console.log('\n  ──────────────────────────');
  console.log('  Setup complete!\n');
  console.log(`  Tweets will save to: ${tweetsFile}`);
  console.log('  Restart Chrome, then right-click any tweet to save it.\n');
}

function uninstall() {
  console.log('\n  ContX Uninstall');
  console.log('  ──────────────────────────\n');

  if (PLATFORM === 'win32') {
    try {
      execSync(`reg delete "HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${HOST_NAME}" /f`, { stdio: 'pipe' });
      console.log('  Removed Chrome registry entry');
    } catch (e) { /* not registered */ }
  } else if (PLATFORM === 'darwin') {
    const manifestPath = path.join(HOME, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', `${HOST_NAME}.json`);
    if (fs.existsSync(manifestPath)) { fs.unlinkSync(manifestPath); console.log('  Removed Chrome manifest'); }
  } else {
    const manifestPath = path.join(HOME, '.config', 'google-chrome', 'NativeMessagingHosts', `${HOST_NAME}.json`);
    if (fs.existsSync(manifestPath)) { fs.unlinkSync(manifestPath); console.log('  Removed Chrome manifest'); }
  }

  // Don't delete ~/.contx — user may want to keep their tweets
  console.log('  Note: ~/.contx/ and tweets.md were NOT deleted (your data is safe).');
  console.log('\n  Uninstall complete.\n');
}
