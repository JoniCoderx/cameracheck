(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
  const logEvent = (name, params) => { try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) {} };
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
  const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };

  /* ---------------- i18n (strings injected by the page) ---------------- */
  const L = window.I18N || {};
  const PAGE = window.PAGE || { tools: [] };
  const t = (k) => (L[k] !== undefined ? L[k] : k);
  const langSel = $('#langSelect');
  if (langSel) langSel.addEventListener('change', () => { location.href = langSel.value; });

  /* ---------------- theme ---------------- */
  let theme = null;
  try { theme = localStorage.getItem('mtp-theme'); } catch (e) {}
  if (theme) document.documentElement.dataset.theme = theme;
  if (theme === 'light') { const tc = $('meta[name=theme-color]'); if (tc) tc.setAttribute('content', '#f4f4ef'); }
  on('#themeBtn', 'click', () => {
    const cur = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = cur;
    $('meta[name=theme-color]').setAttribute('content', cur === 'light' ? '#f4f4ef' : '#0b0b0d');
    try { localStorage.setItem('mtp-theme', cur); } catch (e) {}
  });

  /* ---------------- helpers ---------------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function errMsg(e) {
    const n = e && e.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return t('errDenied');
    if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return t('errNotFound');
    if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError') return t('errBusy');
    return t('errGeneric') + (e && (e.message || n) || '');
  }
  const status = { mic: 'notTested', cam: 'notTested', spk: 'notTested' };
  const extra = { mic: '', cam: '', spk: '' };
  function setStatus(which, s) { status[which] = s; renderStatuses(); renderResults(); }
  function renderStatuses() {
    [['mic', '#stMic'], ['cam', '#stCam'], ['spk', '#stSpk']].forEach(([k, sel]) => {
      const el = $(sel); if (!el) return; const s = status[k];
      el.classList.remove('ok', 'bad', 'wait');
      if (s === 'working') el.classList.add('ok');
      if (s === 'failed') el.classList.add('bad');
      if (s === 'testing') el.classList.add('wait');
      el.querySelector('b').textContent = extra[k] && s === 'working' ? extra[k] : t(s);
    });
  }
  const sr = $('.status-row'); if (sr) sr.style.setProperty('--n', sr.children.length);
  function fitCanvas(c) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    return { w: c.width, h: c.height, dpr };
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  function pickMime(list) {
    if (!window.MediaRecorder) return null;
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
    return '';
  }
  const extFor = (mime) => (mime && mime.includes('mp4') ? 'mp4' : mime && mime.includes('ogg') ? 'ogg' : 'webm');

  // secure context warning
  const secAlert = $('#secureAlert');
  if (secAlert && (!window.isSecureContext || !hasMedia)) {
    secAlert.hidden = false;
    const d = document.createElement('div');
    d.textContent = !window.isSecureContext ? t('errInsecure') : t('errUnsupported');
    secAlert.appendChild(d);
  }

  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  /* ---------------- MIC ---------------- */
  const mic = { stream: null, src: null, analyser: null, raf: 0, peak: 0, peakT: 0, heard: false, echo: false, recorder: null };
  const waveC = $('#waveCanvas'), specC = $('#specCanvas');

  async function startMic() {
    if (!hasMedia) return toast(t('errUnsupported'));
    setStatus('mic', 'testing');
    // Create/resume the AudioContext synchronously inside the tap: iOS Safari keeps it
    // suspended (frozen meter) if it is first touched after an await.
    getCtx();
    const id = $('#micSelect').value;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: id && id !== 'default-x' ? { deviceId: { exact: id } } : true
      });
      stopMic(true);
      mic.stream = stream;
      const ctx = getCtx();
      mic.src = ctx.createMediaStreamSource(stream);
      mic.analyser = ctx.createAnalyser();
      mic.analyser.fftSize = 2048;
      mic.analyser.smoothingTimeConstant = 0.75;
      mic.src.connect(mic.analyser);
      mic.heard = false; mic.samples = []; mic.clips = 0; mic.scored = false;
      const sc = $('#micScore'); if (sc) { sc.hidden = false; sc.classList.remove('done'); setText('#scoreTip', t('scoreWait')); setText('#scoreNum', '–'); setText('#scoreGrade', ''); $('#scoreRing').className = 'score-ring'; $('#scoreRing').style.setProperty('--p', 0); $('#scoreProg').style.setProperty('--w', '0%'); setText('#sNoise', '–'); setText('#sVoice', '–'); }
      $('#mic').classList.add('live');
      $('#micBtn').textContent = t('stop'); $('#micBtn').classList.add('on');
      $('#recBtn').disabled = false; $('#echoBtn').disabled = false;
      const track = stream.getAudioTracks()[0];
      const st = track.getSettings ? track.getSettings() : {};
      $('#mDev').textContent = track.label || t('unknown');
      $('#mDev').title = track.label || '';
      $('#mRate').textContent = (st.sampleRate || ctx.sampleRate) + ' Hz';
      $('#mCh').textContent = st.channelCount ? (st.channelCount === 1 ? t('mono') : st.channelCount === 2 ? t('stereo') : st.channelCount) : t('unknown');
      $('#mEc').textContent = st.echoCancellation === undefined ? t('unknown') : st.echoCancellation ? t('on') : t('off');
      $('#mNs').textContent = st.noiseSuppression === undefined ? t('unknown') : st.noiseSuppression ? t('on') : t('off');
      track.addEventListener('ended', () => stopMic());
      logEvent('mic_test');
      await refreshDevices();
      if (st.deviceId) $('#micSelect').value = st.deviceId;
      loopMic();
    } catch (e) {
      setStatus('mic', 'failed');
      $('#micVerdict').textContent = errMsg(e); $('#micVerdict').className = 'verdict bad';
      toast(errMsg(e));
    }
  }

  function stopMic(silent) {
    cancelAnimationFrame(mic.raf);
    if (mic.recorder && mic.recorder.state === 'recording') mic.recorder.stop();
    if (mic.echo) toggleEcho();
    if (mic.src) { try { mic.src.disconnect(); } catch (e) {} }
    if (mic.stream) mic.stream.getTracks().forEach((tr) => tr.stop());
    mic.stream = null; mic.src = null; mic.analyser = null;
    if (silent) return;
    $('#mic').classList.remove('live');
    $('#micBtn').textContent = t('start'); $('#micBtn').classList.remove('on');
    $('#recBtn').disabled = true; $('#echoBtn').disabled = true;
    $('.meter').style.setProperty('--lvl', '0%'); $('.meter').style.setProperty('--pk', '0%');
    $('#dbRead').textContent = '-∞';
    $('#micVerdict').textContent = t('waiting'); $('#micVerdict').className = 'verdict';
    clearCanvas(waveC); clearCanvas(specC);
  }
  function clearCanvas(c) { const { w, h } = fitCanvas(c); c.getContext('2d').clearRect(0, 0, w, h); }

  function loopMic() {
    const an = mic.analyser; if (!an) return;
    const time = new Float32Array(an.fftSize);
    const freq = new Uint8Array(an.frequencyBinCount);
    const meter = $('.meter'), dbEl = $('#dbRead'), verdict = $('#micVerdict'), fEl = $('#mFreq');
    let lastText = 0;
    const brand = css('--brand'), brand2 = css('--brand2');
    const ctx = getCtx();

    const draw = () => {
      if (!mic.analyser) return;
      an.getFloatTimeDomainData(time);
      an.getByteFrequencyData(freq);
      let sum = 0, pk = 0;
      for (let i = 0; i < time.length; i++) { const v = time[i]; sum += v * v; const a = Math.abs(v); if (a > pk) pk = a; }
      const rms = Math.sqrt(sum / time.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      // map -60..0 dB -> 0..100
      const lvl = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
      const now = performance.now();
      if (lvl > mic.peak || now - mic.peakT > 1200) { mic.peak = lvl; mic.peakT = now; }
      meter.style.setProperty('--lvl', lvl.toFixed(1) + '%');
      meter.style.setProperty('--pk', mic.peak.toFixed(1) + '%');

      if (now - lastText > 120) {
        lastText = now;
        dbEl.textContent = isFinite(db) ? Math.round(db) : '-∞';
        let cls = 'verdict', txt;
        if (db < -55) txt = mic.heard ? t('vDetected') : t('vSilent');
        else if (db < -42) { txt = t('vLow'); cls += ' warn'; }
        else if (pk > 0.98) { txt = t('vLoud'); cls += ' bad'; }
        else { txt = t('vGood'); cls += ' ok'; }
        if (db > -50 && !mic.heard) { mic.heard = true; setStatus('mic', 'working'); }
        if (mic.heard) { mic.samples.push(isFinite(db) ? db : -100); if (pk > 0.98) mic.clips++; if (mic.samples.length > 125) mic.samples.shift(); updateScore(); }
        if (mic.heard && db < -55) cls += ' ok';
        verdict.textContent = txt; verdict.className = cls;
        // dominant frequency
        let maxI = 0, maxV = 0;
        for (let i = 2; i < freq.length; i++) if (freq[i] > maxV) { maxV = freq[i]; maxI = i; }
        fEl.textContent = maxV > 60 ? Math.round((maxI * ctx.sampleRate) / an.fftSize) + ' Hz' : '–';
      }

      // waveform
      let g = waveC.getContext('2d'); let s = fitCanvas(waveC);
      g.clearRect(0, 0, s.w, s.h);
      g.lineWidth = 2 * s.dpr; g.strokeStyle = brand2; g.beginPath();
      const step = time.length / s.w;
      for (let x = 0; x < s.w; x++) {
        const v = time[Math.floor(x * step)];
        const y = s.h / 2 + v * (s.h / 2) * 0.95;
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();

      // spectrum (log-ish)
      g = specC.getContext('2d'); s = fitCanvas(specC);
      g.clearRect(0, 0, s.w, s.h);
      const bars = Math.min(96, Math.floor(s.w / (6 * s.dpr)));
      const bw = s.w / bars;
      const grad = g.createLinearGradient(0, s.h, 0, 0);
      grad.addColorStop(0, brand); grad.addColorStop(1, brand2);
      g.fillStyle = grad;
      const maxBin = freq.length * 0.7;
      for (let b = 0; b < bars; b++) {
        const lo = Math.floor(Math.pow(maxBin, b / bars));
        const hi = Math.max(lo + 1, Math.floor(Math.pow(maxBin, (b + 1) / bars)));
        let m = 0; for (let i = lo; i < hi; i++) if (freq[i] > m) m = freq[i];
        const bh = (m / 255) * s.h;
        g.fillRect(b * bw + 1, s.h - bh, bw - 2, bh);
      }
      mic.raf = requestAnimationFrame(draw);
    };
    draw();
  }

  const NEED = 42; // about five seconds of samples after the first sound
  function updateScore() {
    const n = mic.samples.length;
    if (!$('#micScore')) return;
    if (n < NEED && !mic.scored) { $('#scoreProg').style.setProperty('--w', Math.round((n / NEED) * 100) + '%'); return; }
    if (n % 8 && mic.scored) return; // refresh about once a second
    const s = [...mic.samples].sort((a, b) => a - b);
    const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
    const noise = q(0.05), voice = q(0.9), clip = mic.clips / Math.max(n, NEED);
    const pQuiet = voice < -30 ? Math.min(45, (-30 - voice) * 2.5) : 0;
    const pNoise = Math.min(40, Math.max(0, (noise + 55) * 1.6) + Math.max(0, (25 - (voice - noise)) * 1.2));
    const pLoud = Math.min(35, clip * 300);
    const score = Math.max(0, Math.min(100, Math.round(100 - pQuiet - pNoise - pLoud)));
    const g = score >= 85 ? ['gExcellent', 'ok'] : score >= 70 ? ['gGood', 'ok'] : score >= 50 ? ['gFair', 'warn'] : ['gPoor', 'bad'];
    const worst = Math.max(pQuiet, pNoise, pLoud);
    const tip = score >= 85 || worst === 0 ? 'tipGreat' : worst === pLoud ? 'tipLoud' : worst === pQuiet ? 'tipQuiet' : 'tipNoise';
    setText('#scoreNum', score); setText('#scoreGrade', t(g[0])); $('#scoreGrade').className = g[1];
    $('#scoreRing').className = 'score-ring ' + g[1]; $('#scoreRing').style.setProperty('--p', score);
    setText('#scoreTip', t(tip)); setText('#sNoise', Math.round(noise) + ' dB'); setText('#sVoice', Math.round(voice) + ' dB');
    $('#micScore').classList.add('done');
    mic.score = score; mic.grade = t(g[0]); extra.mic = score + '/100';
    if (!mic.scored) { mic.scored = true; logEvent('mic_score', { score }); }
    renderStatuses(); renderResults();
  }

  on('#micBtn', 'click', () => (mic.stream ? stopMic() : startMic()));
  on('#micGo', 'click', () => { if (!mic.stream) startMic(); });
  on('#micSelect', 'change', () => { if (mic.stream) startMic(); });

  function toggleEcho() {
    if (!mic.src) return;
    const ctx = getCtx();
    if (!mic.echo) { mic.src.connect(ctx.destination); mic.echo = true; toast(t('echoWarn')); }
    else { try { mic.src.disconnect(ctx.destination); } catch (e) {} mic.echo = false; }
    $('#echoBtn').textContent = mic.echo ? t('echoOff') : t('echoOn');
    $('#echoBtn').classList.toggle('active', mic.echo);
  }
  on('#echoBtn', 'click', toggleEcho);

  on('#recBtn', 'click', () => {
    if (!mic.stream || !window.MediaRecorder) return toast(t('errUnsupported'));
    if (mic.recorder && mic.recorder.state === 'recording') return mic.recorder.stop();
    const mime = pickMime(['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']);
    const rec = new MediaRecorder(mic.stream, mime ? { mimeType: mime } : undefined);
    const chunks = []; const btn = $('#recBtn'); const label = btn.querySelector('span:last-child');
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let left = 5; label.textContent = t('recording') + left;
    const iv = setInterval(() => { left--; if (left > 0) label.textContent = t('recording') + left; }, 1000);
    const to = setTimeout(() => rec.state === 'recording' && rec.stop(), 5000);
    rec.onstop = () => {
      clearInterval(iv); clearTimeout(to);
      btn.classList.remove('recording'); label.textContent = t('record');
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const a = $('#recAudio'); if (a.src.startsWith('blob:')) URL.revokeObjectURL(a.src); a.src = url; a.hidden = false; a.play().catch(() => {});
      const dl = $('#recDl'); dl.href = url; dl.download = 'mictestplus-recording.' + extFor(blob.type); dl.hidden = false;
    };
    mic.recorder = rec; btn.classList.add('recording'); rec.start(); logEvent('mic_recording');
  });

  /* ---------------- CAMERA ---------------- */
  const cam = { stream: null, facing: 'user', mirror: true, fpsTimer: 0, briTimer: 0, frames: 0, grid: false, recorder: null };
  const video = $('#video'), wrap = $('#videoWrap');

  async function startCam(opts = {}) {
    if (!hasMedia) return toast(t('errUnsupported'));
    setStatus('cam', 'testing');
    const id = opts.useFacing ? '' : $('#camSelect').value;
    const res = $('#resSelect').value;
    const v = {};
    if (id) v.deviceId = { exact: id }; else v.facingMode = cam.facing;
    if (res !== 'auto') { const [w, h] = res.split('x').map(Number); v.width = { ideal: w }; v.height = { ideal: h }; }
    else { v.width = { ideal: 1280 }; v.height = { ideal: 720 }; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: v, audio: false });
      stopCam(true);
      cam.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      $('#videoEmpty').hidden = true; $('#videoBadges').hidden = false; wrap.classList.add('live');
      $('#camBtn').textContent = t('stop'); $('#camBtn').classList.add('on');
      ['#snapBtn', '#mirrorBtn', '#flipBtn', '#gridBtn', '#fsBtn', '#vrecBtn'].forEach((s) => ($(s).disabled = false));
      const track = stream.getVideoTracks()[0];
      const st = track.getSettings ? track.getSettings() : {};
      // What the camera can do at most (Chrome, Edge, Safari; Firefox has no getCapabilities)
      try {
        const caps = track.getCapabilities ? track.getCapabilities() : null;
        if (caps && caps.width && caps.width.max && caps.height && caps.height.max) {
          const fpsMax = caps.frameRate && caps.frameRate.max ? Math.round(caps.frameRate.max) : 0;
          setText('#cMax', caps.width.max + ' × ' + caps.height.max + (fpsMax ? ' · ' + fpsMax + ' fps' : ''));
          const mw = $('#cMaxWrap'); if (mw) mw.hidden = false;
          // grey out resolutions the camera can't deliver
          $$('#resSelect option').forEach((o) => { const m = /^(\d+)x(\d+)$/.exec(o.value); if (m) o.disabled = +m[1] > caps.width.max || +m[2] > caps.height.max; });
        }
      } catch (e) {}
      if (st.facingMode) cam.facing = st.facingMode;
      cam.mirror = cam.facing !== 'environment';
      wrap.classList.toggle('mirror', cam.mirror);
      $('#mirrorBtn').classList.toggle('active', cam.mirror);
      $('#cDev').textContent = track.label || t('unknown'); $('#cDev').title = track.label || '';
      track.addEventListener('ended', () => stopCam());
      logEvent('webcam_test');
      setStatus('cam', 'working');
      await refreshDevices();
      if (st.deviceId) $('#camSelect').value = st.deviceId;
      const onMeta = () => updateCamSpecs(st);
      if (video.readyState >= 1) onMeta(); else video.addEventListener('loadedmetadata', onMeta, { once: true });
      measureFps(st.frameRate);
      cam.briTimer = setInterval(measureBrightness, 700);
    } catch (e) {
      setStatus('cam', 'failed');
      toast(errMsg(e));
    }
  }

  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function updateCamSpecs() {
    const w = video.videoWidth, h = video.videoHeight;
    if (!w) return;
    $('#cRes').textContent = w + ' × ' + h; $('#bRes').textContent = h >= 2160 ? '4K' : (Math.min(w, h)) + 'p';
    const g = gcd(w, h); let ar = (w / g) + ':' + (h / g);
    const r = w / h; if (Math.abs(r - 16 / 9) < 0.02) ar = '16:9'; else if (Math.abs(r - 4 / 3) < 0.02) ar = '4:3'; else if (Math.abs(r - 9 / 16) < 0.02) ar = '9:16'; else if (Math.abs(r - 3 / 4) < 0.02) ar = '3:4';
    $('#cAsp').textContent = ar;
    $('#cMp').textContent = ((w * h) / 1e6).toFixed(2) + ' MP';
    wrap.style.aspectRatio = w + ' / ' + h;
    cam.res = w + '×' + h; extra.cam = (h >= 2160 ? '4K' : Math.min(w, h) + 'p'); renderStatuses(); renderResults();
    drawGrid();
  }
  if (video) video.addEventListener('resize', updateCamSpecs);

  function measureFps(nominal) {
    cancelAnimationFrame(cam.fpsRaf);
    clearInterval(cam.fpsTimer);
    cam.frames = 0;
    let lastT = performance.now();
    if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
      const cb = () => { cam.frames++; if (cam.stream) cam.vfc = video.requestVideoFrameCallback(cb); };
      cam.vfc = video.requestVideoFrameCallback(cb);
    } else {
      // fallback: count distinct currentTime changes
      let last = -1;
      const tick = () => { if (video.currentTime !== last) { last = video.currentTime; cam.frames++; } if (cam.stream) cam.fpsRaf = requestAnimationFrame(tick); };
      tick();
    }
    cam.fpsTimer = setInterval(() => {
      const now = performance.now();
      let fps = (cam.frames * 1000) / (now - lastT);
      cam.frames = 0; lastT = now;
      if (!fps && nominal) fps = nominal;
      const txt = fps ? Math.round(fps) + ' fps' : '–';
      $('#bFps').textContent = txt; if (fps && Math.round(fps) !== cam.fps) { cam.fps = Math.round(fps); renderResults(); }
      $('#cFps').textContent = txt + (nominal ? ' / ' + Math.round(nominal) : '');
    }, 1000);
  }

  const briCanvas = document.createElement('canvas'); briCanvas.width = 32; briCanvas.height = 18;
  function measureBrightness() {
    if (!cam.stream || !video.videoWidth) return;
    const g = briCanvas.getContext('2d', { willReadFrequently: true });
    g.drawImage(video, 0, 0, 32, 18);
    const d = g.getImageData(0, 0, 32, 18).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const pct = Math.round((s / (d.length / 4) / 255) * 100);
    $('#cBri').textContent = pct + '%';
  }

  function stopCam(silent) {
    clearInterval(cam.fpsTimer); clearInterval(cam.briTimer); cancelAnimationFrame(cam.fpsRaf);
    if (cam.vfc && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(cam.vfc);
    if (cam.recorder && cam.recorder.state === 'recording') cam.recorder.stop();
    if (cam.stream) cam.stream.getTracks().forEach((tr) => tr.stop());
    cam.stream = null;
    if (silent) return;
    video.srcObject = null;
    $('#videoEmpty').hidden = false; $('#videoBadges').hidden = true; wrap.classList.remove('live');
    $('#camBtn').textContent = t('start'); $('#camBtn').classList.remove('on');
    ['#snapBtn', '#mirrorBtn', '#flipBtn', '#gridBtn', '#fsBtn', '#vrecBtn'].forEach((s) => ($(s).disabled = true));
    wrap.style.aspectRatio = '';
  }

  on('#camBtn', 'click', () => (cam.stream ? stopCam() : startCam()));
  on('#videoEmpty', 'click', () => { if (!cam.stream) startCam(); });
  on('#camSelect', 'change', () => { if (cam.stream) startCam(); });
  on('#resSelect', 'change', () => { if (cam.stream) startCam(); });
  on('#mirrorBtn', 'click', () => {
    cam.mirror = !cam.mirror; wrap.classList.toggle('mirror', cam.mirror); $('#mirrorBtn').classList.toggle('active', cam.mirror);
  });
  on('#flipBtn', 'click', async () => {
    const cams = devices.filter((d) => d.kind === 'videoinput');
    if (cams.length > 1) {
      const cur = $('#camSelect').value;
      const idx = cams.findIndex((d) => d.deviceId === cur);
      $('#camSelect').value = cams[(idx + 1) % cams.length].deviceId;
      startCam();
    } else {
      cam.facing = cam.facing === 'user' ? 'environment' : 'user';
      startCam({ useFacing: true });
    }
  });
  on('#fsBtn', 'click', () => {
    const el = wrap;
    if (document.fullscreenElement) return document.exitFullscreen();
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iOS
  });

  const gridC = $('#gridOverlay');
  function drawGrid() {
    if (!gridC) return; gridC.hidden = !cam.grid; if (!cam.grid) return;
    const { w, h, dpr } = fitCanvas(gridC); const g = gridC.getContext('2d');
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1 * dpr;
    for (let i = 1; i < 3; i++) {
      g.beginPath(); g.moveTo((w / 3) * i, 0); g.lineTo((w / 3) * i, h); g.stroke();
      g.beginPath(); g.moveTo(0, (h / 3) * i); g.lineTo(w, (h / 3) * i); g.stroke();
    }
  }
  on('#gridBtn', 'click', () => { cam.grid = !cam.grid; $('#gridBtn').classList.toggle('active', cam.grid); drawGrid(); });
  window.addEventListener('resize', drawGrid);

  on('#snapBtn', 'click', () => {
    if (!video.videoWidth) return;
    const c = document.createElement('canvas'); c.width = video.videoWidth; c.height = video.videoHeight;
    const g = c.getContext('2d');
    if (cam.mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(video, 0, 0);
    const f = $('#flash'); f.classList.add('go'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('go')));
    c.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'mictestplus-' + Date.now() + '.png';
      const img = document.createElement('img'); img.src = url; img.alt = 'snapshot'; a.appendChild(img);
      $('#shots').prepend(a); toast(t('snapSaved')); logEvent('webcam_snapshot');
    }, 'image/png');
  });

  on('#vrecBtn', 'click', () => {
    if (!cam.stream || !window.MediaRecorder) return toast(t('errUnsupported'));
    if (cam.recorder && cam.recorder.state === 'recording') return cam.recorder.stop();
    const mime = pickMime(['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/mp4', 'video/webm']);
    const tracks = [...cam.stream.getVideoTracks()];
    if (mic.stream) tracks.push(...mic.stream.getAudioTracks());
    const rec = new MediaRecorder(new MediaStream(tracks), mime ? { mimeType: mime } : undefined);
    const chunks = []; const btn = $('#vrecBtn'); const label = btn.querySelector('span:last-child');
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let left = 5; label.textContent = t('recording') + left;
    const iv = setInterval(() => { left--; if (left > 0) label.textContent = t('recording') + left; }, 1000);
    const to = setTimeout(() => rec.state === 'recording' && rec.stop(), 5000);
    rec.onstop = () => {
      clearInterval(iv); clearTimeout(to); btn.classList.remove('recording'); label.textContent = t('recVideo');
      const blob = new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' });
      const v = $('#clipVideo'); if (v.src.startsWith('blob:')) URL.revokeObjectURL(v.src); v.src = URL.createObjectURL(blob); v.hidden = false;
    };
    cam.recorder = rec; btn.classList.add('recording'); rec.start();
  });

  /* ---------------- SPEAKERS ---------------- */
  let osc = null, oscGain = null, activeBtn = null, sweepOn = false;
  const freqRange = $('#freqRange');
  function stopTone() {
    if (osc) {
      const ctx = getCtx(); const n = ctx.currentTime;
      oscGain.gain.cancelScheduledValues(n); oscGain.gain.setValueAtTime(oscGain.gain.value, n);
      oscGain.gain.linearRampToValueAtTime(0, n + 0.05);
      const o = osc; setTimeout(() => { try { o.stop(); } catch (e) {} }, 80);
    }
    osc = null; sweepOn = false;
    if (activeBtn) activeBtn.classList.remove('playing'); activeBtn = null;
    $('#sweepBtn').classList.remove('active');
  }
  function playTone(pan, btn, sweep) {
    const ctx = getCtx();
    stopTone();
    osc = ctx.createOscillator(); oscGain = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = Number(freqRange.value);
    let node = osc;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; osc.connect(p); node = p; }
    node.connect(oscGain); oscGain.connect(ctx.destination);
    const n = ctx.currentTime;
    osc.start(n);
    oscGain.gain.setValueAtTime(0, n); oscGain.gain.linearRampToValueAtTime(0.25, n + 0.05);
    if (sweep) {
      osc.frequency.setValueAtTime(40, n); osc.frequency.exponentialRampToValueAtTime(16000, n + 8);
      oscGain.gain.setValueAtTime(0.25, n + 7.9); oscGain.gain.linearRampToValueAtTime(0, n + 8);
      osc.stop(n + 8.05);
    } else {
      oscGain.gain.setValueAtTime(0.25, n + 1.4); oscGain.gain.linearRampToValueAtTime(0, n + 1.5);
      osc.stop(n + 1.55);
    }
    const me = osc;
    activeBtn = btn; if (btn) btn.classList.add('playing');
    osc.onended = () => { if (osc === me) { osc = null; if (activeBtn) activeBtn.classList.remove('playing'); activeBtn = null; $('#sweepBtn').classList.remove('active'); } };
  }
  $$('.spk-btn').forEach((b) => b.addEventListener('click', () => {
    if (activeBtn === b) return stopTone();
    playTone(Number(b.dataset.pan), b, false);
    if (!window.__mtpSpk) { window.__mtpSpk = 1; logEvent('speaker_test'); }
  }));
  on('#sweepBtn', 'click', () => {
    if (sweepOn) return stopTone();
    playTone(0, $('#sweepBtn'), true); sweepOn = true; $('#sweepBtn').classList.add('active');
  });
  if (freqRange) freqRange.addEventListener('input', () => {
    $('#freqVal').textContent = freqRange.value + ' Hz';
    if (osc && !sweepOn) osc.frequency.setValueAtTime(Number(freqRange.value), getCtx().currentTime);
  });
  on('#spkYes', 'click', () => { setStatus('spk', 'working'); toast(t('spkThanks')); });
  on('#spkNo', 'click', () => { setStatus('spk', 'failed'); toast(t('spkSorry')); });

  /* ---------------- DEVICES ---------------- */
  let devices = [];
  async function refreshDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try { devices = await navigator.mediaDevices.enumerateDevices(); } catch (e) { devices = []; }
    fillSelect('#micSelect', 'audioinput', 'defaultMic');
    fillSelect('#camSelect', 'videoinput', 'defaultCam');
    fillSelect('#recMic', 'audioinput', 'defaultMic');
    fillSelect('#dbMic', 'audioinput', 'defaultMic');
    renderDeviceList();
    fillPerms();
  }
  function fillSelect(sel, kind, defKey) {
    const s = $(sel); if (!s) return; const cur = s.value;
    const list = devices.filter((d) => d.kind === kind && d.deviceId);
    s.innerHTML = '';
    if (!list.length || !list.some((d) => d.label)) {
      const o = document.createElement('option'); o.value = ''; o.dataset.i18n = defKey; o.textContent = t(defKey); s.appendChild(o);
      if (!list.some((d) => d.label)) return;
    }
    list.forEach((d, i) => {
      const o = document.createElement('option'); o.value = d.deviceId;
      o.textContent = d.label || (t(kind === 'audioinput' ? 'mic' : 'cam') + ' ' + (i + 1));
      s.appendChild(o);
    });
    if ([...s.options].some((o) => o.value === cur)) s.value = cur;
  }
  function renderDeviceList() {
    const ul = $('#devList'); if (!ul) return;
    ul.innerHTML = '';
    const named = devices.filter((d) => d.label);
    if (!named.length) {
      const li = document.createElement('li'); li.className = 'muted'; li.textContent = t('noDevices'); ul.appendChild(li); return;
    }
    const kinds = { audioinput: t('mic'), videoinput: t('cam'), audiooutput: t('spk') };
    named.forEach((d) => {
      const li = document.createElement('li');
      const k = document.createElement('span'); k.className = 'kind'; k.textContent = kinds[d.kind] || d.kind;
      const n = document.createElement('span'); n.textContent = d.label; n.title = d.label;
      li.append(k, n); ul.appendChild(li);
    });
  }
  on('#refreshDev', 'click', refreshDevices);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', refreshDevices);

  function detect() {
    const ua = navigator.userAgent;
    let b = 'Unknown';
    if (/Edg\//.test(ua)) b = 'Edge'; else if (/OPR\//.test(ua)) b = 'Opera'; else if (/SamsungBrowser/.test(ua)) b = 'Samsung Internet';
    else if (/Firefox|FxiOS/.test(ua)) b = 'Firefox'; else if (/CriOS|Chrome/.test(ua)) b = 'Chrome'; else if (/Safari/.test(ua)) b = 'Safari';
    const m = ua.match(/(Edg|OPR|SamsungBrowser|Firefox|FxiOS|CriOS|Chrome|Version)\/(\d+)/); if (m) b += ' ' + m[2];
    let o = 'Unknown';
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) o = 'iOS / iPadOS';
    else if (/Android/.test(ua)) o = 'Android'; else if (/Windows/.test(ua)) o = 'Windows';
    else if (/Mac OS X/.test(ua)) o = 'macOS'; else if (/CrOS/.test(ua)) o = 'ChromeOS'; else if (/Linux/.test(ua)) o = 'Linux';
    return { b, o };
  }
  function fillInfo() {
    const { b, o } = detect();
    setText('#iBrowser', b); setText('#iOs', o);
    setText('#iSecure', window.isSecureContext ? t('yesW') : t('noW'));
    fillPerms();
  }
  async function fillPerms() {
    for (const [name, sel] of [['microphone', '#iPermMic'], ['camera', '#iPermCam']]) {
      if (!$(sel)) continue;
      try {
        const p = await navigator.permissions.query({ name });
        $(sel).textContent = t(p.state);
        p.onchange = () => { $(sel).textContent = t(p.state); };
      } catch (e) { $(sel).textContent = t('unknown'); }
    }
  }

  /* ---------------- results summary ---------------- */
  const ICO = {};
  ['mic', 'cam', 'spk'].forEach((k) => { const el = document.querySelector('#' + { mic: 'micTitle', cam: 'camTitle', spk: 'spkTitle' }[k] + ' .ico'); if (el) ICO[k] = el.innerHTML; });
  function resultValue(k) {
    const s = status[k];
    if (k === 'mic' && mic.score != null) return mic.score + '/100 · ' + mic.grade;
    if (k === 'cam' && s === 'working' && cam.res) return cam.res + (cam.fps ? ' · ' + cam.fps + ' fps' : '');
    return t(s);
  }
  function renderResults() {
    const grid = $('#resGrid'); if (!grid) return;
    const keys = (PAGE.tools || []).filter((k) => k !== 'rec');
    grid.innerHTML = '';
    keys.forEach((k) => {
      const tile = document.createElement('div');
      const s = status[k];
      tile.className = 'res-tile' + (s === 'working' ? ' ok' : s === 'failed' ? ' bad' : '');
      const i = document.createElement('span'); i.className = 'r-ico'; i.innerHTML = ICO[k] || '';
      const d = document.createElement('div');
      const sm = document.createElement('small'); sm.textContent = t(k);
      const b = document.createElement('b'); b.textContent = resultValue(k); b.title = b.textContent;
      d.append(sm, b); tile.append(i, d); grid.appendChild(tile);
    });
    const any = keys.some((k) => status[k] === 'working' || status[k] === 'failed');
    ['#resCopy', '#resShare', '#resImg'].forEach((s) => { const b = $(s); if (b) b.disabled = !any; });
    const h = $('#resHint'); if (h) h.hidden = any;
  }
  function resultsText() {
    const keys = (PAGE.tools || []).filter((k) => k !== 'rec' && status[k] !== 'notTested');
    return 'MicTest+ · ' + keys.map((k) => t(k) + ': ' + resultValue(k)).join(' · ');
  }
  const shareUrl = () => location.origin + location.pathname;
  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); toast(t('copied')); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast(t('copied')); } catch (x) {} ta.remove(); }
  }
  function resultsImage() {
    const W = 1080, H = 1080, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'); const rtl = document.documentElement.dir === 'rtl';
    try { g.direction = rtl ? 'rtl' : 'ltr'; } catch (e) {}
    const F = (s, w) => (w || 700) + ' ' + s + 'px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#141417'); bg.addColorStop(1, '#0b0b0d');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // logo
    g.fillStyle = '#cdf545'; g.beginPath(); g.roundRect ? g.roundRect(80, 80, 84, 84, 20) : g.rect(80, 80, 84, 84); g.fill();
    g.fillStyle = '#0b0b0d'; [[98, 128, 26], [118, 106, 48], [138, 116, 38]].forEach(([x, y, h]) => g.fillRect(x, y, 12, h));
    g.textAlign = 'left'; g.font = F(46, 800); g.fillStyle = '#f3f3ef'; g.fillText('MicTest', 186, 140);
    const mw = g.measureText('MicTest').width; g.fillStyle = '#cdf545'; g.fillText('+', 186 + mw, 140);
    g.textAlign = 'center';
    g.fillStyle = '#9a9aa3'; g.font = F(40, 700); g.fillText(t('yourResults'), W / 2, 270);
    let y0 = 330;
    if (mic.score != null) {
      const cx = W / 2, cy = 500, r = 150, col = mic.score >= 70 ? '#cdf545' : mic.score >= 50 ? '#ffb020' : '#ff5a4e';
      g.lineWidth = 26; g.strokeStyle = '#26262c'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = col; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * mic.score) / 100); g.stroke();
      g.fillStyle = '#f3f3ef'; g.font = F(120, 800); g.fillText(String(mic.score), cx, cy + 40);
      g.fillStyle = '#9a9aa3'; g.font = F(30, 700); g.fillText(t('micScore') + ' · ' + mic.grade, cx, cy + r + 80);
      y0 = 790;
    }
    const keys = (PAGE.tools || []).filter((k) => k !== 'rec' && !(k === 'mic' && mic.score != null) && status[k] !== 'notTested');
    keys.forEach((k, i) => { g.fillStyle = '#f3f3ef'; g.font = F(38, 700); g.fillText(t(k) + ': ' + resultValue(k), W / 2, y0 + i * 62); });
    g.fillStyle = '#cdf545'; g.font = F(36, 800); g.fillText(t('shareText') + ' mictestplus.com', W / 2, H - 80);
    return c;
  }
  on('#resImg', 'click', () => {
    resultsImage().toBlob(async (blob) => {
      logEvent('results_image');
      const file = new File([blob], 'mictestplus-results.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: t('shareText') + ' ' + shareUrl() }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
  });
  on('#resCopy', 'click', () => { copyText(resultsText() + '\n' + t('shareText') + ' ' + shareUrl()); logEvent('results_copy'); });
  on('#resShare', 'click', async () => {
    const text = resultsText() + '\n' + t('shareText');
    logEvent('results_share');
    if (navigator.share) { try { await navigator.share({ title: 'MicTest+', text, url: shareUrl() }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    copyText(text + ' ' + shareUrl());
  });

  /* ---------------- hero button ---------------- */
  on('#heroStart', 'click', async (e) => {
    const action = e.currentTarget.dataset.action;
    if (action === 'px' && window.__pxStart) return window.__pxStart();
    if (!['kb', 'ms'].includes(action)) getCtx();
    const target = { all: '#mic', mic: '#mic', cam: '#cam', spk: '#speaker', rec: '#recorder', db: '#dbm', kb: '#kbd', ms: '#mouse', px: '#pixel' }[action];
    if ($(target)) $(target).scrollIntoView({ behavior: 'smooth' });
    if ((action === 'all' || action === 'mic') && !mic.stream) await startMic();
    if ((action === 'all' || action === 'cam') && !cam.stream) await startCam();
    if (action === 'db') { const b = $('#dbBtn'); if (b && !b.classList.contains('on')) b.click(); }
    if (action === 'kb' && window.__kbStart) window.__kbStart();
    if (action === 'rec') { const rb = $('#recToggle'); if (rb && !rb.classList.contains('on')) rb.click(); }
    if (action === 'spk') { const btn = $('.spk-btn[data-pan="0"]'); if (btn) btn.click(); }
  });

  /* ---------------- DECIBEL METER ---------------- */
  let dbActive = false;
  if ($('#dbm')) {
    const OFF = 100; // dBFS -> approximate dB SPL for typical phone/laptop mics
    const D = { stream: null, an: null, src: null, raf: 0, lvl: null, min: Infinity, max: -Infinity, e: 0, n: 0, hist: [], lastT: 0, lastH: 0, lastTxt: 0, cal: 0, busy: false };
    try { D.cal = Number(localStorage.getItem('mtp-db-cal')) || 0; } catch (e) {}
    const box = $('#dbm'), btn = $('#dbBtn'), big = $('#dbBig'), lev = $('#dbLevel'), mark = $('#dbMark'), chart = $('#dbChart'), cal = $('#dbCal');
    const calTxt = (v) => (v > 0 ? '+' : '') + v + ' dB';
    cal.value = D.cal; setText('#dbCalVal', calTxt(D.cal));
    cal.addEventListener('input', () => { D.cal = Number(cal.value); setText('#dbCalVal', calTxt(D.cal)); try { localStorage.setItem('mtp-db-cal', D.cal); } catch (e) {} });
    const levelOf = (v) => (v < 40 ? ['lvQuiet', 'ok'] : v < 70 ? ['lvModerate', 'ok'] : v < 85 ? ['lvLoud', 'warn'] : v < 100 ? ['lvVeryLoud', 'bad'] : ['lvDanger', 'bad']);
    function reset() {
      D.min = Infinity; D.max = -Infinity; D.e = 0; D.n = 0; D.hist = [];
      ['#dbMin', '#dbAvg', '#dbMax'].forEach((s) => setText(s, '–'));
      drawChart();
    }
    async function start() {
      if (D.busy) return;
      getCtx();
      if (!hasMedia) return toast(t('errUnsupported'));
      const id = $('#dbMic').value;
      const a = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
      if (id) a.deviceId = { exact: id };
      D.busy = true;
      try { D.stream = await navigator.mediaDevices.getUserMedia({ audio: a }); }
      catch (e) { toast(errMsg(e)); lev.textContent = errMsg(e); lev.className = 'db-level bad'; return; }
      finally { D.busy = false; }
      dbActive = true;
      const ctx = getCtx(); D.src = ctx.createMediaStreamSource(D.stream); D.an = ctx.createAnalyser(); D.an.fftSize = 2048; D.src.connect(D.an);
      D.lvl = null; D.lastT = D.t0 = performance.now();
      box.classList.add('live'); btn.textContent = t('stop'); btn.classList.add('on');
      D.stream.getAudioTracks()[0].addEventListener('ended', stop);
      reset(); loop(); refreshDevices(); logEvent('decibel_meter');
    }
    function stop() {
      cancelAnimationFrame(D.raf);
      try { D.src.disconnect(); } catch (e) {}
      D.an = null;
      if (D.stream) D.stream.getTracks().forEach((tr) => tr.stop());
      D.stream = null; dbActive = false;
      box.classList.remove('live'); btn.textContent = t('start'); btn.classList.remove('on');
    }
    function loop() {
      if (!D.an) return;
      const buf = new Float32Array(D.an.fftSize);
      const step = () => {
        if (!D.an) return;
        D.an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const raw = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-9) + OFF + D.cal;
        const now = performance.now(), dt = now - D.lastT; D.lastT = now;
        D.lvl = D.lvl == null ? raw : D.lvl + (1 - Math.exp(-dt / 125)) * (raw - D.lvl); // "fast" time weighting
        const v = Math.max(0, Math.min(130, D.lvl));
        mark.style.setProperty('--x', Math.max(0, Math.min(100, v - 20)) + '%');
        if (now - D.lastTxt > 150) {
          D.lastTxt = now; big.textContent = Math.round(v);
          const [k, c] = levelOf(v); lev.textContent = t(k); lev.className = 'db-level ' + c;
        }
        if (now - D.lastH > 250 && now - D.t0 > 600) {
          D.lastH = now; D.hist.push(v); if (D.hist.length > 240) D.hist.shift();
          D.min = Math.min(D.min, v); D.max = Math.max(D.max, v); D.e += Math.pow(10, v / 10); D.n++;
          setText('#dbMin', Math.round(D.min)); setText('#dbMax', Math.round(D.max)); setText('#dbAvg', Math.round(10 * Math.log10(D.e / D.n)));
          drawChart();
        }
        D.raf = requestAnimationFrame(step);
      };
      step();
    }
    function drawChart() {
      const { w, h, dpr } = fitCanvas(chart); const g = chart.getContext('2d');
      g.clearRect(0, 0, w, h);
      if (!D.hist.length) return;
      const lo = 20, hi = 120, pad = 30 * dpr, top = 26 * dpr, bot = 10 * dpr;
      const y = (v) => top + (1 - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo)) * (h - top - bot);
      try { g.direction = 'ltr'; } catch (e) {}
      g.font = (11 * dpr) + 'px system-ui, sans-serif'; g.fillStyle = css('--muted'); g.textBaseline = 'middle'; g.textAlign = 'left';
      g.strokeStyle = css('--line'); g.lineWidth = dpr;
      [40, 60, 80, 100].forEach((v) => { g.beginPath(); g.moveTo(pad, y(v)); g.lineTo(w - 8 * dpr, y(v)); g.stroke(); g.fillText(v, 6 * dpr, y(v)); });
      g.setLineDash([5 * dpr, 4 * dpr]); g.strokeStyle = css('--bad'); g.beginPath(); g.moveTo(pad, y(85)); g.lineTo(w - 8 * dpr, y(85)); g.stroke(); g.setLineDash([]);
      const n = 240, xs = (i) => pad + ((w - pad - 8 * dpr) * (n - D.hist.length + i)) / (n - 1);
      const grad = g.createLinearGradient(0, top, 0, h);
      grad.addColorStop(0, css('--brand')); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.beginPath(); D.hist.forEach((v, i) => (i ? g.lineTo(xs(i), y(v)) : g.moveTo(xs(i), y(v))));
      g.lineTo(xs(D.hist.length - 1), h - bot); g.lineTo(xs(0), h - bot); g.closePath();
      g.globalAlpha = 0.28; g.fillStyle = grad; g.fill(); g.globalAlpha = 1;
      g.beginPath(); D.hist.forEach((v, i) => (i ? g.lineTo(xs(i), y(v)) : g.moveTo(xs(i), y(v))));
      g.strokeStyle = css('--brand-text'); g.lineWidth = 2 * dpr; g.lineJoin = 'round'; g.stroke();
    }
    btn.addEventListener('click', () => (D.stream ? stop() : start()));
    on('#dbGo', 'click', () => { if (!D.stream) start(); });
    on('#dbReset', 'click', reset);
    on('#dbMic', 'change', () => { if (D.stream) { stop(); start(); } });
    window.addEventListener('resize', drawChart);
  }

  /* ---------------- VOICE RECORDER ---------------- */
  let recActive = false;
  if ($('#recorder')) {
    const R = { stream: null, rec: null, chunks: [], t0: 0, timer: 0, raf: 0, an: null, src: null, n: 0, mime: '' };
    const btn = $('#recToggle'), label = btn.querySelector('span:last-child'), time = $('#recTime'), fill = $('#recFill'), list = $('#recList');
    const fmt = (ms) => { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
    const kb = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    async function startRec() {
      if (R.busy) return;
      getCtx(); // inside the tap, for iOS
      if (!hasMedia || !window.MediaRecorder) return toast(t('errUnsupported'));
      const id = $('#recMic') ? $('#recMic').value : '';
      R.busy = true;
      try { R.stream = await navigator.mediaDevices.getUserMedia({ audio: id ? { deviceId: { exact: id } } : true }); }
      catch (e) { toast(errMsg(e)); return; }
      finally { R.busy = false; }
      recActive = true;
      refreshDevices();
      R.mime = pickMime(['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']);
      R.rec = new MediaRecorder(R.stream, R.mime ? { mimeType: R.mime } : undefined);
      R.chunks = [];
      R.rec.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
      R.rec.onstop = finish;
      R.rec.start(1000);
      R.t0 = performance.now(); time.textContent = '00:00';
      R.timer = setInterval(() => { time.textContent = fmt(performance.now() - R.t0); }, 250);
      const ctx = getCtx(); R.src = ctx.createMediaStreamSource(R.stream); R.an = ctx.createAnalyser(); R.an.fftSize = 1024; R.src.connect(R.an);
      const buf = new Float32Array(R.an.fftSize);
      const loop = () => {
        if (!R.an) return;
        R.an.getFloatTimeDomainData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const db = 20 * Math.log10(Math.sqrt(s / buf.length) || 1e-8);
        fill.style.setProperty('--lvl', Math.max(0, Math.min(100, ((db + 60) / 60) * 100)).toFixed(1) + '%');
        R.raf = requestAnimationFrame(loop);
      };
      loop();
      btn.classList.add('on'); label.textContent = t('recStop');
    }
    function finish() {
      clearInterval(R.timer); cancelAnimationFrame(R.raf);
      const dur = performance.now() - R.t0;
      try { R.src.disconnect(); } catch (e) {}
      R.an = null;
      if (R.stream) R.stream.getTracks().forEach((tr) => tr.stop());
      R.stream = null; recActive = false;
      fill.style.setProperty('--lvl', '0%');
      btn.classList.remove('on'); label.textContent = t('recStart');
      const type = (R.rec && R.rec.mimeType) || R.mime || 'audio/webm';
      const blob = new Blob(R.chunks, { type });
      if (!blob.size) return;
      const url = URL.createObjectURL(blob);
      R.n++;
      const name = t('recName') + ' ' + R.n;
      const empty = list.querySelector('.rec-empty'); if (empty) empty.remove();
      const li = document.createElement('li'); li.className = 'rec-item';
      const meta = document.createElement('div'); meta.className = 'rec-meta';
      const b = document.createElement('b'); b.textContent = name;
      const info = document.createElement('span'); info.className = 'muted'; info.textContent = fmt(dur) + ' · ' + kb(blob.size);
      meta.append(b, info);
      const audio = document.createElement('audio'); audio.controls = true; audio.src = url; audio.preload = 'metadata';
      const actions = document.createElement('div'); actions.className = 'rec-actions';
      const dl = document.createElement('a'); dl.className = 'btn'; dl.href = url; dl.download = 'mictestplus-' + R.n + '.' + extFor(type); dl.textContent = t('download');
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn btn-bad'; del.textContent = t('recDelete');
      del.addEventListener('click', () => {
        URL.revokeObjectURL(url); li.remove();
        if (!list.children.length) { const e = document.createElement('li'); e.className = 'rec-empty muted'; e.textContent = t('recEmpty'); list.append(e); }
      });
      actions.append(dl, del);
      li.append(meta, audio, actions);
      list.prepend(li);
      logEvent('voice_recording', { seconds: Math.round(dur / 1000) });
    }
    on('#recToggle', 'click', () => { if (R.rec && R.rec.state === 'recording') R.rec.stop(); else startRec(); });
  }

  /* ---------------- KEYBOARD TESTER ---------------- */
  if ($('#kbd')) {
    const board = $('#kbBoard'), focusBox = $('#kbFocus'), trail = $('#kbTrail');
    const keys = {}; $$('#kbBoard .k').forEach((el) => { keys[el.dataset.code] = el; });
    const K = { tested: new Set(), held: new Set(), max: 0, chat: 0, lastDown: {}, armed: false, logged: false };
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    if (isMac) { ['MetaLeft', 'MetaRight'].forEach((c) => { if (keys[c]) keys[c].textContent = '⌘'; }); ['AltLeft', 'AltRight'].forEach((c) => { if (keys[c]) keys[c].textContent = '⌥'; }); }
    if (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches) $('#kbMobile').hidden = false;
    const BLOCK = /^(Tab|Space|Backspace|Enter|Arrow|Page|Home|End|F\d|Quote|Slash|Alt|Meta|ContextMenu|Escape|Numpad)/;
    const arm = (v) => { K.armed = v; focusBox.classList.toggle('armed', v); };
    const stats = () => {
      setText('#kbCount', K.tested.size); setText('#kbHeld', K.held.size); setText('#kbMax', K.max); setText('#kbChat', K.chat);
    };
    const press = (e, down) => {
      const t = e.target;
      if (t && (t.tagName === 'SELECT' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const code = e.code || '';
      const el = keys[code];
      if (down && !K.armed && (code.startsWith('Key') || code.startsWith('Digit') || code === 'Space')) arm(true);
      if (down && K.armed && code === 'Escape' && e.repeat) { arm(false); return; }
      if (K.armed && (BLOCK.test(code) || e.ctrlKey || e.metaKey)) e.preventDefault();
      if (!code) return;
      if (down) {
        if (e.repeat) return;
        if (!K.logged) { K.logged = true; logEvent('keyboard_test'); }
        const now = performance.now();
        if (K.lastDown[code] && now - K.lastDown[code] < 40) { K.chat++; $('#kbTip').hidden = false; if (el) el.classList.add('chat'); }
        K.lastDown[code] = now;
        K.held.add(code); K.max = Math.max(K.max, K.held.size);
        K.tested.add(code);
        focusBox.classList.add('typed');
        if (el) {
          el.classList.add('on', 'done');
          if (e.key && e.key.length === 1 && e.key !== ' ' && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && !code.startsWith('Numpad')) el.textContent = e.key.toUpperCase();
        }
        const name = e.key === ' ' ? 'Space' : e.key === 'Dead' || !e.key ? code : e.key.length === 1 ? e.key.toUpperCase() : e.key;
        setText('#kbLast', name); setText('#kbCode', code);
        const chip = document.createElement('span'); chip.textContent = name; trail.prepend(chip);
        while (trail.children.length > 18) trail.lastChild.remove();
      } else {
        K.held.delete(code);
        if (el) el.classList.remove('on');
        if (code === 'PrintScreen' && !K.tested.has(code)) { K.tested.add(code); if (el) el.classList.add('done'); }
      }
      stats();
    };
    window.addEventListener('keydown', (e) => press(e, true));
    window.addEventListener('keyup', (e) => press(e, false));
    window.addEventListener('blur', () => { K.held.clear(); $$('#kbBoard .k.on').forEach((k) => k.classList.remove('on')); stats(); });
    focusBox.addEventListener('pointerdown', () => { arm(true); focusBox.focus({ preventScroll: true }); });
    document.addEventListener('pointerdown', (e) => { if (!$('#kbd').contains(e.target)) arm(false); });
    on('#kbReset', 'click', () => {
      K.tested.clear(); K.held.clear(); K.max = 0; K.chat = 0; K.lastDown = {};
      $$('#kbBoard .k').forEach((k) => k.classList.remove('on', 'done', 'chat'));
      focusBox.classList.remove('typed'); trail.textContent = ''; setText('#kbLast', '–'); setText('#kbCode', ''); $('#kbTip').hidden = true; stats();
    });
    window.__kbStart = () => { arm(true); focusBox.focus({ preventScroll: true }); };
  }

  /* ---------------- MOUSE TESTER ---------------- */
  if ($('#mouse')) {
    const area = $('#msArea'), rip = $('#msRip');
    const M = { c: [0, 0, 0, 0, 0], up: 0, down: 0, ghost: 0, last: [0, 0, 0, 0, 0], clicks: [], cpsMax: 0, ev: [], hzMax: 0, logged: false, wheelT: 0 };
    const part = (id, cls) => { const el = $('#' + id); if (el) el.classList.add(cls); return el; };
    const flash = (el) => { if (!el) return; el.classList.add('hit'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('hit'), 160); };
    const draw = () => {
      for (let b = 0; b < 5; b++) setText('#msC' + b, M.c[b]);
      setText('#msCU', M.up); setText('#msCD', M.down); setText('#msCG', M.ghost);
      $('#msSG').classList.toggle('bad', M.ghost > 0);
    };
    area.addEventListener('contextmenu', (e) => e.preventDefault());
    area.addEventListener('auxclick', (e) => e.preventDefault());
    area.addEventListener('mouseup', (e) => {
      if (e.button > 0) e.preventDefault();
      const p = $('#msP' + e.button); if (p) p.classList.remove('on');
    });
    area.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const b = e.button; if (b < 0 || b > 4) return;
      if (!M.logged) { M.logged = true; logEvent('mouse_test'); }
      const now = performance.now();
      if (M.last[b] && now - M.last[b] < 80) { M.ghost++; $('#msTip').hidden = false; flash($('#msSG')); }
      M.last[b] = now;
      M.c[b]++; M.clicks.push(now);
      part('msP' + b, 'on'); part('msP' + b, 'done'); $('#msS' + b).classList.add('done'); flash($('#msS' + b));
      area.classList.add('used');
      const r = area.getBoundingClientRect(), d = document.createElement('i');
      d.className = 'b' + b; d.style.left = (e.clientX - r.left) + 'px'; d.style.top = (e.clientY - r.top) + 'px';
      rip.append(d); setTimeout(() => d.remove(), 600);
      draw();
    });
    window.addEventListener('mouseup', () => $$('#msArea .ms-part.on').forEach((p) => p.classList.remove('on')));
    area.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!e.deltaY) return;
      const now = performance.now(); if (now - M.wheelT < 30) return; M.wheelT = now;
      const upDir = e.deltaY < 0; if (upDir) M.up++; else M.down++;
      const id = upDir ? 'msWU' : 'msWD'; part(id, 'done'); flash($('#' + id)); $(upDir ? '#msSU' : '#msSD').classList.add('done'); flash($(upDir ? '#msSU' : '#msSD'));
      part('msP1', 'done'); area.classList.add('used');
      draw();
    }, { passive: false });
    const mv = (e) => {
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const x of (list.length ? list : [e])) M.ev.push(x.timeStamp);
      if (M.ev.length > 400) M.ev.splice(0, M.ev.length - 400);
    };
    if ('onpointerrawupdate' in window) area.addEventListener('pointerrawupdate', (e) => { if (e.pointerType === 'mouse') M.ev.push(e.timeStamp); });
    else area.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mv(e); });
    setInterval(() => {
      const now = performance.now();
      M.clicks = M.clicks.filter((t) => now - t < 1000);
      const cps = M.clicks.length; M.cpsMax = Math.max(M.cpsMax, cps);
      setText('#msCps', cps); setText('#msCpsMax', M.cpsMax);
      const recent = M.ev.filter((t) => now - t < 250);
      if (recent.length >= 12) {
        // only count while the mouse moves continuously: ignore gaps longer than 40 ms
        let span = 0, n = 0;
        for (let i = 1; i < recent.length; i++) { const d = recent[i] - recent[i - 1]; if (d > 0 && d < 40) { span += d; n++; } }
        if (n >= 10 && span > 0) {
          const hz = Math.round((n * 1000) / span);
          setText('#msHz', hz); if (hz > M.hzMax) { M.hzMax = hz; setText('#msHzMax', hz); }
        }
      }
    }, 200);
    on('#msReset', 'click', () => {
      M.c = [0, 0, 0, 0, 0]; M.up = M.down = M.ghost = M.cpsMax = M.hzMax = 0; M.last = [0, 0, 0, 0, 0]; M.clicks = []; M.ev = [];
      $$('#mouse .done').forEach((x) => x.classList.remove('done')); area.classList.remove('used');
      setText('#msHz', '–'); setText('#msHzMax', '–'); $('#msTip').hidden = true; draw();
    });
  }

  /* ---------------- DEAD PIXEL TEST ---------------- */
  if ($('#pixel')) {
    const COLORS = ['#000000', '#ffffff', '#ff0000', '#00ff00', '#0000ff', '#808080'];
    const scr = $('#pxScreen'), help = $('#pxHelp');
    let idx = 0, helpT = 0, curT = 0, open = false;
    const info = () => {
      const d = window.devicePixelRatio || 1;
      setText('#pxRes', Math.round(screen.width * d) + ' × ' + Math.round(screen.height * d));
      setText('#pxView', innerWidth + ' × ' + innerHeight);
      setText('#pxDpr', (Math.round(d * 100) / 100) + '×');
      setText('#pxDepth', (screen.colorDepth || 24) + '-bit');
    };
    info(); window.addEventListener('resize', info);
    const measureHz = () => {
      const ts = []; const step = (t) => { ts.push(t); if (ts.length < 90) requestAnimationFrame(step); else {
        const d = []; for (let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]);
        d.sort((a, b) => a - b); const med = d[d.length >> 1];
        if (med > 0) { const hz = 1000 / med; const std = [24, 30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 160, 165, 170, 180, 200, 240, 280, 360, 480, 500]; const near = std.reduce((a, b) => Math.abs(b - hz) < Math.abs(a - hz) ? b : a); setText('#pxHz', (Math.abs(near - hz) / hz < 0.04 ? near : Math.round(hz)) + ' Hz'); }
      } };
      requestAnimationFrame(step);
    };
    if (document.visibilityState === 'visible') setTimeout(measureHz, 600); else document.addEventListener('visibilitychange', function f() { if (!document.hidden) { document.removeEventListener('visibilitychange', f); setTimeout(measureHz, 600); } });
    const paint = () => { scr.style.background = COLORS[idx]; help.classList.toggle('dark', idx === 1 || idx === 3); };
    const showHelp = () => { help.classList.add('show'); clearTimeout(helpT); helpT = setTimeout(() => help.classList.remove('show'), 2600); };
    const showCursor = () => { scr.classList.remove('nocur'); clearTimeout(curT); curT = setTimeout(() => scr.classList.add('nocur'), 1500); };
    const openScr = (i) => {
      idx = i || 0; scr.hidden = false; open = true; paint(); showHelp(); showCursor();
      document.documentElement.classList.add('px-lock');
      const rf = scr.requestFullscreen || scr.webkitRequestFullscreen;
      if (rf) { try { const p = rf.call(scr); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
      logEvent('pixel_test');
    };
    const closeScr = () => {
      if (!open) return; open = false; scr.hidden = true; document.documentElement.classList.remove('px-lock');
      const fe = document.fullscreenElement || document.webkitFullscreenElement;
      if (fe) { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { try { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
    };
    const next = (d) => { idx = (idx + d + COLORS.length) % COLORS.length; paint(); };
    on('#pxStart', 'click', () => openScr(0));
    $$('.px-sw').forEach((b) => b.addEventListener('click', () => openScr(+b.dataset.i)));
    scr.addEventListener('click', () => next(1));
    scr.addEventListener('contextmenu', (e) => { e.preventDefault(); next(-1); });
    scr.addEventListener('pointermove', showCursor);
    document.addEventListener('keydown', (e) => {
      if (!open) return;
      if (e.key === 'Escape') { closeScr(); return; }
      if (['ArrowRight', 'ArrowDown', ' ', 'Enter', 'PageDown'].includes(e.key)) { e.preventDefault(); next(1); }
      else if (['ArrowLeft', 'ArrowUp', 'Backspace', 'PageUp'].includes(e.key)) { e.preventDefault(); next(-1); }
    });
    const fsChange = () => { if (open && !(document.fullscreenElement || document.webkitFullscreenElement) && scr._wasFs) closeScr(); scr._wasFs = !!(document.fullscreenElement || document.webkitFullscreenElement); };
    document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);
    window.__pxStart = () => openScr(0);

    // stuck pixel fixer: a draggable square of fast random primaries
    const fx = $('#pxFixer'), cv = $('#pxFixCv'), g = cv.getContext('2d');
    let fxRaf = 0;
    const img = g.createImageData(cv.width, cv.height), PR = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [0, 0, 0]];
    const tick = () => {
      const a = img.data;
      for (let i = 0; i < a.length; i += 4) { const c = PR[(Math.random() * 5) | 0]; a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; a[i + 3] = 255; }
      g.putImageData(img, 0, 0); fxRaf = requestAnimationFrame(tick);
    };
    const stopFix = () => { cancelAnimationFrame(fxRaf); fx.hidden = true; };
    on('#pxFixBtn', 'click', () => {
      if (!fx.hidden) return stopFix();
      fx.hidden = false; fx.style.left = Math.max(8, innerWidth / 2 - 60) + 'px'; fx.style.top = Math.max(8, innerHeight / 2 - 60) + 'px';
      cancelAnimationFrame(fxRaf); tick(); logEvent('pixel_fixer');
    });
    on('#pxFixClose', 'click', stopFix);
    let drag = null;
    fx.addEventListener('pointerdown', (e) => { if (e.target.id === 'pxFixClose') return; drag = { x: e.clientX - fx.offsetLeft, y: e.clientY - fx.offsetTop }; fx.setPointerCapture(e.pointerId); e.preventDefault(); });
    fx.addEventListener('pointermove', (e) => {
      if (!drag) return;
      fx.style.left = Math.min(innerWidth - fx.offsetWidth, Math.max(0, e.clientX - drag.x)) + 'px';
      fx.style.top = Math.min(innerHeight - fx.offsetHeight, Math.max(0, e.clientY - drag.y)) + 'px';
    });
    fx.addEventListener('pointerup', () => { drag = null; });
    fx.addEventListener('pointercancel', () => { drag = null; });
  }

  /* ---------------- language hint (no auto-redirect: better for SEO and users) ---------------- */
  (() => {
    if (!PAGE.alts) return;
    let dismissed = null;
    try { dismissed = localStorage.getItem('mtp-lang-hint'); } catch (e) {}
    if (dismissed) return;
    const want = (navigator.languages || [navigator.language || '']).map((l) => String(l).slice(0, 2).toLowerCase()).find((l) => PAGE.alts[l]);
    if (!want || want === PAGE.lang) return;
    const bar = document.createElement('aside');
    bar.className = 'lang-hint';
    bar.setAttribute('aria-label', 'Language');
    bar.setAttribute('lang', want);
    const a = document.createElement('a');
    a.href = PAGE.alts[want]; a.hreflang = want; a.dir = PAGE.names[want] && /^(ar|he)$/.test(want) ? 'rtl' : 'ltr'; a.textContent = PAGE.names[want] + (/^(ar|he)$/.test(want) ? ' ←' : ' →');
    const x = document.createElement('button');
    x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
    const close = () => { bar.remove(); try { localStorage.setItem('mtp-lang-hint', '1'); } catch (e) {} };
    x.addEventListener('click', close); a.addEventListener('click', () => { try { localStorage.setItem('mtp-lang-hint', '1'); } catch (e) {} });
    const wrap = document.createElement('div'); wrap.className = 'wrap lang-hint-inner';
    wrap.append(a, x); bar.append(wrap);
    const header = document.querySelector('.topbar');
    if (header) header.after(bar);
  })();

  // pause camera loops when tab hidden on mobile to save battery
  document.addEventListener('visibilitychange', () => {
    if (!audioCtx) return;
    if (document.hidden) { if (!mic.stream && !osc && !recActive && !dbActive) audioCtx.suspend(); }
    else if ((mic.stream || recActive || dbActive) && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
  });

  setText('#year', new Date().getFullYear());
  renderStatuses();
  renderResults();
  fillInfo();
  refreshDevices();

  $$('ins.adsbygoogle').forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
