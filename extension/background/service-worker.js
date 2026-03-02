// ContX — Service Worker
// Handles context menu, message routing, storage, auto-export, and notifications

// --- Context Menu Setup ---

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({
    id: 'save-to-contx',
    title: 'Save to ContX',
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
  if (info.menuItemId !== 'save-to-contx' || !tab?.id) return;

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape-tweet' });
    await handleScrapedTweet(response, tab.id);
  } catch (err) {
    // Content script may not be injected yet (page loaded before install)
    if (err.message?.includes('Receiving end does not exist')) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-scripts/twitter-scraper.js']
        });
        // Brief delay for script to initialize
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

  // Deduplicate
  if (tweetList.find(t => t.id === response.data.id)) {
    showNotification(tabId, 'duplicate', 'Already saved!');
    return;
  }

  tweetList.unshift(response.data);
  await chrome.storage.local.set({ tweets: tweetList });
  updateBadge(tweetList.length);
  autoExport(tweetList);
  showNotification(tabId, 'success', `Saved tweet by ${response.data.handle}`);
}

// --- Auto-Export to ~/Downloads/contx/tweets.md ---

async function autoExport(tweets) {
  const markdown = generateMarkdown(tweets);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url: url,
      filename: 'contx/tweets.md',
      saveAs: false,
      conflictAction: 'overwrite'
    });
  } catch (err) {
    console.error('[ContX] Auto-export failed:', err);
  }
}

function generateMarkdown(tweets) {
  let md = '# ContX — Saved Tweets\n\n';
  md += 'Tweets saved via ContX Chrome extension. Newest first.\n\n';
  md += '---\n\n';

  for (const tweet of tweets) {
    md += tweetToMarkdown(tweet) + '\n';
  }

  return md;
}

function tweetToMarkdown(tweet) {
  const title = (tweet.text || '').replace(/\n/g, ' ').trim();
  const shortTitle = title.length <= 60 ? title : title.substring(0, 57) + '...';
  const dateSaved = tweet.savedAt ? tweet.savedAt.split('T')[0] : 'unknown';

  let md = `## ${shortTitle}\n`;
  md += `- **Date saved:** ${dateSaved}\n`;
  md += `- **Source:** ${tweet.url}\n`;
  md += `- **Author:** ${tweet.handle}\n`;
  md += `- **Author name:** ${tweet.author}\n`;

  if (tweet.timestamp) {
    const tweetDate = tweet.timestamp.split('T')[0];
    md += `- **Tweet date:** ${tweetDate}\n`;
  }

  if (tweet.hasMedia) {
    md += `- **Media:** ${tweet.mediaCount} ${tweet.mediaTypes.join(', ')}\n`;
  }

  const quotedText = (tweet.text || '').split('\n').join('\n> ');
  md += `\n> ${quotedText}\n`;

  if (tweet.quoteTweet) {
    md += `\n> **Quoting ${tweet.quoteTweet.handle}:**\n`;
    const qtText = tweet.quoteTweet.text.split('\n').join('\n> > ');
    md += `> > ${qtText}\n`;
    if (tweet.quoteTweet.url) {
      md += `> > Source: ${tweet.quoteTweet.url}\n`;
    }
  }

  md += '\n---\n';
  return md;
}

// --- Badge ---

function updateBadge(count) {
  if (count > 0) {
    chrome.action.setBadgeText({ text: String(count) });
    chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Initialize badge on startup
chrome.storage.local.get(['tweets'], (result) => {
  updateBadge(result.tweets?.length || 0);
});

// --- Toast Notifications ---

function showNotification(tabId, type, message) {
  const colors = { success: '#22c55e', error: '#ef4444', duplicate: '#f59e0b' };
  const icons = { success: '\u2713', error: '\u2717', duplicate: '\u26A0' };

  chrome.scripting.executeScript({
    target: { tabId },
    func: (msg, color, icon) => {
      const existing = document.getElementById('contx-notification');
      if (existing) existing.remove();

      const div = document.createElement('div');
      div.id = 'contx-notification';
      div.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 999999;
        background: ${color}; color: white; padding: 12px 20px;
        border-radius: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px; font-weight: 600; box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        display: flex; align-items: center; gap: 8px;
        animation: contxSlideIn 0.3s ease-out;
        transition: opacity 0.3s ease;
      `;
      div.innerHTML = `<span style="font-size:18px">${icon}</span> ${msg}`;

      const style = document.createElement('style');
      style.textContent = `
        @keyframes contxSlideIn {
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
