// Static site generator for MicTest+. No dependencies: `node build.mjs`
// Reads src/locales/*.json + site.config.json and writes the deployable site to docs/.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(ROOT, 'docs');
const SRC = path.join(ROOT, 'src');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const DOMAIN = cfg.domain.replace(/\/$/, '');
const BRAND = cfg.siteName;
const AD = cfg.adsense || {};
const adsOn = /^ca-pub-\d+$/.test(AD.client || '');

const PAGES = {
  home: { slug: '', tools: ['mic', 'cam', 'spk'], devices: true },
  mic: { slug: 'mic-test/', tools: ['mic'], devices: true },
  webcam: { slug: 'webcam-test/', tools: ['cam'], devices: true },
  speaker: { slug: 'speaker-test/', tools: ['spk'], devices: false }
};
Object.assign(PAGES, {
  discord: { slug: 'discord-mic-test/', tools: ['mic'], devices: false, variant: true, icon: 'mic' },
  zoom: { slug: 'zoom-mic-test/', tools: ['mic'], devices: false, variant: true, icon: 'mic' },
  iphone: { slug: 'iphone-mic-test/', tools: ['mic'], devices: false, variant: true, icon: 'mic' },
  android: { slug: 'android-mic-test/', tools: ['mic'], devices: false, variant: true, icon: 'mic' },
  airpods: { slug: 'airpods-mic-test/', tools: ['mic'], devices: true, variant: true, icon: 'mic' },
  headphone: { slug: 'headphone-test/', tools: ['spk'], devices: false, variant: true, icon: 'spk' },
  recorder: { slug: 'voice-recorder/', tools: ['rec'], devices: false, variant: true, icon: 'rec' }
});
const PAGE_ORDER = ['home', 'mic', 'webcam', 'speaker', 'recorder', 'discord', 'zoom', 'iphone', 'android', 'airpods', 'headphone'];
const VARIANTS = PAGE_ORDER.filter((p) => PAGES[p].variant);

/* ---------- load locales ---------- */
const en = JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.json'), 'utf8'));
const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, p + k + '.') : [p + k]);
const enKeys = keysOf(en);
const locales = {};
const HAS_PAGE = {};
for (const lang of cfg.languages) {
  const f = path.join(SRC, `locales/${lang}.json`);
  if (!fs.existsSync(f)) { console.warn(`! skipping ${lang}: no locale file`); continue; }
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  const have = new Set(keysOf(data));
  const missing = enKeys.filter((k) => !have.has(k));
  if (missing.length) { console.warn(`! ${lang}: missing ${missing.length} keys (falling back to English): ${missing.slice(0, 5).join(', ')}…`); }
  // deep-merge with English as fallback
  const merge = (base, over) => {
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return over ?? base;
    const o = {}; for (const k of Object.keys(base)) o[k] = merge(base[k], over ? over[k] : undefined); return o;
  };
  locales[lang] = merge(en, data);
  HAS_PAGE[lang] = new Set(Object.keys(data.pages || {}));
}
const LANGS = Object.keys(locales);
// a page exists in a language only if that language has its own translation of it
const pageLangs = (page) => LANGS.filter((l) => l === 'en' || HAS_PAGE[l].has(page));

/* ---------- helpers ---------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const prefix = (lang) => (lang === 'en' ? '/' : `/${lang}/`);
const urlFor = (lang, page) => prefix(lang) + PAGES[page].slug;
const abs = (u) => DOMAIN + u;
const stripTags = (h) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const write = (rel, content) => {
  const f = path.join(OUT, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content);
};
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

/* ---------- copy static assets with cache-busting hashes ---------- */
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const ver = {};
for (const f of fs.readdirSync(path.join(SRC, 'static'))) {
  const buf = fs.readFileSync(path.join(SRC, 'static', f));
  ver[f] = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
  fs.writeFileSync(path.join(OUT, f), buf);
}
const asset = (f) => `/${f}?v=${ver[f]}`;

/* ---------- inline CSS (one less render-blocking request) ---------- */
const minCss = (c) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/:\s+/g, ':').replace(/;}/g, '}').trim();
const CSS_INLINE = minCss(fs.readFileSync(path.join(SRC, 'static/styles.css'), 'utf8'));

/* ---------- inline + minified JS (no extra request, no cache-lifetime penalty) ---------- */
let JS_INLINE = fs.readFileSync(path.join(SRC, 'static/app.js'), 'utf8');
try {
  const esb = await import('esbuild');
  JS_INLINE = (await esb.transform(JS_INLINE, { minify: true, target: 'es2019' })).code.trim();
} catch (e) { console.warn('! esbuild not installed (npm i): app.js inlined without minification'); }
JS_INLINE = JS_INLINE.replace(/<\/script/gi, '<\\/script');
const LOGO_SVG = fs.readFileSync(path.join(SRC, 'static/favicon.svg'), 'utf8').replace(/\s*\n\s*/g, '').replace('<svg ', '<svg aria-hidden="true" ');

