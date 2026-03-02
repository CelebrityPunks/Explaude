document.addEventListener('DOMContentLoaded', () => {
  const isWindows = navigator.platform.includes('Win');
  const pathDisplay = document.getElementById('path-display');
  const pathNote = document.getElementById('path-note');

  if (isWindows) {
    pathDisplay.textContent = '~/Downloads/contx/tweets.md';
    pathNote.textContent = 'On Windows this is typically: C:\\Users\\YourName\\Downloads\\contx\\tweets.md';
  } else {
    pathDisplay.textContent = '~/Downloads/contx/tweets.md';
    pathNote.textContent = 'On Mac/Linux this is: ~/Downloads/contx/tweets.md';
  }

  // Copy prompt
  const copyBtn = document.getElementById('copy-prompt-btn');
  const promptEl = document.getElementById('claude-prompt');

  copyBtn.addEventListener('click', async () => {
    const text = promptEl.textContent;
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });

  // Start saving button
  document.getElementById('start-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://x.com' });
  });

  // Mark welcome as seen
  chrome.storage.local.set({ welcomeSeen: true });
});
