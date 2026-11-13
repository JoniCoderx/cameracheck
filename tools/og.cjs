// Renders the per-page social images (1200x630) listed by build.mjs in .og-jobs.json into src/og/<lang>/.
// Usage: node build.mjs && node tools/og.cjs && node build.mjs
// Needs Playwright with Chromium and the @fontsource devDependencies (npm install).
// Only images whose content changed are rendered again (hashes in src/og/hashes.json).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OG = path.join(ROOT, 'src/og');
const HASHES = path.join(OG, 'hashes.json');
const TEMPLATE = 'v4';
const jobs = JSON.parse(fs.readFileSync(path.join(ROOT, '.og-jobs.json'), 'utf8'));
const hashes = fs.existsSync(HASHES) ? JSON.parse(fs.readFileSync(HASHES, 'utf8')) : {};
const logo = fs.readFileSync(path.join(ROOT, 'src/static/favicon.svg'), 'utf8');
const css = ['inter', 'noto-sans-jp', 'noto-sans-hebrew', 'noto-sans-arabic', 'noto-sans-devanagari']
  .flatMap((f) => ['600', '800'].map((w) => 'file://' + path.join(ROOT, 'node_modules/@fontsource', f, w + '.css')));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = (lang) => `'Inter',${lang === 'ja' ? "'Noto Sans JP'," : ''}'Noto Sans Hebrew','Noto Sans Arabic','Noto Sans Devanagari','Noto Sans JP',sans-serif`;

function html(j) {
  const rtl = j.dir === 'rtl', home = !j.icon;
  const bars = [160, 300, 220, 380, 260, 180, 320].map((h) => `<i style="height:${h}px"></i>`).join('');
  const lines = home
    ? j.lines.map((l, i) => i === j.lines.length - 1 ? `<span class="hl">${esc(l)}.</span>` : `${esc(l)}.<br>`).join('')
    : esc(j.lines.join(' '));
  return `<!doctype html><html lang="${j.lang}" dir="${j.dir}"><head><meta charset="utf-8">
${css.map((h) => `<link rel="stylesheet" href="${h}">`).join('')}
<style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0b0b0d;color:#f3f3ef;font-family:${FONT(j.lang)};overflow:hidden;position:relative}
.bars{position:absolute;${rtl ? 'left' : 'right'}:-40px;bottom:-60px;display:flex;gap:34px;align-items:flex-end;opacity:.13}
.bars i{display:block;width:58px;border-radius:29px;background:#CDF545}
.glow{position:absolute;${rtl ? 'left' : 'right'}:40px;top:40px;width:520px;height:520px;border-radius:50%;background:radial-gradient(circle,rgba(205,245,69,.16),rgba(205,245,69,0) 65%)}
.brand{position:absolute;top:64px;${rtl ? 'right' : 'left'}:80px;display:flex;align-items:center;gap:18px;direction:ltr}
.brand .lg{width:64px;height:64px}.brand svg{width:100%;height:100%;display:block}
.brand b{font-family:'Inter',sans-serif;font-size:42px;font-weight:800;letter-spacing:-1.5px}.brand b span{color:#CDF545}
.main{position:absolute;${rtl ? 'right' : 'left'}:80px;top:170px;width:${home ? 1040 : 730}px;height:330px;display:flex;flex-direction:column;justify-content:center}
.kick{display:inline-block;align-self:flex-start;font-size:26px;font-weight:800;color:#0b0b0d;background:#CDF545;border-radius:10px;padding:4px 14px;margin-bottom:22px}
h1{font-weight:800;line-height:${/^(ar|hi)$/.test(j.lang) ? 1.3 : 1.08};word-break:${j.lang === 'ja' ? 'auto-phrase' : 'normal'};letter-spacing:${/^(ja|hi|ar|he)$/.test(j.lang) ? '0' : '-2.5px'};text-wrap:balance}
.hl{background:#CDF545;color:#0b0b0d;padding:0 14px;border-radius:12px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.sub{margin-top:22px;font-size:30px;line-height:1.3;color:#b9b9c0;font-weight:600;text-wrap:balance}
.tile{position:absolute;${rtl ? 'left' : 'right'}:96px;top:205px;width:260px;height:260px;border-radius:64px;background:#CDF545;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 80px rgba(205,245,69,.18)}
.tile svg{width:150px;height:150px;fill:none;stroke:#0b0b0d;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.foot{position:absolute;${rtl ? 'right' : 'left'}:80px;bottom:52px;font-size:27px;color:#9a9aa3;font-weight:600}
.foot b{color:#f3f3ef;font-family:'Inter',sans-serif}
</style></head><body>
<div class="bars">${bars}</div>${home ? '' : '<div class="glow"></div>'}
<div class="brand"><div class="lg">${logo}</div><b>MicTest<span>+</span></b></div>
<div class="main">${j.kicker ? `<span class="kick">${esc(j.kicker)}</span>` : ''}<h1 id="h">${lines}</h1>${j.sub ? `<p class="sub" id="s">${esc(j.sub)}</p>` : ''}</div>
${home ? '' : `<div class="tile"><svg viewBox="0 0 24 24">${j.icon}</svg></div>`}
<div class="foot">${esc(j.foot)} · <b dir="ltr">mictestplus.com</b></div>
</body></html>`;
}

(async () => {
  const only = process.env.OG_ONLY ? new RegExp(process.env.OG_ONLY) : null;
  const todo = jobs.filter((j) => only ? only.test(j.file) : true).filter((j) => {
    const h = crypto.createHash('md5').update(TEMPLATE + JSON.stringify(j)).digest('hex');
    j.hash = h;
    return hashes[j.file] !== h || !fs.existsSync(path.join(OG, j.file));
  });
  console.log(`${todo.length} of ${jobs.length} social images to render`);
  if (!todo.length) return;
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'og-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const j of todo) {
    fs.writeFileSync(path.join(tmp, 'p.html'), html(j));
    await page.goto('file://' + path.join(tmp, 'p.html'));
    await page.evaluate(() => document.fonts.ready);
    // shrink the headline until headline + subtitle fit the text box
    await page.evaluate((home) => {
      const h = document.getElementById('h'), s = document.getElementById('s'), box = document.querySelector('.main');
      let size = home ? 84 : 86;
      const fits = () => box.scrollHeight <= box.clientHeight + 1 && h.scrollWidth <= h.clientWidth + 1;
      h.style.fontSize = size + 'px';
      while (!fits() && size > 40) { size -= 2; h.style.fontSize = size + 'px'; if (s && size < 60) s.style.fontSize = Math.max(22, size * 0.42) + 'px'; }
      if (s && !fits()) s.remove();
    }, !j.icon);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(OG, j.file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    hashes[j.file] = j.hash;
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  // 128-colour palette PNG: about a third of the size, no visible difference on this flat design
  require('child_process').execFileSync('python3', ['-c', `
import sys
from PIL import Image
for f in sys.argv[1:]:
    Image.open(f).convert('RGB').quantize(128, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(f, optimize=True)
`, ...todo.map((j) => path.join(OG, j.file))]);
  fs.writeFileSync(HASHES, JSON.stringify(Object.fromEntries(Object.entries(hashes).sort()), null, 1) + '\n');
  console.log('done');
})();
