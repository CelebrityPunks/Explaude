#!/usr/bin/env node
// Explaude CLI — Sets up Native Messaging Host for the Explaude Chrome Extension

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const HOME = os.homedir();
const CONTX_DIR = path.join(HOME, '.explaude');
const HOST_NAME = 'com.explaude.native';
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
  console.log('Usage: explaude setup --id=<extension-id>');
  console.log('       explaude uninstall');
  process.exit(1);
}

function setup() {
  if (!extensionId) {
    console.error('\n  Missing extension ID.');
    console.error('  Find it at chrome://extensions/ and run:');
    console.error('  npx explaude setup --id=YOUR_EXTENSION_ID\n');
    process.exit(1);
  }

  console.log('\n  Explaude Setup');
  console.log('  ──────────────────────────\n');

  // 1. Create ~/.explaude directory
  if (!fs.existsSync(CONTX_DIR)) {
    fs.mkdirSync(CONTX_DIR, { recursive: true });
  }
  console.log('  [1/5] Created ~/.explaude/');

  // 2. Copy native host script and fix shebang with absolute node path
  const hostSrc = path.join(__dirname, '..', 'native-host', 'host.js');
  const hostDst = path.join(CONTX_DIR, 'host.js');
  fs.copyFileSync(hostSrc, hostDst);

  // Chrome doesn't inherit the user's shell PATH, so #!/usr/bin/env node won't work.
  // Replace the shebang with the absolute path to node.
  if (PLATFORM !== 'win32') {
    const nodePath = process.execPath;
    let hostContent = fs.readFileSync(hostDst, 'utf8');
    hostContent = hostContent.replace(/^#!.*\n/, `#!${nodePath}\n`);
    fs.writeFileSync(hostDst, hostContent, 'utf8');
  }
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
    description: 'Explaude — Save tweets as context for Claude Code',
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
    fs.writeFileSync(tweetsFile, '# Explaude — Saved Tweets\n\nNo tweets saved yet. Right-click a tweet on Twitter/X to get started!\n');
  }
  console.log('  [4/5] Created tweets file');

  // 6. Update Claude's CLAUDE.md
  const claudeMdPath = path.join(HOME, '.claude', 'CLAUDE.md');
  const explaudeLine = `\n# Explaude\nSaved tweets are stored at ${tweetsFile.replace(/\\/g, '/')} — read this file when the user asks about saved tweets or bookmarks.\n`;

  try {
    if (fs.existsSync(claudeMdPath)) {
      const existing = fs.readFileSync(claudeMdPath, 'utf8');
      if (!existing.includes('Explaude')) {
        fs.appendFileSync(claudeMdPath, explaudeLine);
      }
    } else {
      const claudeDir = path.join(HOME, '.claude');
      if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
      fs.writeFileSync(claudeMdPath, explaudeLine);
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
  console.log('\n  Explaude Uninstall');
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

  // Don't delete ~/.explaude — user may want to keep their tweets
  console.log('  Note: ~/.explaude/ and tweets.md were NOT deleted (your data is safe).');
  console.log('\n  Uninstall complete.\n');
}
