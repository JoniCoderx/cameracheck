// Static site generator for MicNCam. No dependencies: `node build.mjs`
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
const PAGE_ORDER = ['home', 'mic', 'webcam', 'speaker'];

/* ---------- load locales ---------- */
const en = JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.json'), 'utf8'));
const keysOf = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? keysOf(v, p + k + '.') : [p + k]);
const enKeys = keysOf(en);
const locales = {};
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
}
const LANGS = Object.keys(locales);

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
  const fullTitle = title.length + BRAND.length + 3 <= 70 ? `${title} | ${BRAND}` : title;
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
<meta name="theme-color" content="#0d0d14">
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
<meta property="og:locale" content="${L.meta.ogLocale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${DOMAIN}/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="stylesheet" href="${asset('styles.css')}">
${adsOn ? `<link rel="preconnect" href="https://pagead2.googlesyndication.com" crossorigin>\n<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${esc(AD.client)}" crossorigin="anonymous"></script>` : ''}
${cfg.ga4Id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(cfg.ga4Id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(cfg.ga4Id)}');</script>` : ''}
${extraLd.map(jsonLd).join('\n')}
</head>`;
}

function header(lang, page) {
  const u = locales[lang].ui;
  const opts = LANGS.map((l) => `<option value="${page ? urlFor(l, page) : prefix(l)}"${l === lang ? ' selected' : ''}>${esc(locales[l].meta.langName)}</option>`).join('');
  return `<a class="skip" href="#main">${esc(u.skip)}</a>
<header class="topbar">
  <div class="wrap topbar-inner">
    <a class="brand" href="${prefix(lang)}" aria-label="${BRAND}">
      <img src="/favicon.svg" alt="" width="32" height="32">
      <span>Mic<b>N</b>Cam</span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="${urlFor(lang, 'mic')}"${page === 'mic' ? ' aria-current="page"' : ''}>${esc(u.navMic)}</a>
      <a href="${urlFor(lang, 'webcam')}"${page === 'webcam' ? ' aria-current="page"' : ''}>${esc(u.navCam)}</a>
      <a href="${urlFor(lang, 'speaker')}"${page === 'speaker' ? ' aria-current="page"' : ''}>${esc(u.navSpk)}</a>
    </nav>
    <div class="top-actions">
      <label class="lang-pick"><span class="sr">${esc(u.language)}</span>
        <span aria-hidden="true">🌐</span>
        <select id="langSelect" aria-label="${esc(u.language)}">${opts}</select>
      </label>
      <button class="icon-btn" id="themeBtn" type="button" aria-label="Theme">◐</button>
    </div>
  </div>
</header>`;
}

function footer(lang) {
  const u = locales[lang].ui;
  const langLinks = LANGS.map((l) => `<a href="${prefix(l)}" hreflang="${l}" lang="${l}">${esc(locales[l].meta.langName)}</a>`).join(' · ');
  return `<footer class="footer">
  <div class="wrap footer-inner">
    <div class="brand small"><img src="/favicon.svg" alt="" width="22" height="22"><span>Mic<b>N</b>Cam</span></div>
    <p class="muted">${esc(u.footer)}</p>
    <nav class="foot-links" aria-label="Tests">
      <a href="${urlFor(lang, 'mic')}">${esc(u.navMic)}</a> · <a href="${urlFor(lang, 'webcam')}">${esc(u.navCam)}</a> · <a href="${urlFor(lang, 'speaker')}">${esc(u.navSpk)}</a>
    </nav>
    <p class="foot-langs muted">${langLinks}</p>
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
        <${headTag} id="micTitle" class="tool-title"><span class="ico">🎙️</span> ${esc(u.micTest)}</${headTag}>
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
        <canvas id="waveCanvas" aria-label="Waveform"></canvas>
        <canvas id="specCanvas" aria-label="Spectrum"></canvas>
      </div>
    </div>
    <div class="row-actions">
      <button class="btn" id="recBtn" type="button" disabled><span class="rec-dot"></span> <span>${esc(u.record)}</span></button>
      <button class="btn" id="echoBtn" type="button" disabled>${esc(u.echoOn)}</button>
      <audio id="recAudio" controls hidden></audio>
      <a class="btn btn-ghost" id="recDl" hidden download="micncam-recording.webm">${esc(u.download)}</a>
    </div>
    <dl class="specs">
      <div><dt>${esc(u.device)}</dt><dd id="mDev">—</dd></div>
      <div><dt>${esc(u.sampleRate)}</dt><dd id="mRate">—</dd></div>
      <div><dt>${esc(u.channels)}</dt><dd id="mCh">—</dd></div>
      <div><dt>${esc(u.peakFreq)}</dt><dd id="mFreq">—</dd></div>
      <div><dt>${esc(u.echoCancel)}</dt><dd id="mEc">—</dd></div>
      <div><dt>${esc(u.noiseSup)}</dt><dd id="mNs">—</dd></div>
    </dl>
  </div>
</section>`;

const camTool = (u, headTag) => `
<section class="wrap tool" id="cam" aria-labelledby="camTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="camTitle" class="tool-title"><span class="ico">📷</span> ${esc(u.camTest)}</${headTag}>
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
      <video id="video" playsinline muted autoplay></video>
      <canvas id="gridOverlay" class="grid-overlay" hidden></canvas>
      <div class="video-empty" id="videoEmpty"><div class="big-ico">📷</div><p>${esc(u.camOff)}</p></div>
      <div class="video-badges" id="videoBadges" hidden><span class="badge" id="bRes">—</span><span class="badge" id="bFps">— fps</span></div>
      <div class="flash" id="flash"></div>
    </div>
    <div class="row-actions">
      <button class="btn" id="snapBtn" type="button" disabled>${esc(u.snap)}</button>
      <button class="btn" id="mirrorBtn" type="button" disabled>${esc(u.mirror)}</button>
      <button class="btn" id="flipBtn" type="button" disabled>${esc(u.flip)}</button>
      <button class="btn" id="gridBtn" type="button" disabled>${esc(u.grid)}</button>
      <button class="btn" id="fsBtn" type="button" disabled>${esc(u.fullscreen)}</button>
      <button class="btn" id="vrecBtn" type="button" disabled><span class="rec-dot"></span> <span>${esc(u.recVideo)}</span></button>
    </div>
    <div class="shots" id="shots"></div>
    <video id="clipVideo" class="clip" controls playsinline hidden></video>
    <dl class="specs">
      <div><dt>${esc(u.device)}</dt><dd id="cDev">—</dd></div>
      <div><dt>${esc(u.resolution)}</dt><dd id="cRes">—</dd></div>
      <div><dt>${esc(u.fps)}</dt><dd id="cFps">—</dd></div>
      <div><dt>${esc(u.aspect)}</dt><dd id="cAsp">—</dd></div>
      <div><dt>${esc(u.megapixels)}</dt><dd id="cMp">—</dd></div>
      <div><dt>${esc(u.brightness)}</dt><dd id="cBri">—</dd></div>
    </dl>
  </div>
</section>`;

const spkTool = (u, headTag) => `
<section class="wrap tool" id="speaker" aria-labelledby="spkTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <${headTag} id="spkTitle" class="tool-title"><span class="ico">🔊</span> ${esc(u.spkTest)}</${headTag}>
        <p class="muted">${esc(u.spkHint)}</p>
      </div>
    </div>
    <div class="spk-grid">
      <button class="spk-btn" data-pan="-1" type="button"><span class="spk-ico">◀</span><span>${esc(u.left)}</span></button>
      <button class="spk-btn" data-pan="0" type="button"><span class="spk-ico">●</span><span>${esc(u.both)}</span></button>
      <button class="spk-btn" data-pan="1" type="button"><span class="spk-ico">▶</span><span>${esc(u.right)}</span></button>
    </div>
    <div class="freq-row">
      <label for="freqRange">${esc(u.toneFreq)}: <b id="freqVal">440 Hz</b></label>
      <input type="range" id="freqRange" min="50" max="15000" step="10" value="440">
      <button class="btn" id="sweepBtn" type="button">${esc(u.sweep)}</button>
    </div>
    <div class="row-actions">
      <span class="muted">${esc(u.spkAsk)}</span>
      <button class="btn btn-ok" id="spkYes" type="button">${esc(u.yes)}</button>
      <button class="btn btn-bad" id="spkNo" type="button">${esc(u.no)}</button>
    </div>
  </div>
</section>`;

const devicesTool = (u) => `
<section class="wrap tool" id="devices" aria-labelledby="devTitle">
  <div class="card">
    <div class="card-head">
      <div>
        <h2 id="devTitle" class="tool-title"><span class="ico">🧩</span> ${esc(u.devTitle)}</h2>
        <p class="muted">${esc(u.devHint)}</p>
      </div>
      <div class="controls"><button class="btn" id="refreshDev" type="button">${esc(u.refresh)}</button></div>
    </div>
    <ul class="dev-list" id="devList"></ul>
    <dl class="specs">
      <div><dt>${esc(u.browser)}</dt><dd id="iBrowser">—</dd></div>
      <div><dt>${esc(u.os)}</dt><dd id="iOs">—</dd></div>
      <div><dt>${esc(u.secure)}</dt><dd id="iSecure">—</dd></div>
      <div><dt>${esc(u.permMic)}</dt><dd id="iPermMic">—</dd></div>
      <div><dt>${esc(u.permCam)}</dt><dd id="iPermCam">—</dd></div>
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
  const alternates = LANGS.map((l) => [l, urlFor(l, page)]).concat([['x-default', urlFor('en', page)]]);
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
    ld.push({ '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: abs(prefix(lang)), inLanguage: lang });
  } else {
    ld.push({
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: BRAND, item: abs(prefix(lang)) },
        { '@type': 'ListItem', position: 2, name: stripTags(P.h1Html), item: abs(url) }
      ]
    });
  }

  const statuses = def.tools.map((k) => {
    const id = { mic: 'stMic', cam: 'stCam', spk: 'stSpk' }[k];
    return `<div class="status" id="${id}"><span class="dot"></span><span>${esc(u[k])}</span>: <b>${esc(u.notTested)}</b></div>`;
  }).join('');

  const cta = isHome
    ? `<button class="btn btn-primary btn-lg" id="heroStart" data-action="all" type="button">${esc(u.testAll)}</button>
       <a class="btn btn-ghost btn-lg" href="${urlFor(lang, 'mic')}">${esc(u.justMic)}</a>`
    : `<button class="btn btn-primary btn-lg" id="heroStart" data-action="${def.tools[0]}" type="button">${esc(u[{ mic: 'startMic', cam: 'startCam', spk: 'startSpk' }[def.tools[0]]])}</button>`;

  const tools = def.tools.map((k) => ({ mic: micTool, cam: camTool, spk: spkTool }[k](u, toolHead))).join('\n');

  const others = isHome ? '' : `
<section class="wrap others" aria-labelledby="othersTitle">
  <h2 id="othersTitle">${esc(u.otherTests)}</h2>
  <div class="other-grid">
    ${PAGE_ORDER.filter((p) => p !== 'home' && p !== page).map((p) => {
      const ico = { mic: '🎙️', webcam: '📷', speaker: '🔊' }[p];
      const name = { mic: u.navMic, webcam: u.navCam, speaker: u.navSpk }[p];
      const desc = { mic: u.cardMicDesc, webcam: u.cardCamDesc, speaker: u.cardSpkDesc }[p];
      return `<a class="other-card" href="${urlFor(lang, p)}"><span class="other-ico">${ico}</span><span><b>${esc(name)}</b><small>${esc(desc)}</small></span></a>`;
    }).join('')}
  </div>
</section>`;

  const runtime = { lang, page, tools: def.tools };

  return `${head({ lang, title: P.title, description: P.description, canonical: url, alternates, extraLd: ld })}
<body class="page-${page}">
${header(lang, page)}
<main id="main">
  <section class="hero" id="top">
    <div class="wrap">
      <span class="pill">${esc(u.heroPill)}</span>
      <h1>${P.h1Html}</h1>
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
  <section class="wrap faq" id="faq">
    <h2>${esc(u.faqTitle)}</h2>
    ${P.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </section>
  ${adSlot('beforeFooter', u.ad)}
</main>
${footer(lang)}
<script>window.I18N=${JSON.stringify(u).replace(/</g, '\\u003c')};window.PAGE=${JSON.stringify(runtime)};</script>
<script src="${asset('app.js')}" defer></script>
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
<script src="${asset('app.js')}" defer></script>
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
<p>${LANGS.map((l) => `<a href="${prefix(l)}" hreflang="${l}" lang="${l}">${esc(locales[l].meta.langName)}</a>`).join(' · ')}</p>
<h2>Contact</h2>
<p>Feedback, bug reports and partnership requests: <a href="mailto:${email}">${email}</a></p>`;

