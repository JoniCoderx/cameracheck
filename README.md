# MicNCam — camera & microphone test

A free online webcam, microphone and speaker test at **[micncam.com](https://micncam.com)**.
Everything runs in the browser, and no audio or video ever leaves the device.

## Features
- **Microphone:** live dB meter with peak hold, waveform, frequency spectrum, dominant frequency, quality verdict, 5-second recording with playback and download, "hear myself" monitoring, device picker, sample rate, channels, echo-cancel and noise-suppression info
- **Camera:** live preview, device and resolution picker (480p–4K), real measured FPS, resolution, aspect ratio, megapixels, brightness, snapshots (PNG), 5-second clip recording, mirror, front/back switch, rule-of-thirds grid, fullscreen
- **Speakers:** left / right / both tones, adjustable frequency, 40 Hz–16 kHz sweep
- **Devices:** list of every input and output device, browser and OS, permission states
- English and Hebrew (RTL), dark and light theme, works on phones, installable PWA, works offline, SEO and Open Graph tags

## Run locally
Camera and mic need HTTPS or `localhost`:
```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deploy
It's a static site with no build step. It works on GitHub Pages (the `CNAME` file is already set to `micncam.com`), Netlify, Vercel or Cloudflare Pages.

**GitHub Pages:** go to Settings → Pages → Deploy from branch → `main` / root. Then at your domain registrar add DNS records:
- `A` @ → 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
- `CNAME` www → `<your-user>.github.io`

Then turn on "Enforce HTTPS".
