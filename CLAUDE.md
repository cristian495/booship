# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Booship is a static encrypted memories website. Users write memories (photos, quotes, text) in plaintext, a build script encrypts everything with AES-256-GCM, and the encrypted output is deployed to GitHub Pages. The site shows a lock screen; entering the correct passphrase decrypts and displays the content client-side.

## Build & Workflow

```bash
npm run build          # Runs encrypt.js — prompts for passphrase via stdin
echo "phrase" | npm run build  # Non-interactive build
```

The build reads `content/memories.json` + `content/photos/`, encrypts everything, and outputs to `dist/`. The `dist/` folder is what gets deployed.

## Architecture

**Encryption flow:** `content/ → encrypt.js → dist/`

- **encrypt.js** (Node.js, no dependencies) — Reads plaintext content, derives AES-256-GCM key via PBKDF2 (100k iterations, SHA-256, random 16-byte salt), encrypts metadata as JSON and each photo as a separate binary `.enc` file. A check token ("booship-ok") is encrypted to verify the passphrase without exposing content.
- **app.js** (browser) — Uses Web Crypto API to derive the same key from passphrase + salt, decrypts the check token first, then metadata, then fetches and decrypts each photo `.enc` file individually. Photos become blob URLs.
- **Crypto format for JSON fields:** `{ salt: base64, iv: base64, data: base64 }` where data = ciphertext + 16-byte GCM auth tag.
- **Crypto format for photo .enc files:** `iv (12 bytes) || ciphertext || authTag (16 bytes)` — raw binary, no JSON wrapper.
- Both encrypt.js and app.js must use identical PBKDF2 parameters (iterations, hash, salt/key lengths) for cross-compatibility.

## Content Format

`content/memories.json` is an array of objects with `type` field:

- `type: "photo"` — has `title`, `date`, `description`, `photo` (relative path to image in content/photos/)
- `type: "quote"` — has `text`, `author`, `date`
- `type: "memory"` — has `title`, `date`, `description`

## Key Constraints

- `content/` is gitignored — plaintext never leaves the local machine
- Zero npm dependencies — uses only Node.js `crypto` module and browser Web Crypto API
- The same salt+key is used for all entries in a single build (salt is random per build)
- Each encrypted piece gets its own random 12-byte IV
