#!/usr/bin/env node
// ContX Native Messaging Host
// Receives tweet data from the Chrome extension and writes tweets.md

const fs = require('fs');
const path = require('path');

const CONTX_DIR = path.join(require('os').homedir(), '.contx');
const TWEETS_FILE = path.join(CONTX_DIR, 'tweets.md');

// --- Native Messaging Protocol ---
// Messages are prefixed with 4-byte little-endian length

function readMessage() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let headerRead = false;
    let messageLength = 0;
    let bodyRead = 0;

    process.stdin.on('readable', () => {
      let chunk;
      while ((chunk = process.stdin.read()) !== null) {
        chunks.push(chunk);
        const buffer = Buffer.concat(chunks);

        if (!headerRead && buffer.length >= 4) {
          messageLength = buffer.readUInt32LE(0);
          headerRead = true;
          // Reset chunks to only contain body
          chunks.length = 0;
          if (buffer.length > 4) {
            chunks.push(buffer.slice(4));
          }
          bodyRead = buffer.length - 4;
        } else if (headerRead) {
          bodyRead += chunk.length;
        }

        if (headerRead) {
          const body = Buffer.concat(chunks);
          if (body.length >= messageLength) {
            const json = body.slice(0, messageLength).toString('utf8');
            try {
              resolve(JSON.parse(json));
            } catch (e) {
              reject(new Error('Invalid JSON: ' + e.message));
            }
            return;
          }
        }
      }
    });

    process.stdin.on('end', () => {
      reject(new Error('stdin ended before full message received'));
    });
  });
}

function sendMessage(obj) {
  const json = JSON.stringify(obj);
  const buffer = Buffer.from(json, 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(buffer.length, 0);
  process.stdout.write(header);
  process.stdout.write(buffer);
}

// --- Tweet Processing ---

function generateMarkdown(tweets) {
  let md = '# ContX — Saved Tweets\n\n';
  md += 'Tweets saved via ContX Chrome extension. Newest first.\n\n';
  md += '---\n\n';

  for (const tweet of tweets) {
    const title = (tweet.text || '').replace(/\n/g, ' ').trim();
    const shortTitle = title.length <= 60 ? title : title.substring(0, 57) + '...';
    const dateSaved = tweet.savedAt ? tweet.savedAt.split('T')[0] : 'unknown';

    md += `## ${shortTitle}\n`;
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

    const quotedText = (tweet.text || '').split('\n').join('\n> ');
    md += `\n> ${quotedText}\n`;

    if (tweet.quoteTweet) {
      md += `\n> **Quoting ${tweet.quoteTweet.handle}:**\n`;
      md += `> > ${tweet.quoteTweet.text.split('\n').join('\n> > ')}\n`;
      if (tweet.quoteTweet.url) {
        md += `> > Source: ${tweet.quoteTweet.url}\n`;
      }
    }

    md += '\n---\n\n';
  }

  return md;
}

// --- Main ---

async function main() {
  try {
    const message = await readMessage();

    if (message.action === 'write-tweets') {
      // Ensure directory exists
      if (!fs.existsSync(CONTX_DIR)) {
        fs.mkdirSync(CONTX_DIR, { recursive: true });
      }

      const markdown = generateMarkdown(message.tweets);
      fs.writeFileSync(TWEETS_FILE, markdown, 'utf8');

      sendMessage({ success: true, path: TWEETS_FILE });
    } else if (message.action === 'ping') {
      sendMessage({ success: true, version: '1.0.0', path: TWEETS_FILE });
    } else {
      sendMessage({ success: false, error: 'Unknown action: ' + message.action });
    }
  } catch (err) {
    sendMessage({ success: false, error: err.message });
  }

  process.exit(0);
}

main();
