/* MicTest+ admin dashboard. Reads Google Analytics 4 with the signed-in user's own Google account
   (OAuth token in the browser, read-only scope). No secrets live in this file: the client ID is public
   by design, and Google only returns data to accounts that have access to the GA4 property. */
(() => {
  'use strict';
  const CFG = window.ADMIN || {};
  const $ = (s, r = document) => r.querySelector(s);
  const app = $('#app');
  const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
  const API = 'https://analyticsdata.googleapis.com/v1beta/properties/';
  const nf = new Intl.NumberFormat('he-IL');
  const pct = (v) => (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dur = (s) => { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  let token = null, range = 28, rtTimer = 0;
  try { const t = JSON.parse(sessionStorage.getItem('mtp-admin-token') || 'null'); if (t && t.exp > Date.now() + 60000) token = t.v; } catch (e) {}
  try { range = +localStorage.getItem('mtp-admin-range') || 28; } catch (e) {}

  const LOGO = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#CDF545"/><g fill="#0B0B0D"><rect x="12" y="31" width="7.5" height="21" rx="3.75"/><rect x="23.5" y="19" width="7.5" height="33" rx="3.75"/><rect x="35" y="26" width="7.5" height="26" rx="3.75"/></g><path d="M51 11v15M43.5 18.5h15" stroke="#0B0B0D" stroke-width="5.5" stroke-linecap="round"/></svg>';
  const G = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';

  /* ---------- labels ---------- */
  const DEV = { mobile: 'טלפון', desktop: 'מחשב', tablet: 'טאבלט', 'smart tv': 'טלוויזיה' };
  const CH = { 'Organic Search': 'חיפוש בגוגל ומנועים', Direct: 'כניסה ישירה', Referral: 'הפניה מאתר אחר', 'Organic Social': 'רשתות חברתיות', 'Organic Video': 'וידאו (YouTube)', 'Paid Search': 'חיפוש ממומן', 'Paid Social': 'רשתות ממומן', Email: 'אימייל', Unassigned: 'לא משויך', Display: 'באנרים', 'Cross-network': 'קמפיין משולב', 'Organic Shopping': 'קניות' };
  const EV = { mic_test: 'בדיקות מיקרופון', webcam_test: 'בדיקות מצלמה', speaker_test: 'בדיקות רמקולים', voice_recording: 'הקלטות קול', mic_recording: 'הקלטות 5 שניות', webcam_snapshot: 'צילומי מצלמה' };
  let regionNames = null; try { regionNames = new Intl.DisplayNames(['he'], { type: 'region' }); } catch (e) {}
  const flag = (cc) => (cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) : '🌐');
  const country = (cc, name) => { let n = name; try { if (regionNames && cc && /^[A-Z]{2}$/.test(cc)) n = regionNames.of(cc); } catch (e) {} return n && n !== '(not set)' ? n : 'לא ידוע'; };
  const pageName = (p) => { const m = (CFG.pages || {})[p]; return m ? m : p; };

  /* ---------- GA Data API ---------- */
  async function ga(kind, body) {
    const r = await fetch(API + CFG.propertyId + (kind === 'rt' ? ':runRealtimeReport' : ':runReport'), {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (r.status === 401) { signOut(); throw new Error('expired'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error((j.error && j.error.message) || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  const rows = (j) => (j.rows || []).map((r) => ({ d: (r.dimensionValues || []).map((x) => x.value), m: (r.metricValues || []).map((x) => +x.value) }));
  const ranges = (n) => [{ startDate: (n - 1) + 'daysAgo', endDate: 'today', name: 'cur' }, { startDate: (2 * n - 1) + 'daysAgo', endDate: n + 'daysAgo', name: 'prev' }];

  async function loadAll(n) {
    const R = ranges(n);
    const [tot, daily, prevDaily, pages, countries, devices, chans, events, langs] = await Promise.all([
      ga('r', { dateRanges: R, metrics: ['activeUsers', 'sessions', 'screenPageViews', 'averageSessionDuration'].map((name) => ({ name })) }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }], keepEmptyRows: true }),
      ga('r', { dateRanges: [R[1]], dimensions: [{ name: 'date' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ dimension: { dimensionName: 'date' } }], keepEmptyRows: true }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 10 }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'countryId' }, { name: 'country' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }], limit: 8 }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }] }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: 8 }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }], dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: Object.keys(EV) } } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }] }),
      ga('r', { dateRanges: [R[0]], dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }], limit: 1000 })
    ]);
    const tr = rows(tot); const cur = tr.find((r) => r.d[0] === 'cur') || { m: [0, 0, 0, 0] }; const prev = tr.find((r) => r.d[0] === 'prev') || { m: [0, 0, 0, 0] };
    const langMap = {};
    rows(langs).forEach((r) => { const l = (r.d[0].match(/^\/([a-z]{2})\//) || [, 'en'])[1]; const key = (CFG.langs || {})[l] ? l : 'en'; langMap[key] = (langMap[key] || 0) + r.m[0]; });
    return {
      kpi: { cur: cur.m, prev: prev.m },
      daily: rows(daily).map((r) => ({ date: r.d[0], v: r.m[0] })),
      prevDaily: rows(prevDaily).map((r) => ({ date: r.d[0], v: r.m[0] })),
      pages: rows(pages).map((r) => ({ label: pageName(r.d[0]), sub: r.d[0], v: r.m[0], v2: r.m[1] })),
      countries: rows(countries).map((r) => ({ label: country(r.d[0], r.d[1]), icon: flag(r.d[0]), v: r.m[0] })),
      devices: rows(devices).map((r) => ({ label: DEV[r.d[0]] || r.d[0], v: r.m[0] })),
      channels: rows(chans).map((r) => ({ label: CH[r.d[0]] || r.d[0], v: r.m[0] })),
      events: rows(events).map((r) => ({ label: EV[r.d[0]] || r.d[0], v: r.m[0] })),
      langs: Object.entries(langMap).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ label: (CFG.langs || {})[l] || l, v }))
    };
  }
  async function loadRealtime() {
    const [by, mins] = await Promise.all([
      ga('rt', { dimensions: [{ name: 'countryId' }, { name: 'country' }], metrics: [{ name: 'activeUsers' }], limit: 5 }),
      ga('rt', { dimensions: [{ name: 'minutesAgo' }], metrics: [{ name: 'activeUsers' }] })
    ]);
    const total = rows(by).reduce((a, r) => a + r.m[0], 0);
    const perMin = Array(30).fill(0); rows(mins).forEach((r) => { const i = +r.d[0]; if (i >= 0 && i < 30) perMin[29 - i] = r.m[0]; });
    return { total, perMin, countries: rows(by).map((r) => ({ label: country(r.d[0], r.d[1]), icon: flag(r.d[0]), v: r.m[0] })) };
  }

  /* ---------- demo data (clearly labelled) ---------- */
  function demoData(n) {
    let seed = 7; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    const day = (k) => { const d = new Date(Date.now() - k * 864e5); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
    const daily = [], prevDaily = [];
    for (let i = n - 1; i >= 0; i--) { const g = 1 + (n - i) / n; daily.push({ date: day(i), v: Math.round((40 + rnd() * 30) * g * (i % 7 < 2 ? 0.8 : 1)) }); prevDaily.push({ date: day(i + n), v: Math.round((32 + rnd() * 24) * (1 + (n - i) / n / 2)) }); }
    const sum = (a) => a.reduce((x, y) => x + y.v, 0);
    return {
      kpi: { cur: [sum(daily), Math.round(sum(daily) * 1.25), Math.round(sum(daily) * 2.1), 96], prev: [sum(prevDaily), Math.round(sum(prevDaily) * 1.22), Math.round(sum(prevDaily) * 1.9), 88] },
      daily, prevDaily,
      pages: [['/', 'דף הבית'], ['/mic-test/', 'בדיקת מיקרופון'], ['/webcam-test/', 'בדיקת מצלמה'], ['/he/', 'דף הבית (עברית)'], ['/discord-mic-test/', 'בדיקת מיקרופון ל-Discord'], ['/voice-recorder/', 'מקליט קול']].map(([p, l], i) => ({ label: pageName(p) || l, sub: p, v: Math.round(900 / (i + 1.3)), v2: Math.round(600 / (i + 1.4)) })),
      countries: [['US', 420], ['IL', 260], ['IN', 190], ['DE', 120], ['BR', 96], ['GB', 80]].map(([c, v]) => ({ label: country(c, c), icon: flag(c), v })),
      devices: [{ label: 'טלפון', v: 640 }, { label: 'מחשב', v: 520 }, { label: 'טאבלט', v: 46 }],
      channels: [{ label: 'חיפוש בגוגל ומנועים', v: 710 }, { label: 'כניסה ישירה', v: 260 }, { label: 'רשתות חברתיות', v: 140 }, { label: 'הפניה מאתר אחר', v: 90 }],
      events: [{ label: 'בדיקות מיקרופון', v: 820 }, { label: 'בדיקות מצלמה', v: 430 }, { label: 'הקלטות קול', v: 120 }, { label: 'בדיקות רמקולים', v: 96 }],
      langs: [['English', 690], ['עברית', 210], ['Español', 140], ['Deutsch', 70], ['Português', 52]].map(([label, v]) => ({ label, v }))
    };
  }
  const demoRt = () => ({ total: 7, perMin: Array.from({ length: 30 }, (_, i) => [0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 0, 0, 1, 2, 2, 1, 3, 2, 1, 0, 1, 2, 1, 1, 0, 2, 3, 1, 2, 2][i]), countries: [{ label: country('US', 'US'), icon: flag('US'), v: 3 }, { label: country('IL', 'IL'), icon: flag('IL'), v: 2 }, { label: country('IN', 'IN'), icon: flag('IN'), v: 2 }] });

  /* ---------- rendering ---------- */
  function deltaHtml(cur, prev, lowerIsBetter) {
    if (!prev) return '<span class="delta"><span class="vs">אין נתונים לתקופה הקודמת</span></span>';
    const d = (cur - prev) / prev; const up = d >= 0; const good = lowerIsBetter ? !up : up;
    return `<span class="delta ${Math.abs(d) < 0.005 ? '' : good ? 'up' : 'down'}"><span class="ar" aria-hidden="true">${up ? '▲' : '▼'}</span>${(Math.abs(d) * 100).toFixed(0)}% <span class="vs">לעומת ${range} הימים שלפני</span></span>`;
  }
  function barsHtml(list, opts = {}) {
    if (!list.length) return '<div class="empty">אין עדיין נתונים</div>';
    const max = Math.max(...list.map((x) => x.v)) || 1; const total = list.reduce((a, x) => a + x.v, 0) || 1;
    return '<ul class="bars">' + list.map((x) => `<li title="${esc(x.label)}: ${nf.format(x.v)}">
      <span class="lb">${x.icon ? `<span class="flag" aria-hidden="true">${x.icon}</span>` : ''}<span>${esc(x.label)}</span>${x.sub && x.sub !== x.label ? ` <small dir="ltr">${esc(x.sub)}</small>` : ''}</span>
      <span class="val">${nf.format(x.v)}${opts.share ? `<small>${pct(x.v / total)}</small>` : ''}</span>
      <span class="track"><span class="fill" style="width:${(x.v / max * 100).toFixed(1)}%"></span></span></li>`).join('') + '</ul>';
  }
  const fmtDay = (s) => { const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' }); };

  function lineChart(el, cur, prev) {
    const wrap = el.querySelector('.lc-wrap');
    const draw = () => {
      const W = Math.max(280, wrap.clientWidth), H = wrap.clientWidth < 500 ? 220 : 260, padL = 36, padR = 10, padT = 10, padB = 26;
      const vals = cur.map((d) => d.v).concat(prev.map((d) => d.v));
      let max = Math.max(4, ...vals); const step = Math.pow(10, Math.floor(Math.log10(max / 4))); const nice = [1, 2, 2.5, 5, 10].map((k) => k * step).find((s) => max / s <= 4) || step * 10; max = Math.ceil(max / nice) * nice;
      const n = cur.length; const x = (i) => padL + (n <= 1 ? 0 : i / (n - 1)) * (W - padL - padR); const y = (v) => padT + (1 - v / max) * (H - padT - padB);
      const path = (arr) => arr.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.v).toFixed(1)).join(' ');
      let g = '';
      for (let v = 0; v <= max + 1e-9; v += nice) g += `<line class="gl" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${nf.format(v)}</text>`;
      const ticks = Math.min(W < 520 ? 4 : 6, n); for (let k = 0; k < ticks; k++) { const i = Math.round(k * (n - 1) / Math.max(1, ticks - 1)); g += `<text class="ax" x="${x(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === ticks - 1 ? 'end' : 'middle'}">${fmtDay(cur[i].date)}</text>`; }
      const area = n ? `${path(cur)} L${x(n - 1)} ${y(0)} L${x(0)} ${y(0)} Z` : '';
      wrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="מבקרים לפי יום">${g}<path class="area" d="${area}"/><path class="ref" d="${path(prev.slice(0, n))}"/><path class="cur" d="${path(cur)}"/>
        <line class="xh" y1="${padT}" y2="${H - padB}" x1="-10" x2="-10" visibility="hidden"/><circle class="dot d1" r="5" fill="var(--series-1)" visibility="hidden"/><circle class="dot d2" r="5" fill="var(--series-ref)" visibility="hidden"/>
        <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" class="hit"/></svg><div class="tip" hidden></div>`;
      const svg = wrap.querySelector('svg'), tip = wrap.querySelector('.tip'), xh = svg.querySelector('.xh'), d1 = svg.querySelector('.d1'), d2 = svg.querySelector('.d2');
      const show = (ev) => {
        const rect = svg.getBoundingClientRect(); const px = (ev.clientX - rect.left) * (W / rect.width);
        const i = Math.max(0, Math.min(n - 1, Math.round((px - padL) / ((W - padL - padR) / Math.max(1, n - 1)))));
        const X = x(i); xh.setAttribute('x1', X); xh.setAttribute('x2', X); xh.setAttribute('visibility', 'visible');
        d1.setAttribute('cx', X); d1.setAttribute('cy', y(cur[i].v)); d1.setAttribute('visibility', 'visible');
        if (prev[i]) { d2.setAttribute('cx', X); d2.setAttribute('cy', y(prev[i].v)); d2.setAttribute('visibility', 'visible'); }
        tip.innerHTML = `<b>${fmtDay(cur[i].date)}</b><div><span><i></i>${range} הימים האחרונים</span><strong>${nf.format(cur[i].v)}</strong></div>${prev[i] ? `<div><span><i class="ref"></i>תקופה קודמת (${fmtDay(prev[i].date)})</span><strong>${nf.format(prev[i].v)}</strong></div>` : ''}`;
        tip.hidden = false; const tw = tip.offsetWidth; let left = X / W * rect.width + 12; if (left + tw > rect.width) left = X / W * rect.width - tw - 12; tip.style.left = Math.max(0, left) + 'px'; tip.style.top = '8px';
      };
      const hide = () => { tip.hidden = true; [xh, d1, d2].forEach((e) => e.setAttribute('visibility', 'hidden')); };
      const hit = svg.querySelector('.hit'); hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show); hit.addEventListener('pointerleave', hide);
    };
    draw(); let t; new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 80); }).observe(wrap);
    const tbtn = el.querySelector('.tbl-toggle'), tbl = el.querySelector('.table-scroll');
    tbl.innerHTML = `<table class="data-table"><thead><tr><th>תאריך</th><th class="n">מבקרים</th><th class="n">תקופה קודמת</th></tr></thead><tbody>${cur.map((d, i) => `<tr><td>${fmtDay(d.date)}</td><td class="n">${nf.format(d.v)}</td><td class="n">${prev[i] ? nf.format(prev[i].v) : '–'}</td></tr>`).reverse().join('')}</tbody></table>`;
    tbtn.onclick = () => { const h = tbl.hidden; tbl.hidden = !h; tbtn.textContent = h ? 'הסתרת הטבלה' : 'הצגה כטבלה'; tbtn.setAttribute('aria-expanded', String(h)); };
  }

  function shell(inner) {
    app.innerHTML = `<header class="adm-top"><div class="wrap adm-top-in">
      <span class="brand"><span class="logo" style="width:30px;height:30px">${LOGO}</span><span>MicTest<span class="plus">+</span></span></span><span class="adm-badge">ניהול</span>
      <div class="adm-actions">${inner || ''}</div></div></header><main class="wrap adm-main viz-root" id="main"></main>`;
  }

  function renderGate(msg) {
    clearInterval(rtTimer);
    shell();
    const configured = CFG.clientId && CFG.propertyId;
    $('#main').innerHTML = `<div class="gate">
      <span class="logo">${LOGO}</span>
      <h1>לוח הבקרה של MicTest+</h1>
      ${msg ? `<div class="err" role="alert">${msg}</div>` : ''}
      ${configured ? `<p>מתחברים עם חשבון הגוגל שיש לו גישה ל-Google Analytics של האתר. רק אתם רואים את הנתונים.</p>
        <button class="gbtn" id="signin" type="button">${G}<span>התחברות עם Google</span></button>
        <p class="note muted">הגישה לקריאה בלבד. שום נתון לא נשמר באתר.</p>` : `<p>כדי להציג נתונים אמיתיים צריך לחבר את הדף ל-Google Analytics (פעם אחת).</p>
        <div class="steps"><b>מה חסר בהגדרות:</b><ol>
          ${CFG.propertyId ? '' : '<li>מזהה הנכס ב-Analytics: ניהול ← פרטי הנכס ← <b>מזהה נכס</b> (מספר, למשל <code>512345678</code>).</li>'}
          ${CFG.clientId ? '' : '<li>מזהה לקוח OAuth מ-Google Cloud (נראה כמו <code>…apps.googleusercontent.com</code>).</li>'}
        </ol></div>`}
      <p class="note"><a href="?demo">הצגת לוח הבקרה עם נתוני דוגמה</a></p>
    </div>`;
    const b = $('#signin'); if (b) b.addEventListener('click', signIn);
  }

  async function renderDashboard() {
    const segs = [7, 28, 90].map((n) => `<button type="button" data-r="${n}" aria-pressed="${n === range}">${n} ימים</button>`).join('');
    shell(`<div class="seg" role="group" aria-label="טווח זמן">${segs}</div><button class="btn" id="reload" type="button">רענון</button>${DEMO ? '<a class="btn btn-ghost" href="./">יציאה מהדוגמה</a>' : ''}<button class="btn btn-ghost" id="signout" type="button">התנתקות</button>`);
    const main = $('#main');
    main.innerHTML = `${DEMO ? '<div class="demo-flag" role="note">⚠️ תצוגה לדוגמה: אלה לא הנתונים האמיתיים של האתר.</div>' : ''}
      <h1 class="adm-h1">סקירה כללית</h1><p class="adm-sub" id="sub"><bdi>mictestplus.com</bdi> · ${range} הימים האחרונים</p>
      <section class="grid g-top">
        <div class="panel rt" id="rt"><span class="rt-live">עכשיו באתר</span><div class="rt-num" id="rtNum">–</div><div class="rt-cap">משתמשים פעילים ב-30 הדקות האחרונות</div>
          <div class="rt-bars" id="rtBars" aria-hidden="true"></div><div class="rt-axis"><span>לפני 30 דק׳</span><span>עכשיו</span></div><div class="rt-list" id="rtList"></div></div>
        <div class="g-kpi" id="kpis"></div>
      </section>
      <section class="panel mt" id="lc"><div class="lc-head"><h2 style="margin:0">מבקרים לפי יום</h2><div class="legend"><span><i></i>${range} הימים האחרונים</span><span><i class="ref"></i>התקופה שלפני</span></div><button class="btn tbl-toggle" type="button" aria-expanded="false">הצגה כטבלה</button></div><div class="lc-wrap"></div><div class="table-scroll" hidden></div><div class="loading-cover"></div></section>
      <section class="grid g-2 mt"><div class="panel" id="pPages"><h2>הדפים הנצפים ביותר <small>צפיות</small></h2></div><div class="panel" id="pEvents"><h2>בדיקות שבוצעו באתר <small>פעמים</small></h2></div></section>
      <section class="grid g-3 mt"><div class="panel" id="pCountries"><h2>מדינות <small>משתמשים</small></h2></div><div class="panel" id="pDevices"><h2>מכשירים <small>משתמשים</small></h2></div><div class="panel" id="pChannels"><h2>מאיפה הגיעו <small>ביקורים</small></h2></div></section>
      <section class="panel mt" id="pLangs"><h2>שפות האתר שנצפו <small>צפיות</small></h2></section>`;
    document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { range = +b.dataset.r; try { localStorage.setItem('mtp-admin-range', range); } catch (e) {} renderDashboard(); }));
    $('#reload').addEventListener('click', () => renderDashboard());
    const so = $('#signout'); if (so) so.addEventListener('click', () => { signOut(); renderLogin(); });
    ['pPages', 'pEvents', 'pCountries', 'pDevices', 'pChannels', 'pLangs'].forEach((id) => { $('#' + id).insertAdjacentHTML('beforeend', '<div class="skel" style="height:120px"></div>'); });
    $('#kpis').innerHTML = Array(4).fill('<div class="panel kpi"><div class="skel" style="height:86px"></div></div>').join('');
    try {
      const D = DEMO ? demoData(range) : await loadAll(range);
      const K = [['משתמשים', D.kpi.cur[0], D.kpi.prev[0], nf.format], ['ביקורים', D.kpi.cur[1], D.kpi.prev[1], nf.format], ['צפיות בדפים', D.kpi.cur[2], D.kpi.prev[2], nf.format], ['זמן ממוצע בביקור', D.kpi.cur[3], D.kpi.prev[3], dur]];
      $('#kpis').innerHTML = K.map(([l, c, p, f]) => `<div class="panel kpi"><div class="k-label">${l}</div><div class="k-value">${f(c)}</div>${deltaHtml(c, p)}</div>`).join('');
      lineChart($('#lc'), D.daily, D.prevDaily);
      const put = (id, html) => { const el = $('#' + id); el.querySelector('.skel')?.remove(); el.insertAdjacentHTML('beforeend', html); };
      put('pPages', barsHtml(D.pages)); put('pEvents', D.events.length ? barsHtml(D.events) : '<div class="empty">עדיין לא נרשמו בדיקות. הנתון מתחיל להיספר מהיום.</div>');
      put('pCountries', barsHtml(D.countries, { share: true })); put('pDevices', barsHtml(D.devices, { share: true })); put('pChannels', barsHtml(D.channels, { share: true })); put('pLangs', barsHtml(D.langs, { share: true }));
    } catch (e) { return handleErr(e); }
    const rt = async () => {
      try {
        const R = DEMO ? demoRt() : await loadRealtime(); const mx = Math.max(1, ...R.perMin);
        $('#rtNum').textContent = nf.format(R.total);
        $('#rtBars').innerHTML = R.perMin.map((v) => `<i class="${v ? '' : 'zero'}" style="height:${v ? Math.max(8, v / mx * 100) : 4}%" title="${v}"></i>`).join('');
        $('#rtList').innerHTML = R.countries.length ? barsHtml(R.countries) : '<div class="empty" style="padding:6px 0">אין כרגע מבקרים</div>';
      } catch (e) { if (e.message === 'expired') renderGate('ההתחברות פגה. התחברו שוב.'); }
    };
    rt(); clearInterval(rtTimer); rtTimer = setInterval(rt, 30000);
  }

  function handleErr(e) {
    if (e.message === 'expired') return renderGate('ההתחברות פגה. התחברו שוב.');
    if (e.status === 403) return renderGate('לחשבון הזה אין גישה לנכס האנליטיקס של האתר, או ש-Google Analytics Data API לא מופעל בפרויקט. התחברו עם החשבון הנכון.');
    renderGate('לא הצלחנו לטעון נתונים: ' + esc(e.message));
  }

  /* ---------- auth (Google Identity Services, token model) ---------- */
  let tokenClient = null;
  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => rej(new Error('לא הצלחנו לטעון את ההתחברות של Google'));
      document.head.appendChild(s);
    });
  }
  async function signIn() {
    try { await loadGis(); } catch (e) { return renderGate(e.message); }
    tokenClient = tokenClient || google.accounts.oauth2.initTokenClient({
      client_id: CFG.clientId, scope: SCOPE,
      callback: (r) => {
        if (r.error || !r.access_token) return renderGate('ההתחברות בוטלה או נכשלה.');
        token = r.access_token;
        try { sessionStorage.setItem('mtp-admin-token', JSON.stringify({ v: token, exp: Date.now() + (r.expires_in || 3600) * 1000 })); } catch (e) {}
        renderDashboard();
      }
    });
    tokenClient.requestAccessToken({ prompt: '' });
  }
  function signOut() {
    try { if (token && window.google && google.accounts) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; clearInterval(rtTimer);
    try { sessionStorage.removeItem('mtp-admin-token'); sessionStorage.removeItem('mtp-admin-ok'); } catch (e) {}
  }

  /* ---------- theme follows the site's saved choice ---------- */
  try { const th = localStorage.getItem('mtp-theme'); if (th) document.documentElement.dataset.theme = th; } catch (e) {}

  /* ---------- first gate: username + password (checked against a salted PBKDF2 fingerprint) ---------- */
  async function fingerprint(user, pass) {
    const L = CFG.login; const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(user + ':' + pass), 'PBKDF2', false, ['deriveBits']);
    const salt = new Uint8Array(L.salt.match(/../g).map((h) => parseInt(h, 16)));
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: L.iter }, key, 256);
    return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  const passed = () => { try { return sessionStorage.getItem('mtp-admin-ok') === (CFG.login && CFG.login.hash.slice(0, 16)); } catch (e) { return false; } };
  function renderLogin(msg) {
    shell();
    $('#main').innerHTML = `<div class="gate">
      <span class="logo">${LOGO}</span>
      <h1>כניסה לניהול</h1>
      ${msg ? `<div class="err" role="alert">${msg}</div>` : ''}
      <form class="login" id="login" autocomplete="on">
        <label>שם משתמש<input name="u" autocomplete="username" required dir="ltr" autocapitalize="off" spellcheck="false"></label>
        <label>סיסמה<span class="pw"><input name="p" type="password" autocomplete="current-password" required dir="ltr"><button type="button" class="pw-eye" aria-label="הצגת הסיסמה" aria-pressed="false">הצג</button></span></label>
        <button class="btn btn-primary btn-lg" type="submit">כניסה</button>
      </form>
    </div>`;
    const f = $('#login'); const eye = f.querySelector('.pw-eye'); const pi = f.querySelector('[name=p]');
    eye.addEventListener('click', () => { const show = pi.type === 'password'; pi.type = show ? 'text' : 'password'; eye.textContent = show ? 'הסתר' : 'הצג'; eye.setAttribute('aria-pressed', String(show)); });
    setTimeout(() => f.querySelector('[name=u]').focus(), 50);
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'בודק…';
      let ok = false;
      try { ok = (await fingerprint(f.u.value.trim(), f.p.value)) === CFG.login.hash; } catch (err) { ok = false; }
      if (!ok) { await new Promise((r) => setTimeout(r, 900)); return renderLogin('שם המשתמש או הסיסמה שגויים.'); }
      try { sessionStorage.setItem('mtp-admin-ok', CFG.login.hash.slice(0, 16)); } catch (err) {}
      start();
    });
  }
  function start() {
    if (DEMO) renderDashboard();
    else if (token && CFG.clientId && CFG.propertyId) renderDashboard();
    else renderGate();
  }
  if (CFG.login && CFG.login.hash && !passed()) renderLogin(); else start();
})();
