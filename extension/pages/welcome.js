document.addEventListener('DOMContentLoaded', () => {
  // Display extension ID so user can copy the full setup command
  const extIdEl = document.getElementById('ext-id');
  extIdEl.textContent = chrome.runtime.id;

  // Copy command
  document.getElementById('copy-cmd-btn').addEventListener('click', async () => {
    const btn = document.getElementById('copy-cmd-btn');
    const command = `npx contx setup --id=${chrome.runtime.id}`;
    await navigator.clipboard.writeText(command);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
  });

  // Start saving
  document.getElementById('start-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://x.com' });
  });

  chrome.storage.local.set({ welcomeSeen: true });
});
