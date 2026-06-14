# 🎵 Sonix — YouTube → Audio → Catalog

Search YouTube by typing **or by voice**, download the audio as MP3, store it on
**Cloudinary**, and browse/play everything in a catalog UI. 100% free tools.

## Stack
- **Next.js 16** (App Router, TypeScript, Tailwind) — UI + API routes
- **yt-dlp** (`python -m yt_dlp`) — search + audio download (no API key needed)
- **ffmpeg** — extracts/encodes MP3
- **Cloudinary** — cloud storage (free 25 GB tier)
- **Web Speech API** — browser voice search (Chrome/Edge)

## How it works
```
Type/Speak → /api/search (yt-dlp) → results grid
Click Download → /api/download → yt-dlp (mp3) → Cloudinary upload → data/catalog.json
Catalog tab → play from Cloudinary URL (sticky audio player)
```

## One-time setup
1. **Cloudinary keys** — create a free account at
   https://cloudinary.com/users/register_free, then open the Dashboard and copy
   `Cloud name`, `API Key`, `API Secret` into **`.env.local`**.
2. ffmpeg + yt-dlp are already installed on this machine and pre-configured in
   `.env.local`.

## Run
```powershell
npm run dev      # development (http://localhost:3000)
# or
npm run build && npm run start   # production
```

## Notes
- The local catalog index lives in `data/catalog.json` (git-ignored). Audio
  itself lives on Cloudinary.
- Voice search needs a Chromium browser and microphone permission.
- ⚠️ Downloading copyrighted music may violate YouTube's Terms of Service. Use
  responsibly (personal use / royalty-free content).
