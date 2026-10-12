# VYRA AI Studio — Free-first prototype

VYRA is a responsive web-app starter for **Text-to-Video** and **Image-to-Video**.

## Important truth about generation
This repository includes the interface and an engine-adapter contract. It does **not** contain a video-generation model, and the demo mode does not create real AI video. A real video model needs compute (usually a GPU) somewhere. This project is designed to avoid paid APIs: connect a free/open-source inference endpoint you control, or run a compatible open-source model on a free GPU runtime when available. Free runtimes can have quotas, queues, cold starts, or change their terms.

## Included
- Responsive dark interface
- Text-to-Video and Image-to-Video modes
- Image upload preview
- Aspect ratio, duration, quality and style controls
- Job status and result area
- Explicit demo mode and clear error messages
- `engine-config.js` for a future backend endpoint
- No API key in browser code

## Run
Open `index.html` in a browser for the UI demo. Some browsers restrict local file access; if so, use GitHub Pages or another static host.

## Connect a real engine safely
1. Deploy a backend you control that accepts a request shaped like `POST /api/generate`.
2. Keep provider/model credentials on that backend, never in `app.js`, `index.html`, or a public GitHub repo.
3. Update `engine-config.js` with your backend URL and set `demoMode` to `false`.
4. The backend should return JSON such as `{ "jobId": "abc123" }`.
5. `GET /api/jobs/abc123` should return `{ "status": "queued|running|succeeded|failed", "videoUrl": "https://...", "error": "..." }`.

Expected POST body (multipart/form-data):
- `prompt` (text)
- `mode` (`text-to-video` or `image-to-video`)
- `aspectRatio` (`9:16`, `16:9`, `1:1`)
- `duration` (seconds)
- `quality`
- `style`
- `image` (optional file for image-to-video)

## Free-only path
There is no honest guarantee of unlimited, always-on, zero-cost AI video generation. The code therefore defaults to demo mode and never silently sends user content to a third-party service. Choose a currently available free/open-source GPU runtime or your own hardware before enabling real generation.
