// ContX — Twitter/X Tweet Scraper
// Content script injected on twitter.com and x.com
// Captures right-clicked element and scrapes tweet data on demand

let lastRightClickedElement = null;

// Capture the element the user right-clicked on
document.addEventListener('contextmenu', (event) => {
  lastRightClickedElement = event.target;
}, true);

// Listen for scrape requests from the service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'scrape-tweet') {
    const result = scrapeTweetFromElement(lastRightClickedElement);
    sendResponse(result);
  }
  return true;
});

function scrapeTweetFromElement(element) {
  if (!element) {
    return { success: false, error: 'No element targeted' };
  }

  const tweetArticle = element.closest('article[data-testid="tweet"]')
    || element.closest('article[role="article"]');

  if (!tweetArticle) {
    return { success: false, error: 'Right-click directly on a tweet to save it.' };
  }

  try {
    const tweetText = extractTweetText(tweetArticle);
    const { displayName, handle } = extractAuthor(tweetArticle);
    const { timestamp, relativeTime } = extractTimestamp(tweetArticle);
    const tweetUrl = extractTweetUrl(tweetArticle);
    const mediaInfo = extractMediaInfo(tweetArticle);
    const quoteTweet = extractQuoteTweet(tweetArticle);

    return {
      success: true,
      data: {
        id: generateTweetId(tweetUrl, timestamp),
        text: tweetText,
        author: displayName,
        handle: handle,
        timestamp: timestamp,
        relativeTime: relativeTime,
        url: tweetUrl,
        hasMedia: mediaInfo.hasMedia,
        mediaTypes: mediaInfo.types,
        mediaCount: mediaInfo.count,
        quoteTweet: quoteTweet,
        savedAt: new Date().toISOString()
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// --- Extraction functions ---

function extractTweetText(article) {
  const textEl = article.querySelector('[data-testid="tweetText"]');
  if (!textEl) return '[Media-only tweet]';

  let text = '';
  for (const node of textEl.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.tagName === 'IMG') {
      text += node.alt || '';
    } else if (node.tagName === 'BR') {
      text += '\n';
    } else {
      text += node.textContent;
    }
  }
  return text.trim();
}

function extractAuthor(article) {
  const userNameEl = article.querySelector('[data-testid="User-Name"]');
  if (!userNameEl) {
    return { displayName: 'Unknown', handle: '@unknown' };
  }

  const allText = userNameEl.textContent;
  const handleMatch = allText.match(/@[\w]+/);
  const handle = handleMatch ? handleMatch[0] : '@unknown';

  let displayName = 'Unknown';
  const firstLink = userNameEl.querySelector('a[role="link"]');
  if (firstLink) {
    const nameSpans = firstLink.querySelectorAll('span');
    if (nameSpans.length > 0) {
      displayName = nameSpans[0].textContent.trim();
    }
  }

  return { displayName, handle };
}

function extractTimestamp(article) {
  const timeEl = article.querySelector('time');
  if (!timeEl) {
    return { timestamp: new Date().toISOString(), relativeTime: 'unknown' };
  }
  return {
    timestamp: timeEl.getAttribute('datetime') || new Date().toISOString(),
    relativeTime: timeEl.textContent.trim()
  };
}

function extractTweetUrl(article) {
  // The canonical tweet link is usually the one wrapping the timestamp
  const timeEl = article.querySelector('time');
  if (timeEl) {
    const timeLink = timeEl.closest('a');
    if (timeLink && timeLink.href.includes('/status/')) {
      return timeLink.href;
    }
  }

  const statusLink = article.querySelector('a[href*="/status/"]');
  if (statusLink) return statusLink.href;

  return window.location.href;
}

function extractMediaInfo(article) {
  const types = [];
  let count = 0;

  const photos = article.querySelectorAll('[data-testid="tweetPhoto"]');
  if (photos.length > 0) { types.push('image'); count += photos.length; }

  const videos = article.querySelectorAll('video, [data-testid="videoPlayer"]');
  if (videos.length > 0) { types.push('video'); count += videos.length; }

  const polls = article.querySelectorAll('[data-testid="cardPoll"]');
  if (polls.length > 0) { types.push('poll'); count += polls.length; }

  return { hasMedia: count > 0, types, count };
}

function extractQuoteTweet(article) {
  // Look for quoted tweet container
  const quoteEl = article.querySelector('[data-testid="quoteTweet"]');
  if (quoteEl) return extractQuoteTweetData(quoteEl);

  // Fallback: nested article that isn't the main one
  const innerArticles = article.querySelectorAll('article[data-testid="tweet"]');
  for (const inner of innerArticles) {
    if (inner !== article) return extractQuoteTweetData(inner);
  }

  return null;
}

function extractQuoteTweetData(el) {
  const text = el.querySelector('[data-testid="tweetText"]')?.textContent || '';
  const handleMatch = el.querySelector('[data-testid="User-Name"]')
    ?.textContent?.match(/@[\w]+/);
  const handle = handleMatch ? handleMatch[0] : '@unknown';
  const url = el.querySelector('a[href*="/status/"]')?.href || '';
  return { text, handle, url };
}

function generateTweetId(url, timestamp) {
  const statusMatch = url.match(/\/status\/(\d+)/);
  if (statusMatch) return 'tweet-' + statusMatch[1];
  return 'tweet-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}
