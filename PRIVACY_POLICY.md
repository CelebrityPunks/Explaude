# ContX Privacy Policy

**Last updated:** March 2, 2026

## Overview

ContX is a Chrome extension that saves tweets from Twitter/X as markdown files on your local machine. We are committed to protecting your privacy.

## Data Collection

**ContX does NOT collect, transmit, or store any data on external servers.**

All data is stored locally on your device:
- Saved tweet data (text, author, URL, date) is stored in Chrome's local extension storage (`chrome.storage.local`)
- Exported markdown files are written to your local filesystem (`~/.contx/tweets.md`) via an optional Native Messaging Host

## Data That Is Accessed

ContX accesses the following data **only on twitter.com and x.com**:
- Tweet text content
- Tweet author name and handle
- Tweet timestamp
- Tweet URL
- Media presence (image/video/poll indicators — media files themselves are NOT downloaded)

This data is accessed only when you explicitly right-click a tweet and select "Save to ContX."

## Third-Party Services

ContX does not communicate with any third-party services, APIs, or servers. There is no analytics, no tracking, and no telemetry.

## Data Storage

- All data remains on your local machine
- Tweet data is stored in Chrome's extension storage (cleared when the extension is uninstalled)
- Exported files are stored at a location you control (`~/.contx/tweets.md`)
- You can delete all saved data at any time via the extension popup ("Clear All") or by deleting the `~/.contx/` directory

## Permissions

- **contextMenus**: Adds "Save to ContX" to the right-click menu on Twitter/X
- **storage**: Stores saved tweets locally in Chrome
- **activeTab**: Accesses the current Twitter/X tab to read tweet content when you save
- **nativeMessaging**: Communicates with a local script to write the markdown file to disk
- **scripting**: Injects the tweet-reading script into Twitter/X pages

## Open Source

ContX is fully open source. You can review all code at:
https://github.com/CelebrityPunks/contx

## Contact

For questions or concerns about this privacy policy, please open an issue at:
https://github.com/CelebrityPunks/contx/issues