/* ---------- write everything ---------- */
let count = 0;
for (const lang of LANGS) {
  for (const page of PAGE_ORDER) {
    write(path.join(urlFor(lang, page).slice(1), 'index.html'), renderPage(lang, page));
    count++;
  }
}
write('privacy/index.html', infoPage('privacy', 'Privacy Policy', `${BRAND} privacy policy: your audio and video never leave your device.`, privacyHtml));
write('about/index.html', infoPage('about', `About ${BRAND}`, `About ${BRAND}, the free private online mic, webcam and speaker test.`, aboutHtml));

// sitemap with hreflang alternates
const today = new Date().toISOString().slice(0, 10);
const smUrls = [];
for (const page of PAGE_ORDER) {
  for (const lang of LANGS) {
    const alts = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${abs(urlFor(l, page))}"/>`).join('\n') +
      `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(urlFor('en', page))}"/>`;
    smUrls.push(`  <url>\n    <loc>${abs(urlFor(lang, page))}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${page === 'home' ? '1.0' : '0.9'}</priority>\n${alts}\n  </url>`);
  }
}
for (const s of ['privacy', 'about']) smUrls.push(`  <url>\n    <loc>${abs(`/${s}/`)}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>0.3</priority>\n  </url>`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${smUrls.join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${DOMAIN}/sitemap.xml\n`);
if (adsOn) write('ads.txt', `google.com, ${AD.client.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
write('CNAME', DOMAIN.replace(/^https?:\/\//, '') + '\n');
write('.nojekyll', '');

console.log(`✓ built ${count} pages in ${LANGS.length} languages (${LANGS.join(', ')}) → docs/  ads: ${adsOn ? 'ON' : 'off'}`);
