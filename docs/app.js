(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);
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
  function setStatus(which, s) { status[which] = s; renderStatuses(); }
  function renderStatuses() {
    [['mic', '#stMic'], ['cam', '#stCam'], ['spk', '#stSpk']].forEach(([k, sel]) => {
      const el = $(sel); if (!el) return; const s = status[k];
      el.classList.remove('ok', 'bad', 'wait');
      if (s === 'working') el.classList.add('ok');
      if (s === 'failed') el.classList.add('bad');
      if (s === 'testing') el.classList.add('wait');
      el.querySelector('b').textContent = t(s);
    });
  }
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
      mic.heard = false;
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

  on('#micBtn', 'click', () => (mic.stream ? stopMic() : startMic()));
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
      const a = $('#recAudio'); a.src = url; a.hidden = false; a.play().catch(() => {});
      const dl = $('#recDl'); dl.href = url; dl.download = 'mictestplus-recording.' + extFor(blob.type); dl.hidden = false;
    };
    mic.recorder = rec; btn.classList.add('recording'); rec.start();
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
      $('#videoEmpty').hidden = true; $('#videoBadges').hidden = false;
      $('#camBtn').textContent = t('stop'); $('#camBtn').classList.add('on');
      ['#snapBtn', '#mirrorBtn', '#flipBtn', '#gridBtn', '#fsBtn', '#vrecBtn'].forEach((s) => ($(s).disabled = false));
      const track = stream.getVideoTracks()[0];
      const st = track.getSettings ? track.getSettings() : {};
      if (st.facingMode) cam.facing = st.facingMode;
      cam.mirror = cam.facing !== 'environment';
      wrap.classList.toggle('mirror', cam.mirror);
      $('#mirrorBtn').classList.toggle('active', cam.mirror);
      $('#cDev').textContent = track.label || t('unknown'); $('#cDev').title = track.label || '';
      track.addEventListener('ended', () => stopCam());
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
      $('#bFps').textContent = txt;
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
    $('#videoEmpty').hidden = false; $('#videoBadges').hidden = true;
    $('#camBtn').textContent = t('start'); $('#camBtn').classList.remove('on');
    ['#snapBtn', '#mirrorBtn', '#flipBtn', '#gridBtn', '#fsBtn', '#vrecBtn'].forEach((s) => ($(s).disabled = true));
    wrap.style.aspectRatio = '';
  }

  on('#camBtn', 'click', () => (cam.stream ? stopCam() : startCam()));
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
      $('#shots').prepend(a); toast(t('snapSaved'));
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
      const v = $('#clipVideo'); v.src = URL.createObjectURL(blob); v.hidden = false;
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

  /* ---------------- hero button ---------------- */
  on('#heroStart', 'click', async (e) => {
    getCtx();
    const action = e.currentTarget.dataset.action;
    const target = { all: '#mic', mic: '#mic', cam: '#cam', spk: '#speaker' }[action];
    if ($(target)) $(target).scrollIntoView({ behavior: 'smooth' });
    if ((action === 'all' || action === 'mic') && !mic.stream) await startMic();
    if ((action === 'all' || action === 'cam') && !cam.stream) await startCam();
    if (action === 'spk') { const btn = $('.spk-btn[data-pan="0"]'); if (btn) btn.click(); }
  });

  // pause camera loops when tab hidden on mobile to save battery
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && audioCtx && !mic.stream && !osc) audioCtx.suspend();
  });

  setText('#year', new Date().getFullYear());
  renderStatuses();
  fillInfo();
  refreshDevices();

  $$('ins.adsbygoogle').forEach(() => { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} });

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
