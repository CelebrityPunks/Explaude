# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Explaude** is a Chrome Extension + Node.js CLI tool that saves tweets from Twitter/X as markdown files, making them available as context for Claude Code. Two main components:

1. **Chrome Extension** (`extension/`) — Manifest v3 extension that adds a right-click context menu on Twitter/X to save tweets to `chrome.storage.local`, then auto-exports via native messaging to disk.
2. **CLI Setup Tool** (`cli/`) — Published as `explaude` on npm. Registers the native messaging host so Chrome can write to `~/.explaude/tweets.md`.

## Architecture & Data Flow

1. User right-clicks tweet → service worker sends message to content script
2. `twitter-scraper.js` scrapes tweet data (text, author, media, quotes) from the DOM
3. Service worker stores in `chrome.storage.local`, checks duplicates, updates badge
4. Service worker sends native message → `cli/native-host/host.js` writes `~/.explaude/tweets.md`

Native messaging registration is platform-specific: Windows (registry), macOS (`~/Library/Application Support/`), Linux (`~/.config/`).

## Key Files

- `extension/manifest.json` — Chrome extension manifest (v3)
- `extension/background/service-worker.js` — Context menu, storage, native messaging, toast notifications
- `extension/content-scripts/twitter-scraper.js` — DOM scraping on twitter.com/x.com
- `extension/popup/popup.js` — Search, copy, delete, export UI
- `cli/bin/explaude.js` — CLI entry point (`npx explaude setup --id=<EXT_ID>`)
- `cli/native-host/host.js` — Native messaging host that writes markdown to disk

## Development

- **No build step** — vanilla JS, served directly by Chrome
- **No external dependencies** — CLI uses only Node.js built-ins (fs, path, os, child_process)
- **No test framework** configured
- **Load extension**: `chrome://extensions/` → "Load unpacked" → select `extension/` directory
- **CLI setup**: `npx explaude setup --id=<EXTENSION_ID>`
- **Package for distribution**: zip the `extension/` directory

## Conventions

- **Brand colors**: black background, orange accents (`#F28C38`)
- **Markdown generation** exists in both `popup.js` and `native-host/host.js` — keep them in sync
- **Duplicate detection** uses unique tweet IDs derived from tweet URL or timestamp
- **Toast colors**: green = success, orange = duplicate, red = error
