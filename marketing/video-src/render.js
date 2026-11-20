const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const V = __dirname, lang = process.argv[2] || 'en', out = process.argv[3], from = +(process.argv[4] || 0), to = +(process.argv[5] || 33), stills = process.argv[6];
const FPS = 30;
let html = fs.readFileSync(path.join(V, 'promo.html'), 'utf8');
html = html.replace('__ICONS__', fs.readFileSync(path.join(V, 'icons.json'), 'utf8')).replace('__STR__', fs.readFileSync(path.join(V, 'strings.json'), 'utf8')).replace('__LOGO__', JSON.stringify(fs.readFileSync(path.join(V, 'logo.svg'), 'utf8')));
fs.writeFileSync(path.join(V, 'built.html'), html);
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('file://' + path.join(V, 'built.html') + '?lang=' + lang + (lang === 'he' ? '&shots=_he' : ''));
  await p.evaluate(() => window.ready); await p.waitForTimeout(300);
  if (stills) { // a few stills only
    for (const t of stills.split(',').map(Number)) { await p.evaluate((t) => window.render(t), t); await p.screenshot({ path: `${out}_${t}.png` }); }
    console.log('stills', errs); await b.close(); return;
  }
  const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n0 = Math.round(from * FPS), n1 = Math.round(to * FPS);
  for (let n = n0; n < n1; n++) {
    await p.evaluate((t) => window.render(t), n / FPS);
    const buf = await p.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (n % 150 === 0) console.log('frame', n);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  console.log('done', errs.length ? errs : 'no errors'); await b.close();
})();
