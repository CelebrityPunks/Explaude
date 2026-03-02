document.addEventListener('DOMContentLoaded', async () => {
  const tweetListEl = document.getElementById('tweet-list');
  const emptyStateEl = document.getElementById('empty-state');
  const countEl = document.getElementById('tweet-count');
  const searchInput = document.getElementById('search-input');
  const exportBtn = document.getElementById('export-btn');
  const copyBtn = document.getElementById('copy-btn');
  const clearBtn = document.getElementById('clear-btn');
  const welcomeLink = document.getElementById('welcome-link');

  let allTweets = [];

  async function loadTweets() {
    const { tweets } = await chrome.storage.local.get(['tweets']);
    allTweets = tweets || [];
    renderTweets(allTweets);
  }

  function renderTweets(tweets) {
    countEl.textContent = tweets.length;

    if (tweets.length === 0) {
      tweetListEl.style.display = 'none';
      emptyStateEl.style.display = 'block';
      return;
    }

    tweetListEl.style.display = 'block';
    emptyStateEl.style.display = 'none';

    tweetListEl.innerHTML = tweets.map((tweet) => {
      const date = new Date(tweet.savedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      });
      const textPreview = escapeHtml((tweet.text || '').substring(0, 180));
      const tags = [];
      if (tweet.hasMedia) tags.push(...tweet.mediaTypes);
      if (tweet.quoteTweet) tags.push('quote');

      return `
        <div class="tweet-item" data-id="${tweet.id}">
          <div class="tweet-meta">
            <div>
              <span class="tweet-author">${escapeHtml(tweet.author)}</span>
              <span class="tweet-handle">${escapeHtml(tweet.handle)}</span>
            </div>
            <span class="tweet-date">${date}</span>
          </div>
          <div class="tweet-text">${textPreview}</div>
          ${tags.length > 0 ? `<div class="tweet-tags">${tags.map(t => `<span class="tweet-tag">${t}</span>`).join('')}</div>` : ''}
          <div class="tweet-actions">
            <button class="tweet-action-btn open-btn" data-url="${escapeHtml(tweet.url)}">Open</button>
            <button class="tweet-action-btn copy-single-btn" data-id="${tweet.id}">Copy MD</button>
            <button class="tweet-action-btn delete" data-id="${tweet.id}">Delete</button>
          </div>
        </div>
      `;
    }).join('');

    attachListeners();
  }

  function attachListeners() {
    tweetListEl.querySelectorAll('.open-btn').forEach(btn => {
      btn.addEventListener('click', () => chrome.tabs.create({ url: btn.dataset.url }));
    });

    tweetListEl.querySelectorAll('.copy-single-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tweet = allTweets.find(t => t.id === btn.dataset.id);
        if (tweet) {
          await navigator.clipboard.writeText(tweetToMarkdown(tweet));
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy MD'; }, 1200);
        }
      });
    });

    tweetListEl.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', async () => {
        allTweets = allTweets.filter(t => t.id !== btn.dataset.id);
        await chrome.storage.local.set({ tweets: allTweets });
        renderTweets(allTweets);
        chrome.runtime.sendMessage({ action: 'update-badge', count: allTweets.length });
        chrome.runtime.sendMessage({ action: 'trigger-export' });
      });
    });
  }

  // Search
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    if (!q) { renderTweets(allTweets); return; }
    renderTweets(allTweets.filter(t =>
      (t.text || '').toLowerCase().includes(q) ||
      (t.author || '').toLowerCase().includes(q) ||
      (t.handle || '').toLowerCase().includes(q)
    ));
  });

  // Export .md (manual save-as)
  exportBtn.addEventListener('click', () => {
    if (allTweets.length === 0) return;
    const md = generateFullMarkdown(allTweets);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename: 'contx-tweets.md', saveAs: true });
  });

  // Copy all
  copyBtn.addEventListener('click', async () => {
    if (allTweets.length === 0) return;
    await navigator.clipboard.writeText(generateFullMarkdown(allTweets));
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy All'; }, 1200);
  });

  // Clear all
  clearBtn.addEventListener('click', async () => {
    if (allTweets.length === 0) return;
    if (confirm(`Delete all ${allTweets.length} saved tweets?`)) {
      allTweets = [];
      await chrome.storage.local.set({ tweets: [] });
      renderTweets([]);
      chrome.runtime.sendMessage({ action: 'update-badge', count: 0 });
    }
  });

  // Welcome page link
  welcomeLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/welcome.html') });
  });

  await loadTweets();
});

// --- Markdown generation ---

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
    md += `- **Tweet date:** ${tweet.timestamp.split('T')[0]}\n`;
  }
  if (tweet.hasMedia) {
    md += `- **Media:** ${tweet.mediaCount} ${tweet.mediaTypes.join(', ')}\n`;
  }

  md += `\n> ${(tweet.text || '').split('\n').join('\n> ')}\n`;

  if (tweet.quoteTweet) {
    md += `\n> **Quoting ${tweet.quoteTweet.handle}:**\n`;
    md += `> > ${tweet.quoteTweet.text.split('\n').join('\n> > ')}\n`;
    if (tweet.quoteTweet.url) {
      md += `> > Source: ${tweet.quoteTweet.url}\n`;
    }
  }

  md += '\n---\n';
  return md;
}

function generateFullMarkdown(tweets) {
  let md = '# ContX — Saved Tweets\n\n';
  md += 'Tweets saved via ContX Chrome extension. Newest first.\n\n';
  md += '---\n\n';
  for (const tweet of tweets) {
    md += tweetToMarkdown(tweet) + '\n';
  }
  return md;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
