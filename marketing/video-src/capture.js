// Captures each tool card from the real site in a "live" state, phone size, for the promo video.
const { chromium, devices } = require('playwright');
const OUT = process.argv[2], L = process.argv[3] ? '/' + process.argv[3] : '';
const B = 'http://localhost:8300' + L;
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, permissions: ['microphone', 'camera'], colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    window.__pad = { id: 'Xbox Wireless Controller', index: 0, connected: true, mapping: 'standard', axes: [0.55, -0.35, -0.2, 0.4], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: [0, 3, 5, 7, 12].includes(i), value: i === 7 ? 0.7 : i === 6 ? 0.3 : [0, 3, 5, 12].includes(i) ? 1 : 0 })), vibrationActuator: { playEffect: () => Promise.resolve() } };
    navigator.getGamepads = () => [window.__pad];
    // voice-like test signal for the mic meter
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => {
      if (c && c.audio && !c.video) {
        const ac = new AudioContext(); const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 160;
        const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
        const g = ac.createGain(); g.gain.value = 0.5; const l = ac.createOscillator(); l.frequency.value = 3; const lg = ac.createGain(); lg.gain.value = 0.45;
        l.connect(lg); lg.connect(g.gain); o.connect(f); f.connect(g); const d = ac.createMediaStreamDestination(); g.connect(d); o.start(); l.start();
        return d.stream;
      }
      return orig(c);
    };
  });
  const p = await ctx.newPage();
  const shot = async (sel, name) => { const el = await p.$(sel); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await el.screenshot({ path: `${OUT}/${name}.png` }); };
  const go = async (u) => { await p.goto(B + u, { waitUntil: 'networkidle' }); await p.addStyleTag({ content: 'body > header, .lang-hint, .toast { display: none !important; } *{caret-color:transparent}' }); await p.waitForTimeout(400); };
  // hero of home
  await p.goto(B + '/', { waitUntil: 'networkidle' }); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/home.png` });
  // mic live
  await go('/mic-test/'); await p.click('#heroStart'); await p.waitForTimeout(1500); await p.waitForFunction(() => parseFloat(document.querySelector('#dbRead')?.textContent || '-99') > -30, null, { timeout: 8000 }).catch(() => {}); await p.evaluate(() => { const sel = document.querySelector('#mic select'); if (sel) { sel.innerHTML = '<option>' + (document.documentElement.lang === 'he' ? 'מיקרופון USB' : 'USB Microphone') + '</option>'; } document.querySelectorAll('#mic dd').forEach(d => { if (/MediaStream/.test(d.textContent)) d.textContent = 'USB Microphone'; }); }); await p.waitForTimeout(1200); await shot('#mic .card', 'mic');
  // webcam live
  await go('/webcam-test/'); await p.click('#heroStart'); await p.waitForTimeout(2500); await shot('#cam .card', 'cam');
  // speakers
  await go('/speaker-test/'); await shot('#speaker .card', 'spk');
  // keyboard
  await go('/keyboard-test/'); await p.click('#kbFocus');
  for (const k of 'MICTEST'.split('')) await p.keyboard.press('Key' + k);
  await p.keyboard.down('ShiftLeft'); await p.keyboard.down('KeyA'); await p.waitForTimeout(100); await shot('#kbd .card', 'kbd'); await p.keyboard.up('KeyA'); await p.keyboard.up('ShiftLeft');
  // mouse
  await go('/mouse-test/'); await p.$eval('#msArea', e => e.scrollIntoView({ block: 'center' }));
  await p.evaluate(async () => { const a = document.querySelector('#msArea'); const r = a.getBoundingClientRect(); const seq = [0,0,2,0,1,0,2,0,3,0,0,4,0,2];
    for (const [i, bt] of seq.entries()) { const o = { bubbles: true, cancelable: true, button: bt, clientX: r.left + 60 + i * 17, clientY: r.top + 70 + (i % 4) * 30 }; a.dispatchEvent(new MouseEvent('mousedown', o)); await new Promise(z => setTimeout(z, 60)); a.dispatchEvent(new MouseEvent('mouseup', o)); await new Promise(z => setTimeout(z, 70)); }
    for (let i = 0; i < 5; i++) { a.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: i % 2 ? 100 : -100 })); await new Promise(z => setTimeout(z, 60)); }
    a.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: r.left + 150, clientY: r.top + 120 })); });
  await shot('#mouse .card', 'mouse'); await p.mouse.up();
  // pixel
  await go('/dead-pixel-test/'); await p.waitForTimeout(1500); await shot('#pixel .card', 'pixel');
  // gamepad
  await go('/gamepad-test/'); await p.evaluate(() => window.dispatchEvent(new Event('gamepadconnected'))); await p.waitForTimeout(1600); await shot('#gpad .card', 'pad');
  // typing
  await go('/typing-test/'); await p.click('#tyIn'); { const w = await p.$$eval('#tyWords .tw', s => s.slice(0, 9).map(x => x.textContent)); for (let i = 0; i < 8; i++) { await p.keyboard.type(w[i], { delay: 140 }); await p.keyboard.press('Space'); } await p.keyboard.type(w[8].slice(0, 2)); } await p.waitForTimeout(300); await shot('#typing .card', 'typing');
  // cps
  await go('/cps-test/'); await p.$eval('#cpsArea', e => e.scrollIntoView({ block: 'center' })); await p.evaluate(async () => { const a = document.querySelector('#cpsArea'); const r = a.getBoundingClientRect(); for (let i = 0; i < 23; i++) { a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: r.left + 40 + (i * 37) % (r.width - 80), clientY: r.top + 40 + (i * 53) % (r.height - 80) })); await new Promise((z) => setTimeout(z, 115)); } }); await p.waitForTimeout(150); await shot('#cpst .card', 'cps');
  // reaction (green state)
  await go('/reaction-time-test/'); await p.$eval('#rtArea', e => e.scrollIntoView({ block: 'center' }));
  { const hit = () => p.$eval('#rtArea', e => e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    for (let i = 0; i < 3; i++) { await hit(); await p.waitForFunction(() => document.querySelector('#rtArea').dataset.state === 'go'); await p.waitForTimeout(170 + i * 20); await hit(); }
    await hit(); await p.waitForFunction(() => document.querySelector('#rtArea').dataset.state === 'go'); }
  await shot('#react .card', 'react');
  // refresh
  await go('/refresh-rate-test/'); await p.waitForTimeout(2500); await shot('#hzt .card', 'hz');
  // hearing
  await go('/hearing-test/'); await p.click('#hrGo'); await p.waitForTimeout(6000); await shot('#hearing .card', 'hear'); await p.click('#hrGo');
  // water
  await go('/water-eject/'); await p.click('#weGo'); await p.waitForTimeout(9000); await shot('#water .card', 'water');
  await b.close();
})();
