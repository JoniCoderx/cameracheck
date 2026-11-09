/* MicTest+ embeddable mic test (runs inside an <iframe> on other sites). Tiny, no dependencies. */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const ALL = window.EMBED_I18N || {};
  const lang = ALL[q.get('lang')] ? q.get('lang') : 'en';
  const S = ALL[lang];
  const theme = q.get('theme') === 'light' ? 'light' : 'dark';
  document.documentElement.lang = lang;
  document.documentElement.dir = S.dir;
  document.documentElement.dataset.theme = theme;
  const $ = (s) => document.querySelector(s);
  const btn = $('#go'), lbl = $('#go span'), fill = $('#fill'), db = $('#db'), verdict = $('#verdict');
  $('#title').textContent = S.micTest;
  lbl.textContent = S.startMic;
  verdict.textContent = S.hint;
  const full = $('#full'); full.href = S.fullUrl; full.querySelector('span').textContent = S.fullTest;
  let stream = null, ctx = null, an = null, raf = 0, heard = false, busy = false;
  const err = (e) => {
    const n = e && e.name;
    return n === 'NotAllowedError' || n === 'SecurityError' ? S.errDenied : n === 'NotFoundError' || n === 'OverconstrainedError' ? S.errNotFound : n === 'NotReadableError' ? S.errBusy : S.errGeneric + ((e && e.message) || '');
  };
  async function start() {
    if (busy) return;
    busy = true;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) { verdict.textContent = err(e); verdict.className = 'v bad'; return; }
    finally { busy = false; }
    const src = ctx.createMediaStreamSource(stream); an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    btn.classList.add('on'); lbl.textContent = S.stop; heard = false;
    const buf = new Float32Array(an.fftSize); let last = 0;
    const loop = (t) => {
      if (!an) return;
      an.getFloatTimeDomainData(buf); let s = 0, pk = 0; for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; pk = Math.max(pk, Math.abs(buf[i])); }
      const d = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-8);
      fill.style.setProperty('--lvl', Math.max(0, Math.min(100, ((d + 60) / 60) * 100)).toFixed(1) + '%');
      if (t - last > 120) {
        last = t; db.textContent = isFinite(d) ? Math.round(d) : '-∞';
        if (d > -50) heard = true;
        let txt, cls = 'v';
        if (d < -55) { txt = heard ? S.vDetected : S.vSilent; if (heard) cls += ' ok'; }
        else if (d < -42) { txt = S.vLow; cls += ' warn'; }
        else if (pk > 0.98) { txt = S.vLoud; cls += ' bad'; }
        else { txt = S.vGood; cls += ' ok'; }
        verdict.textContent = txt; verdict.className = cls;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }
  function stop() {
    cancelAnimationFrame(raf); an = null;
    if (stream) stream.getTracks().forEach((t) => t.stop()); stream = null;
    btn.classList.remove('on'); lbl.textContent = S.startMic; fill.style.setProperty('--lvl', '0%'); db.textContent = '-∞';
  }
  btn.addEventListener('click', () => (stream ? stop() : start()));
  if (!window.isSecureContext || !(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) { verdict.textContent = S.errInsecure; verdict.className = 'v bad'; }
})();
