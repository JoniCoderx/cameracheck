# MicTest+: free online mic, webcam and speaker test

Live site: **[mictestplus.com](https://mictestplus.com)**. Everything runs in the browser, and no audio or video ever leaves the device.

## What's inside
- **4 landing pages per language**, one for each search intent:
  `/` (all-in-one), `/mic-test/`, `/webcam-test/`, `/speaker-test/`
- **13 languages:** en, es, pt, fr, de, it, ru, tr, id, ja, ar, he, hi (`/es/mic-test/`, `/de/webcam-test/`…)
- **SEO:** text rendered on the server (no JS needed to index), unique long-form content and FAQ per page, `FAQPage` / `WebApplication` / `BreadcrumbList` structured data, `hreflang` on every page and in the sitemap, canonical URLs, Open Graph and Twitter cards, PNG share image, fast static HTML
- **Tools:** mic (dB meter, waveform, spectrum, recording, monitoring), webcam (live preview, measured FPS, resolution, snapshots, clips, front/back switch), speakers (L/R, frequency, sweep), device list
- **Ads ready:** AdSense script, `ads.txt`, three fixed-size ad slots that don't shift the layout, and an AdSense-compliant privacy page
- Mobile-first, dark and light themes, installable PWA, works offline

## Project layout
```
site.config.json     ← domain, AdSense, Analytics, Search Console (edit this)
src/locales/*.json   ← all text, one file per language
src/static/          ← app.js, styles.css, icons (copied as-is)
build.mjs            ← generator (no dependencies)
docs/                ← BUILT SITE, this is what gets deployed
```

## Build
```bash
node build.mjs          # writes docs/
npm run serve           # build + preview at http://localhost:8080
```
Edit text in `src/locales/`, then rebuild and commit `docs/`.

## Deploy (GitHub Pages)
1. Repo → Settings → Pages → *Deploy from a branch* → choose the branch → folder **`/docs`**.
2. At your domain registrar:
   - `A` @ → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` www → `jonicoderx.github.io`
3. Custom domain `mictestplus.com` → tick **Enforce HTTPS** (camera and mic require HTTPS).

Netlify, Vercel and Cloudflare Pages also work: set the build command to `node build.mjs` and the publish directory to `docs`.

## Turning on ads (Google AdSense)
1. Apply at <https://adsense.google.com> with `mictestplus.com`. The site needs to be live and indexed with real content first.
2. Put your publisher ID in `site.config.json` → `adsense.client` (format `ca-pub-1234567890123456`).
3. Optional: create three display ad units in AdSense and paste their slot IDs into `afterTool`, `inArticle` and `beforeFooter`. Without slot IDs you can still use **Auto ads** from the AdSense dashboard.
4. `node build.mjs`, commit and push. `ads.txt` is generated automatically.
5. In AdSense → *Privacy & messaging*, turn on the **GDPR consent message** (required for EU/UK traffic) and the US state privacy message.

Ad placement is deliberately **below the tool**, never between the user and the "Start" button. Google ranks pages lower when ads push the main content down.

## Getting to the top of Google: checklist
The site side is done. These steps are yours and they matter most:
1. **Google Search Console:** add the domain, paste the verification code into `googleSiteVerification`, rebuild, then submit `https://mictestplus.com/sitemap.xml`.
2. **Bing Webmaster Tools:** same (`bingSiteVerification`). Bing also feeds DuckDuckGo, Yahoo and ChatGPT search.
3. **Backlinks** are the #1 ranking factor here. Post the tool where people ask "is my mic working": Reddit (r/techsupport, r/discordapp, r/Twitch), Quora, Stack Exchange, Product Hunt, AlternativeTo, and "free tools" directories.
4. Ask YouTubers or bloggers who write "how to fix your mic on Zoom/Discord" guides to link to it.
5. Check Search Console weekly: see which queries show impressions, and expand content for those.
6. Keep the site fast, and don't add heavy scripts or too many ad units.
