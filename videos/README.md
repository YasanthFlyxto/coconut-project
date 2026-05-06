# videos/

Place your video files here with these exact names:

- `video1.mp4` — Triggered by IR beam sensor or Remote 1 (433MHz)
- `video2.mp4` — Triggered by Dashboard "Play" button or Remote 2 (315MHz)

## Supported Formats

- **Recommended**: `.mp4` (H.264 codec — best compatibility with Electron/Chromium)
- Also works: `.webm` (VP8/VP9), `.ogg` (Theora)

## Changing File Names / Paths

Open `main.js` and modify the config section at the top:

```js
let config = {
  video1: path.join(__dirname, 'videos', 'video1.mp4'),
  video2: path.join(__dirname, 'videos', 'video2.mp4'),
  ...
};
```
