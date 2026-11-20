# Promo video source

Everything is generated from code, nothing paid:
1. `node capture.js <out_dir> [lang]` takes live screenshots of each tool from a local copy of the site (port 8300).
2. `python3 music.py music.wav` synthesizes the original 120 BPM track.
3. `node render.js <lang> out.mp4` renders the 1080x1920 30 fps animation (needs `icons.json` and `logo.svg` next to it; see the build script for how they were made).
4. Mux with ffmpeg: loudnorm to -14 LUFS, oversampled limiter, AAC 256k.
