// Explaude — Service Worker
// Handles context menu, message routing, storage, and native messaging export

const NATIVE_HOST = 'com.explaude.native';

// --- Context Menu Setup ---

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'save-to-explaude',
    title: 'Save to Explaude',
    contexts: ['all'],
    documentUrlPatterns: [
      'https://twitter.com/*',
      'https://x.com/*',
      'https://mobile.twitter.com/*'
    ]
  });

  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/welcome.html') });
    chrome.storage.local.set({ tweets: [] });
  }
});

// --- Context Menu Click ---

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'save-to-explaude' || !tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape-tweet' });
    await handleScrapedTweet(response, tab.id);
  } catch (err) {
    if (err.message?.includes('Receiving end does not exist')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/twitter-scraper.js']
        });
        await new Promise(r => setTimeout(r, 150));
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape-tweet' });
        await handleScrapedTweet(response, tab.id);
      } catch (retryErr) {
        showNotification(tab.id, 'error', 'Please refresh the page and try again.');
      }
    } else {
      showNotification(tab.id, 'error', 'Something went wrong. Try again.');
    }
  }
});

async function handleScrapedTweet(response, tabId) {
  if (!response || !response.success) {
    showNotification(tabId, 'error', response?.error || 'Could not read tweet data.');
    return;
  }

  const { tweets } = await chrome.storage.local.get(['tweets']);
  const tweetList = tweets || [];

  if (tweetList.find(t => t.id === response.data.id)) {
    showNotification(tabId, 'duplicate', 'Already saved!');
    return;
  }

  tweetList.unshift(response.data);
  await chrome.storage.local.set({ tweets: tweetList });
  updateBadge(tweetList.length);
  showNotification(tabId, 'success', `Saved tweet by ${response.data.handle}`);

  // Auto-export via native messaging
  autoExport(tweetList);
}

// --- Auto-Export via Native Messaging ---

function autoExport(tweets) {
  chrome.runtime.sendNativeMessage(
    NATIVE_HOST,
    { action: 'write-tweets', tweets: tweets },
    (response) => {
      if (chrome.runtime.lastError) {
        // Native host not installed — that's OK, tweets are still in chrome.storage
        console.log('[Explaude] Native host not available:', chrome.runtime.lastError.message);
        return;
      }
      if (response && !response.success) {
        console.error('[Explaude] Native write failed:', response.error);
      }
    }
  );
}

// --- Badge ---

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#F28C38' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.storage.local.get(['tweets'], (result) => {
  updateBadge(result.tweets?.length || 0);
});

// --- Toast Notifications ---

function showNotification(tabId, type, message) {
  const colors = { success: '#F28C38', error: '#ef4444', duplicate: '#F5A05E' };
  const icons = { success: '\u2713', error: '\u2717', duplicate: '\u26A0' };

  chrome.scripting.executeScript({
    target: { tabId },
    func: (msg, color, icon) => {
      const existing = document.getElementById('explaude-notification');
      if (existing) existing.remove();

      const div = document.createElement('div');
      div.id = 'explaude-notification';
      div.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        background: ${color}; color: white; padding: 12px 20px;
        border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        display: flex; align-items: center; gap: 8px;
        animation: explaudeSlideIn 0.3s ease-out;
        transition: opacity 0.3s ease;
      `;
      div.innerHTML = `<span style="font-size:18px">${icon}</span> ${msg}`;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes explaudeSlideIn {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `;
      document.head.appendChild(style);
      document.body.appendChild(div);

      setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => { div.remove(); style.remove(); }, 300);
      }, 2500);
    },
    args: [message, colors[type], icons[type]]
  });
}

// --- Message handler for popup ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'update-badge') {
    updateBadge(message.count);
  }
  if (message.action === 'trigger-export') {
    chrome.storage.local.get(['tweets'], (result) => {
      autoExport(result.tweets || []);
      sendResponse({ success: true });
    });
    return true;
  }
});