/* ---------- guides (English) ---------- */
const GUIDES_BY_LANG = {};
for (const f of fs.readdirSync(path.join(SRC, 'guides'))) {
  if (!f.endsWith('.json')) continue;
  const gl = f.replace('.json', '');
  try {
    const g = JSON.parse(fs.readFileSync(path.join(SRC, 'guides', f), 'utf8'));
    const ref = gl === 'en' ? null : JSON.parse(fs.readFileSync(path.join(SRC, 'guides/en.json'), 'utf8'));
    if (ref && (g.guides.length !== ref.guides.length || g.guides.some((x, i) => x.slug !== ref.guides[i].slug) || !g.ui || !g.hub)) throw new Error('structure differs from en.json');
    GUIDES_BY_LANG[gl] = g;
  } catch (e) { console.warn(`! skipping guides/${f}: ${e.message}`); }
}
const GUIDES = GUIDES_BY_LANG.en;
const TODAY = new Date().toISOString().slice(0, 10);

/* ---------- icons (inline SVG, no emoji) ---------- */
const ICONS = {
  rec: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8.5 21h7"/>',
  cam: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  spk: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18.5 6.5a8 8 0 0 1 0 11"/>',
  devices: '<rect x="2.5" y="4" width="14" height="10" rx="2"/><path d="M6.5 20h6M9.5 14v6"/><rect x="18.5" y="8" width="3.5" height="12" rx="1"/>',
  snap: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  mirror: '<path d="M12 3v18"/><path d="M8.5 7.5L4 12l4.5 4.5M15.5 7.5L20 12l-4.5 4.5"/>',
  flip: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20.5V16h-4.5"/>',
  grid: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>',
  fullscreen: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9"/>',
  moon: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.5 6.5 0 0 0 9.7 9.7z"/>'
};
const ic = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
const wordmark = (size) => `<span class="logo" style="width:${size}px;height:${size}px">${LOGO_SVG}</span><span>MicTest<span class="plus">+</span></span>`;

/* ---------- headline typography: no dangling short words or lone punctuation ---------- */
function tidyHeadline(h) {
  return h
    .replace(/ (&amp;|[a-zа-яё]) (?=\S)/giu, ' $1\u00a0')       // "&", "y", "e", "и" stay with the next word
    .replace(/ ([?!:;»])/g, '\u00a0$1')                          // French "fonctionnent-ils ?"
    .replace(/ ([^\s<>]{1,4})$/u, '\u00a0$1');                   // short last word never alone ("है?", "mu?")
}

/* ---------- shared blocks ---------- */
function adSlot(name, label) {
  if (!adsOn) return '';
  const slot = (AD.slots || {})[name];
  if (!slot) return ''; // Auto ads (enabled in the AdSense dashboard) still work without manual slots
  return `<aside class="ad-slot wrap" aria-label="${esc(label)}"><span class="ad-label">${esc(label)}</span>` +
    `<ins class="adsbygoogle" style="display:block" data-ad-client="${esc(AD.client)}" data-ad-slot="${esc(slot)}" data-ad-format="auto" data-full-width-responsive="true"></ins></aside>`;
}

function head({ lang, title, description, canonical, alternates, ogType = 'website', extraLd = [] }) {
  const L = locales[lang] || en;
  const fullTitle = title.length + BRAND.length + 3 <= (lang === "ja" ? 40 : 70) ? `${title} | ${BRAND}` : title;
  return `<!doctype html>
<html lang="${lang}" dir="${L.meta.dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${abs(canonical)}">
${(alternates || []).map(([hl, u]) => `<link rel="alternate" hreflang="${hl}" href="${abs(u)}">`).join('\n')}
<meta name="robots" content="index, follow, max-image-preview:large">
<meta name="theme-color" content="#0b0b0d">
<meta name="application-name" content="${BRAND}">
<meta name="apple-mobile-web-app-title" content="${BRAND}">
<meta name="color-scheme" content="dark light">
${cfg.googleSiteVerification ? `<meta name="google-site-verification" content="${esc(cfg.googleSiteVerification)}">` : ''}
${cfg.bingSiteVerification ? `<meta name="msvalidate.01" content="${esc(cfg.bingSiteVerification)}">` : ''}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:url" content="${abs(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${DOMAIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${BRAND}: free mic, webcam and speaker test">
<meta property="og:locale" content="${L.meta.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${DOMAIN}/og.png">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-96.png" type="image/png" sizes="96x96">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<style>${CSS_INLINE}</style>
${adsOn ? `<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD.client)}" crossorigin="anonymous"></script>` : ''}
${cfg.ga4Id ? `<script>
/* Google Analytics 4. Consent Mode: no analytics/ad cookies in the EEA, UK and Switzerland
   (cookieless pings only) until a consent banner grants them. The library loads after the page
   is ready so it never slows the first paint. */
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',region:['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IS','IE','IT','LV','LI','LT','LU','MT','NL','NO','PL','PT','RO','SK','SI','ES','SE','GB','CH']});
gtag('consent','default',{ad_storage:'granted',ad_user_data:'granted',ad_personalization:'granted',analytics_storage:'granted'});
gtag('js',new Date());gtag('config','${esc(cfg.ga4Id)}');
addEventListener('load',function(){setTimeout(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${esc(cfg.ga4Id)}';document.head.appendChild(s)},1500)});
</script>` : ''}
${extraLd.map(jsonLd).join('\n')}
</head>`;
}

function header(lang, page, altMap) {
  const u = locales[lang].ui;
  const opts = LANGS.map((l) => `<option value="${altMap ? (altMap[l] || prefix(l)) : PAGES[page] && pageLangs(page).includes(l) ? urlFor(l, page) : prefix(l)}"${l === lang ? ' selected' : ''}>${esc(locales[l].meta.shortName || locales[l].meta.langName)}</option>`).join('');
  return `<a class="skip" href="#main">${esc(u.skip)}</a>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="${prefix(lang)}" aria-label="${BRAND}">
      ${wordmark(30)}
    </a>
    <nav class="nav" aria-label="Main">
      <a href="${urlFor(lang, 'mic')}"${page === 'mic' ? ' aria-current="page"' : ''}>${esc(u.navMic)}</a>
      <a href="${urlFor(lang, 'webcam')}"${page === 'webcam' ? ' aria-current="page"' : ''}>${esc(u.navCam)}</a>
      <a href="${urlFor(lang, 'speaker')}"${page === 'speaker' ? ' aria-current="page"' : ''}>${esc(u.navSpk)}</a>
      <a href="${guidesHref(lang)}"${page === 'guides' ? ' aria-current="page"' : ''}>${esc(u.guides)}</a>
    </nav>
    <div class="top-actions">
      <label class="lang-pick"><span class="sr">${esc(u.language)}</span>
        ${ic('globe')}
        <select id="langSelect" aria-label="${esc(u.language)}">${opts}</select>
      </label>
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Theme">${ic('moon')}</button>
    </div>
  </div>
</header>`;
}

function footer(lang) {
  const u = locales[lang].ui;
  const langLinks = LANGS.map((l) => `<li><a href="${prefix(l)}" hreflang="${l}" lang="${l}" dir="${locales[l].meta.dir}"${l === lang ? ' aria-current="true"' : ''}>${esc(locales[l].meta.langName)}</a></li>`).join('');
  return `<footer class="footer">
  <div class="wrap footer-inner">
    <div class="brand small">${wordmark(24)}</div>
    <p class="muted">${esc(u.footer)}</p>
    <nav class="foot-links" aria-label="Tests">
      <a href="${urlFor(lang, 'mic')}">${esc(u.navMic)}</a> · <a href="${urlFor(lang, 'webcam')}">${esc(u.navCam)}</a> · <a href="${urlFor(lang, 'speaker')}">${esc(u.navSpk)}</a> · <a href="${guidesHref(lang)}">${esc(u.guides)}</a>
    </nav>
    ${VARIANTS.some((v) => pageLangs(v).includes(lang)) ? `<nav class="foot-links foot-more" aria-label="${esc(u.moreTests)}">
      ${VARIANTS.filter((v) => pageLangs(v).includes(lang)).map((v) => `<a href="${urlFor(lang, v)}">${esc(locales[lang].pages[v].card.name)}</a>`).join(' · ')}
    </nav>` : ''}
    <ul class="foot-langs">${langLinks}</ul>
    <p class="muted"><a href="/privacy/">${esc(u.privacy)}</a> · <a href="/about/">${esc(u.about)}</a> · <a href="mailto:${esc(cfg.contactEmail)}">${esc(u.contact)}</a> · © <span id="year">${new Date().getFullYear()}</span> ${DOMAIN.replace(/^https?:\/\//, '')}</p>
  </div>
</footer>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
}

/* ---------- tool sections ---------- */
const micTool = (u, headTag) => `
<section class="wrap tool" id="mic" aria-labelledby="micTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="micTitle" class="tool-title"><span class="ico">${ic('mic')}</span> ${esc(u.micTest)}</${headTag}>
        <p class="muted">${esc(u.micHint)}</p>
      </div>
      <div class="controls">
        <select id="micSelect" aria-label="${esc(u.mic)}"><option value="">${esc(u.defaultMic)}</option></select>
        <button class="btn btn-primary" id="micBtn" type="button">${esc(u.start)}</button>
      </div>
    </div>
    <div class="mic-grid">
      <div class="meter-box">
        <div class="meter" aria-hidden="true"><div class="meter-fill"></div><div class="meter-peak"></div></div>
        <div class="meter-read"><span class="big" id="dbRead">-∞</span><span class="unit">dB</span></div>
        <div class="verdict" id="micVerdict">${esc(u.waiting)}</div>
      </div>
      <div class="viz">
        <canvas id="waveCanvas" role="img" aria-label="Waveform"></canvas>
        <canvas id="specCanvas" role="img" aria-label="Spectrum"></canvas>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn" id="recBtn" type="button" disabled><span class="rec-dot"></span> <span>${esc(u.record)}</span></button>
      <button class="btn" id="echoBtn" type="button" disabled>${esc(u.echoOn)}</button>
      <audio id="recAudio" controls hidden></audio>
      <a class="btn btn-ghost" id="recDl" hidden href="#mic">${esc(u.download)}</a>
    </div>
    <dl class="specs">
      <div><dt>${esc(u.device)}</dt><dd id="mDev">–</dd></div>
      <div><dt>${esc(u.sampleRate)}</dt><dd id="mRate">–</dd></div>
      <div><dt>${esc(u.channels)}</dt><dd id="mCh">–</dd></div>
      <div><dt>${esc(u.peakFreq)}</dt><dd id="mFreq">–</dd></div>
      <div><dt>${esc(u.echoCancel)}</dt><dd id="mEc">–</dd></div>
      <div><dt>${esc(u.noiseSup)}</dt><dd id="mNs">–</dd></div>
    </dl>
  </div>
</section>`;

const camTool = (u, headTag) => `
<section class="wrap tool" id="cam" aria-labelledby="camTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="camTitle" class="tool-title"><span class="ico">${ic('cam')}</span> ${esc(u.camTest)}</${headTag}>
        <p class="muted">${esc(u.camHint)}</p>
      </div>
      <div class="controls">
        <select id="camSelect" aria-label="${esc(u.cam)}"><option value="">${esc(u.defaultCam)}</option></select>
        <select id="resSelect" aria-label="${esc(u.resolution)}">
          <option value="auto">${esc(u.autoRes)}</option>
          <option value="640x480">480p</option>
          <option value="1280x720">720p HD</option>
          <option value="1920x1080">1080p FHD</option>
          <option value="3840x2160">4K</option>
        </select>
        <button class="btn btn-primary" id="camBtn" type="button">${esc(u.start)}</button>
      </div>
    </div>
    <div class="video-wrap" id="videoWrap">
      <video id="video" playsinline muted></video>
      <canvas id="gridOverlay" class="grid-overlay" hidden></canvas>
      <div class="video-empty" id="videoEmpty">${ic('cam')}<p>${esc(u.camOff)}</p></div>
      <div class="video-badges" id="videoBadges" hidden><span class="badge" id="bRes">–</span><span class="badge" id="bFps">– fps</span></div>
      <div class="flash" id="flash"></div>
    </div>
    <div class="row-actions">
      <button class="btn" id="snapBtn" type="button" disabled>${ic('snap')}<span>${esc(u.snap)}</span></button>
      <button class="btn" id="mirrorBtn" type="button" disabled>${ic('mirror')}<span>${esc(u.mirror)}</span></button>
      <button class="btn" id="flipBtn" type="button" disabled>${ic('flip')}<span>${esc(u.flip)}</span></button>
      <button class="btn" id="gridBtn" type="button" disabled>${ic('grid')}<span>${esc(u.grid)}</span></button>
      <button class="btn" id="fsBtn" type="button" disabled>${ic('fullscreen')}<span>${esc(u.fullscreen)}</span></button>
      <button class="btn" id="vrecBtn" type="button" disabled><span class="rec-dot"></span> <span>${esc(u.recVideo)}</span></button>
    </div>
    <div class="shots" id="shots"></div>
    <video id="clipVideo" class="clip" controls playsinline hidden></video>
    <dl class="specs">
      <div><dt>${esc(u.device)}</dt><dd id="cDev">–</dd></div>
      <div><dt>${esc(u.resolution)}</dt><dd id="cRes">–</dd></div>
      <div><dt>${esc(u.fps)}</dt><dd id="cFps">–</dd></div>
      <div><dt>${esc(u.aspect)}</dt><dd id="cAsp">–</dd></div>
      <div><dt>${esc(u.megapixels)}</dt><dd id="cMp">–</dd></div>
      <div><dt>${esc(u.brightness)}</dt><dd id="cBri">–</dd></div>
      <div id="cMaxWrap" hidden><dt>${esc(u.maxRes)}</dt><dd id="cMax">–</dd></div>
    </dl>
  </div>
</section>`;

const spkTool = (u, headTag) => `
<section class="wrap tool" id="speaker" aria-labelledby="spkTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="spkTitle" class="tool-title"><span class="ico">${ic('spk')}</span> ${esc(u.spkTest)}</${headTag}>
        <p class="muted">${esc(u.spkHint)}</p>
      </div>
    </div>
    <div class="spk-grid">
      <button class="spk-btn" data-pan="-1" type="button"><span class="spk-ico">L</span><span>${esc(u.left)}</span></button>
      <button class="spk-btn" data-pan="0" type="button"><span class="spk-ico">L R</span><span>${esc(u.both)}</span></button>
      <button class="spk-btn" data-pan="1" type="button"><span class="spk-ico">R</span><span>${esc(u.right)}</span></button>
    </div>
    <div class="freq-row">
      <label for="freqRange">${esc(u.toneFreq)}: <b id="freqVal">440 Hz</b></label>
      <input type="range" id="freqRange" min="50" max="15000" step="10" value="440">
      <button class="btn" id="sweepBtn" type="button">${esc(u.sweep)}</button>
    </div>
    <div class="row-actions">
      <span class="muted spk-ask">${esc(u.spkAsk)}</span>
      <button class="btn btn-ok" id="spkYes" type="button">${esc(u.yes)}</button>
      <button class="btn btn-bad" id="spkNo" type="button">${esc(u.no)}</button>
    </div>
  </div>
</section>`;

const recTool = (u, headTag) => `
<section class="wrap tool" id="recorder" aria-labelledby="recTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="recTitle" class="tool-title"><span class="ico">${ic('rec')}</span> ${esc(u.recTool)}</${headTag}>
        <p class="muted">${esc(u.recHint)}</p>
      </div>
      <div class="controls">
        <select id="recMic" aria-label="${esc(u.mic)}"><option value="">${esc(u.defaultMic)}</option></select>
      </div>
    </div>
    <div class="rec-panel">
      <button class="rec-big" id="recToggle" type="button"><span class="rec-dot"></span><span>${esc(u.recStart)}</span></button>
      <div class="rec-time" id="recTime">00:00</div>
      <div class="rec-meter" aria-hidden="true"><div class="rec-fill" id="recFill"></div></div>
    </div>
    <ul class="rec-list" id="recList"><li class="rec-empty muted">${esc(u.recEmpty)}</li></ul>
  </div>
</section>`;

const devicesTool = (u) => `
<section class="wrap tool" id="devices" aria-labelledby="devTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <h2 id="devTitle" class="tool-title"><span class="ico">${ic('devices')}</span> ${esc(u.devTitle)}</h2>
        <p class="muted">${esc(u.devHint)}</p>
      </div>
      <div class="controls"><button class="btn" id="refreshDev" type="button">${esc(u.refresh)}</button></div>
    </div>
    <ul class="dev-list" id="devList"></ul>
    <dl class="specs">
      <div><dt>${esc(u.browser)}</dt><dd id="iBrowser">–</dd></div>
      <div><dt>${esc(u.os)}</dt><dd id="iOs">–</dd></div>
      <div><dt>${esc(u.secure)}</dt><dd id="iSecure">–</dd></div>
      <div><dt>${esc(u.permMic)}</dt><dd id="iPermMic">–</dd></div>
      <div><dt>${esc(u.permCam)}</dt><dd id="iPermCam">–</dd></div>
    </dl>
  </div>
</section>`;

function article(sections, u) {
  return sections.map((s, i) => {
    let h = `<section class="art-sec"><h2>${esc(s.h)}</h2>`;
    for (const p of s.p || []) h += `<p>${esc(p)}</p>`;
    if (s.ol) h += `<ol>${s.ol.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>`;
    if (s.ul) h += `<ul>${s.ul.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    h += '</section>';
    if (i === 1) h += adSlot('inArticle', u.ad);
    return h;
  }).join('\n');
}

/* ---------- page renderer ---------- */
function renderPage(lang, page) {
  const L = locales[lang], u = L.ui, P = L.pages[page], def = PAGES[page];
  const url = urlFor(lang, page);
  const alternates = pageLangs(page).map((l) => [l, urlFor(l, page)]).concat([['x-default', urlFor('en', page)]]);
  const isHome = page === 'home';
  const toolHead = isHome ? 'h2' : 'h2';

  const ld = [{
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: isHome ? BRAND : `${stripTags(P.h1Html)} — ${BRAND}`,
    url: abs(url),
    inLanguage: lang,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Windows, macOS, Linux, ChromeOS, Android, iOS',
    browserRequirements: 'Requires a modern browser with WebRTC support',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: P.description
  }, {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: P.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }];
  if (isHome) {
    ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, alternateName: ['MicTest Plus', 'mictestplus'], url: abs(prefix(lang)), inLanguage: lang });
    ld.push({ '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: DOMAIN + '/', logo: DOMAIN + '/icon-512.png', email: cfg.contactEmail });
  } else {
    ld.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: BRAND, item: abs(prefix(lang)) },
        { '@type': 'ListItem', position: 2, name: stripTags(P.h1Html), item: abs(url) }
      ]
    });
  }

  const statuses = def.tools.filter((k) => k !== 'rec').map((k) => {
    const id = { mic: 'stMic', cam: 'stCam', spk: 'stSpk' }[k];
    return `<div class="status" id="${id}"><span class="dot"></span><span>${esc(u[k])}:</span> <b>${esc(u.notTested)}</b></div>`;
  }).join('');

  const cta = isHome
    ? `<button class="btn btn-primary btn-lg" id="heroStart" data-action="all" type="button">${esc(u.testAll)}</button>
       <a class="btn btn-ghost btn-lg" href="${urlFor(lang, 'mic')}">${esc(u.justMic)}</a>`
    : `<button class="btn btn-primary btn-lg" id="heroStart" data-action="${def.tools[0]}" type="button">${esc(u[{ mic: 'startMic', cam: 'startCam', spk: 'startSpk', rec: 'startRec' }[def.tools[0]]])}</button>`;

  const tools = def.tools.map((k) => ({ mic: micTool, cam: camTool, spk: spkTool, rec: recTool }[k](u, toolHead))).join('\n');

  const cardList = ['mic', 'webcam', 'speaker', ...VARIANTS].filter((p) => p !== page && pageLangs(p).includes(lang) && (!isHome || PAGES[p].variant));
  const others = !cardList.length ? '' : `
<section class="wrap others" aria-labelledby="othersTitle">
  <h2 id="othersTitle">${esc(isHome ? u.moreTests : u.otherTests)}</h2>
  <div class="other-grid">
    ${cardList.map((p) => {
      const main = { mic: [u.navMic, u.cardMicDesc, 'mic'], webcam: [u.navCam, u.cardCamDesc, 'cam'], speaker: [u.navSpk, u.cardSpkDesc, 'spk'] }[p];
      const [name, desc, icon] = main || [L.pages[p].card.name, L.pages[p].card.desc, PAGES[p].icon];
      return `<a class="other-card" href="${urlFor(lang, p)}"><span class="other-ico">${ic(icon)}</span><span><b>${esc(name)}</b><small>${esc(desc)}</small></span></a>`;
    }).join('')}
  </div>
</section>`;

  const toolKey = { mic: 'mic', webcam: 'webcam', speaker: null, home: 'any', headphone: null }[page] ?? (PAGES[page].tools[0] === 'mic' || PAGES[page].tools[0] === 'rec' ? 'mic' : null);
  const GL = GUIDES_BY_LANG[lang] ? lang : 'en'; const rel = GUIDES_BY_LANG[GL].guides.filter((g) => toolKey === 'any' || g.tool === toolKey).slice(0, 3);
  const related = rel.length ? `
<section class="wrap others" aria-labelledby="guidesTitle">
  <h2 id="guidesTitle">${esc(u.guides)}</h2>
  <div class="other-grid">${rel.map((g) => `<a class="other-card" href="${guideUrl(GL, g.slug)}" hreflang="${GL}"><span class="other-ico">${ic(g.tool === 'mic' ? 'mic' : 'cam')}</span><span lang="${GL}" dir="${locales[GL].meta.dir}"><b>${esc(g.h1)}</b><small>${esc(g.description.split('. ')[0].replace(/\.+$/, ''))}.</small></span></a>`).join('')}</div>
</section>` : '';
  const runtime = { lang, page, tools: def.tools, alts: Object.fromEntries(pageLangs(page).map((l) => [l, urlFor(l, page)])), names: Object.fromEntries(LANGS.map((l) => [l, locales[l].meta.langName])) };

  return `${head({ lang, title: P.title, description: P.description, canonical: url, alternates, extraLd: ld })}
<body class="page-${page}">
${header(lang, page)}
<main id="main">
  <section class="hero" id="top">
    <div class="hero-eq" aria-hidden="true">${'<i></i>'.repeat(28)}</div>
    <div class="wrap">
      <span class="pill">${esc(u.heroPill)}</span>
      <h1>${tidyHeadline(P.h1Html)}</h1>
      <p class="lead">${esc(P.lead)}</p>
      <div class="hero-cta">${cta}</div>
      <div class="status-row" aria-live="polite">${statuses}</div>
    </div>
  </section>
  <div class="alert wrap" id="secureAlert" hidden></div>
  ${tools}
  ${def.devices ? devicesTool(u) : ''}
  ${adSlot('afterTool', u.ad)}
  ${others}
  <article class="wrap article">
    ${article(P.article, u)}
  </article>
  ${related}
  <section class="wrap faq" id="faq">
    <h2>${esc(u.faqTitle)}</h2>
    ${P.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>
  ${adSlot('beforeFooter', u.ad)}
</main>
${footer(lang)}
<script>window.I18N=${JSON.stringify(u).replace(/</g, '\\u003c')};window.PAGE=${JSON.stringify(runtime)};</script>
<script>${JS_INLINE}</script>
</body>
</html>
`;
}

/* ---------- guide pages (all languages that have a translation in src/guides/) ---------- */
const GUIDE_LANGS = LANGS.filter((l) => GUIDES_BY_LANG[l]);
const guideUrl = (lang, slug) => prefix(lang) + 'guides/' + (slug ? slug + '/' : '');
const guidesHref = (lang) => guideUrl(GUIDES_BY_LANG[lang] ? lang : 'en');
function crumbs(items) {
  return `<nav class="crumbs" aria-label="Breadcrumb">${items.map(([name, u], i) => i < items.length - 1 ? `<a href="${u}"><bdi>${esc(name)}</bdi></a><span aria-hidden="true">/</span>` : `<span aria-current="page"><bdi>${esc(name)}</bdi></span>`).join('')}</nav>`;
}
const guideAlts = (slug) => GUIDE_LANGS.map((l) => [l, guideUrl(l, slug)]).concat([['x-default', guideUrl('en', slug)]]);
const guideAltMap = (slug) => Object.fromEntries(GUIDE_LANGS.map((l) => [l, guideUrl(l, slug)]));
const fmtDate = (lang, d) => { try { return new Date(d).toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' }); } catch (e) { return d; } };
const guideRuntime = (lang, page, slug) => `<script>window.I18N=${JSON.stringify(locales[lang].ui).replace(/</g, '\\u003c')};window.PAGE=${JSON.stringify({ lang, page, tools: [], alts: guideAltMap(slug), names: Object.fromEntries(GUIDE_LANGS.map((l) => [l, locales[l].meta.langName])) })};</script>`;

function guidePage(lang, g) {
  const G = GUIDES_BY_LANG[lang], u = locales[lang].ui, gu = G.ui;
  const url = guideUrl(lang, g.slug), hub = guideUrl(lang);
  const text = [g.lead, ...g.sections.flatMap((x) => [x.h, ...(x.p || []), ...(x.ol || []), ...(x.ul || [])]), ...g.faq.flatMap((f) => [f.q, f.a])].join(' ');
  const words = /^(ja)$/.test(lang) ? text.length / 2.5 : text.split(/\s+/).length;
  const mins = Math.max(2, Math.round(words / 220));
  const ld = [{
    '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.description, inLanguage: lang,
    mainEntityOfPage: abs(url), datePublished: '2026-11-05', dateModified: TODAY, image: DOMAIN + '/og.png',
    author: { '@type': 'Organization', name: BRAND, url: DOMAIN + '/' },
    publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: DOMAIN + '/icon-512.png' } }
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND, item: abs(prefix(lang)) },
      { '@type': 'ListItem', position: 2, name: gu.guides, item: abs(hub) },
      { '@type': 'ListItem', position: 3, name: g.h1, item: abs(url) }]
  }, {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }];
  const isMic = g.tool === 'mic';
  const toolHref = urlFor(lang, isMic ? 'mic' : 'webcam');
  const cta = `<div class="cta-box"><div><b>${esc(isMic ? gu.titleMic : gu.titleWebcam)}</b><span>${esc(gu.ctaSub)}</span></div><a class="btn btn-primary" href="${toolHref}">${ic(isMic ? 'mic' : 'cam')}<span>${esc(isMic ? gu.runMic : gu.runWebcam)}</span></a></div>`;
  const others = G.guides.filter((x) => x.slug !== g.slug);
  return `${head({ lang, title: g.title, description: g.description, canonical: url, alternates: guideAlts(g.slug), ogType: 'article', extraLd: ld })}
<body class="page-guide">
${header(lang, 'guides', guideAltMap(g.slug))}
<main id="main">
  <article class="wrap article guide">
    ${crumbs([[BRAND, prefix(lang)], [gu.guides, hub], [g.h1, url]])}
    <h1>${esc(g.h1)}</h1>
    <p class="guide-meta">${esc(gu.updated)} <time datetime="${TODAY}">${esc(fmtDate(lang, TODAY))}</time> · ${mins} ${esc(gu.minRead)}</p>
    <p class="lead">${esc(g.lead)}</p>
    ${cta}
    ${article(g.sections, u)}
    <section class="faq guide-faq">
      <h2>${esc(u.faqTitle)}</h2>
      ${g.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n      ')}
    </section>
    ${cta}
  </article>
  <section class="wrap others" aria-labelledby="moreGuides">
    <h2 id="moreGuides">${esc(gu.moreGuides)}</h2>
    <div class="other-grid">${others.map((x) => `<a class="other-card" href="${guideUrl(lang, x.slug)}"><span class="other-ico">${ic(x.tool === 'mic' ? 'mic' : 'cam')}</span><span><b>${esc(x.h1)}</b></span></a>`).join('')}</div>
  </section>
</main>
${footer(lang)}
${guideRuntime(lang, 'guide', g.slug)}
<script>${JS_INLINE}</script>
</body>
</html>
`;
}
function guidesHub(lang) {
  const G = GUIDES_BY_LANG[lang], u = locales[lang].ui, H = G.hub, gu = G.ui, hub = guideUrl(lang);
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: H.title, description: H.description, url: abs(hub), inLanguage: lang,
    hasPart: G.guides.map((g) => ({ '@type': 'Article', headline: g.title, url: abs(guideUrl(lang, g.slug)) })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: BRAND, item: abs(prefix(lang)) }, { '@type': 'ListItem', position: 2, name: gu.guides, item: abs(hub) }] }];
  return `${head({ lang, title: H.title, description: H.description, canonical: hub, alternates: guideAlts(''), extraLd: ld })}
<body class="page-guides">
${header(lang, 'guides', guideAltMap(''))}
<main id="main" class="wrap">
  <div class="guides-head">
    ${crumbs([[BRAND, prefix(lang)], [gu.guides, hub]])}
    <h1>${esc(H.h1)}</h1>
    <p class="lead">${esc(H.lead)}</p>
  </div>
  <div class="guide-list">${G.guides.map((g) => `<a class="guide-card" href="${guideUrl(lang, g.slug)}"><span class="other-ico">${ic(g.tool === 'mic' ? 'mic' : 'cam')}</span><span><b>${esc(g.h1)}</b><small>${esc(g.description)}</small></span></a>`).join('')}</div>
  <section class="others"><h2>${esc(u.otherTests)}</h2><div class="other-grid">
    <a class="other-card" href="${urlFor(lang, 'mic')}"><span class="other-ico">${ic('mic')}</span><span><b>${esc(u.navMic)}</b><small>${esc(u.cardMicDesc)}</small></span></a>
    <a class="other-card" href="${urlFor(lang, 'webcam')}"><span class="other-ico">${ic('cam')}</span><span><b>${esc(u.navCam)}</b><small>${esc(u.cardCamDesc)}</small></span></a>
    <a class="other-card" href="${urlFor(lang, 'speaker')}"><span class="other-ico">${ic('spk')}</span><span><b>${esc(u.navSpk)}</b><small>${esc(u.cardSpkDesc)}</small></span></a>
  </div></section>
</main>
${footer(lang)}
${guideRuntime(lang, 'guides', '')}
<script>${JS_INLINE}</script>
</body>
</html>
`;
}

/* ---------- simple English info pages ---------- */
function infoPage(slug, title, description, bodyHtml) {
  return `${head({ lang: 'en', title, description, canonical: `/${slug}/` })}
<body>
${header('en', null)}
<main id="main" class="wrap info">
  <h1>${esc(title)}</h1>
  <div class="card prose">${bodyHtml}</div>
</main>
${footer('en')}
<script>window.I18N=${JSON.stringify(en.ui)};window.PAGE={"lang":"en","page":"${slug}","tools":[]};</script>
<script>${JS_INLINE}</script>
</body>
</html>
`;
}

const email = esc(cfg.contactEmail);
const privacyHtml = `
<p><em>Last updated: ${new Date().toISOString().slice(0, 10)}</em></p>
<h2>Your camera and microphone data</h2>
<p><b>We never see, hear, store or upload your camera or microphone data.</b> All tests on ${BRAND} run entirely inside your web browser using standard Web APIs (getUserMedia, Web Audio, MediaRecorder). Recordings and snapshots you create stay in your browser's memory and are discarded when you close the tab, unless you choose to download them to your own device.</p>
<h2>Information stored on your device</h2>
<p>We save your theme preference in your browser's local storage. We do not use accounts and do not ask for your name or email address.</p>
<h2>Advertising</h2>
<p>This site may show ads served by Google and its partners. Third-party vendors, including Google, use cookies to serve ads based on a user's prior visits to this website or other websites. Google's use of advertising cookies enables it and its partners to serve ads to users based on their visits to this site and/or other sites on the Internet.</p>
<p>You can opt out of personalized advertising by visiting <a href="https://www.google.com/settings/ads" rel="nofollow noopener" target="_blank">Google Ads Settings</a>, or opt out of some third-party vendors' use of cookies at <a href="https://www.aboutads.info/choices/" rel="nofollow noopener" target="_blank">aboutads.info</a>. Learn more about <a href="https://policies.google.com/technologies/partner-sites" rel="nofollow noopener" target="_blank">how Google uses information from sites that use its services</a>.</p>
<p>Visitors in the European Economic Area, the UK and Switzerland are asked for consent before personalized ads or non-essential cookies are used.</p>
<h2>Analytics</h2>
<p>We may use privacy-respecting analytics (such as Google Analytics) to count visits and understand which pages are useful. This data is aggregated and never includes your camera or microphone content.</p>
<h2>Your rights</h2>
<p>Depending on where you live (for example under the GDPR or CCPA) you may have the right to access, correct or delete personal data and to object to its processing. Because we don't collect personal data ourselves, most requests concern our advertising and analytics partners. Contact us and we'll help.</p>
<h2>Children</h2>
<p>This site is not directed at children under 13 and we do not knowingly collect their personal information.</p>
<h2>Contact</h2>
<p>Questions about this policy: <a href="mailto:${email}">${email}</a></p>
<hr>
<p dir="rtl" lang="he"><b>בעברית:</b> כל הבדיקות רצות בדפדפן שלך בלבד. אנחנו לא רואים, לא שומעים, לא שומרים ולא מעלים אודיו או וידאו. האתר עשוי להציג פרסומות של Google, שמשתמשת בעוגיות לפי מדיניותה.</p>`;

const aboutHtml = `
<p>${BRAND} is a free, fast and private toolkit for checking your microphone, webcam and speakers before calls, classes, interviews, streams and recordings.</p>
<h2>Why we built it</h2>
<p>Most "is my mic working?" moments happen seconds before an important call. We wanted a single page that answers that instantly, on any device, without installing anything and without sending your voice or video anywhere.</p>
<h2>How it works</h2>
<p>Everything runs in your browser with standard web technology: WebRTC for camera and mic access, the Web Audio API for the level meter, waveform, spectrum and test tones, and MediaRecorder for local recordings. Nothing is uploaded.</p>
<h2>Available in ${LANGS.length} languages</h2>
<ul class="foot-langs about-langs">${LANGS.map((l) => `<li><a href="${prefix(l)}" hreflang="${l}" lang="${l}" dir="${locales[l].meta.dir}">${esc(locales[l].meta.langName)}</a></li>`).join('')}</ul>
<h2>Contact</h2>
<p>Feedback, bug reports and partnership requests: <a href="mailto:${email}">${email}</a></p>`;

/* ---------- write everything ---------- */
let count = 0;
for (const lang of LANGS) {
  for (const page of PAGE_ORDER) {
    if (!pageLangs(page).includes(lang)) continue;
    write(path.join(urlFor(lang, page).slice(1), 'index.html'), renderPage(lang, page));
    count++;
  }
}
write('privacy/index.html', infoPage('privacy', 'Privacy Policy', `${BRAND} privacy policy: your audio and video never leave your device.`, privacyHtml));
let guideCount = 0;
for (const l of GUIDE_LANGS) {
  write(guideUrl(l).slice(1) + 'index.html', guidesHub(l)); guideCount++;
  for (const g of GUIDES_BY_LANG[l].guides) { write(guideUrl(l, g.slug).slice(1) + 'index.html', guidePage(l, g)); guideCount++; }
}
write('about/index.html', infoPage('about', `About ${BRAND}`, `About ${BRAND}: the free, private online mic test, webcam test and speaker test. No sign-up.`, aboutHtml));

// sitemap with hreflang alternates
const today = new Date().toISOString().slice(0, 10);
const smUrls = [];
for (const page of PAGE_ORDER) {
  for (const lang of pageLangs(page)) {
    const alts = pageLangs(page).map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(urlFor(l, page))}"/>`).join('\n') +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(urlFor('en', page))}"/>`;
    smUrls.push(`  <url>\n    <loc>${abs(urlFor(lang, page))}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${page === 'home' ? '1.0' : PAGES[page].variant ? '0.8' : '0.9'}</priority>\n${alts}\n  </url>`);
  }
}
for (const slug of ['', ...GUIDES.guides.map((g) => g.slug)]) {
  const alts = guideAlts(slug).map(([hl, u]) => `    <xhtml:link rel="alternate" hreflang="${hl}" href="${abs(u)}"/>`).join('\n');
  for (const l of GUIDE_LANGS) smUrls.push(`  <url>\n    <loc>${abs(guideUrl(l, slug))}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${slug ? '0.7' : '0.6'}</priority>\n${alts}\n  </url>`);
}
for (const s of ['privacy', 'about']) smUrls.push(`  <url>\n    <loc>${abs(`/${s}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.3</priority>\n  </url>`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${smUrls.join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`);
if (adsOn) write('ads.txt', `google.com, ${AD.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
write('CNAME', DOMAIN.replace(/^https?:\/\//, '') + '\n');
write('.nojekyll', '');
if (/^[a-f0-9]{32}$/.test(cfg.indexNowKey || '')) write(`${cfg.indexNowKey}.txt`, cfg.indexNowKey);

console.log(`✓ built ${count} tool pages + ${guideCount} guide pages (${GUIDE_LANGS.length} languages), in ${LANGS.length} languages (${LANGS.join(', ')}) → docs/  ads: ${adsOn ? 'ON' : 'off'}`);
