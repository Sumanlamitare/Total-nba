// Opens the live site in WebKit (Safari's engine) as an iPhone, taps each tab and reports crashes and
// errors. Each variant turns off a group of visual effects, to find what a crash depends on.
const { webkit, devices } = require('playwright');
const fs = require('fs');
const BASE = (process.argv[2] || 'https://total-nba-ja9d.vercel.app').replace(/\/$/, '');
const OUT = 'webkit-check'; fs.mkdirSync(OUT, { recursive: true });
const VARIANTS = {
  baseline: '',
  noEffects: '*,*:before,*:after{animation:none!important;transition:none!important;mix-blend-mode:normal!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;filter:none!important}',
};
const log = [];
const say = s => { console.log(s); log.push(s); };
(async () => {
  const b = await webkit.launch();
  for (const [name, css] of Object.entries(VARIANTS)) {
    for (const tab of ['SEASON', 'WEEK']) {
      const ctx = await b.newContext({ ...devices['iPhone 13'] });
      const p = await ctx.newPage(); const ev = [];
      let crashed = false;
      p.on('crash', () => { crashed = true; ev.push('CRASH'); });
      p.on('pageerror', e => ev.push('pageerror: ' + e.message));
      p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) ev.push('console: ' + m.text().slice(0, 200)); });
      try {
        await p.goto(BASE + '/', { timeout: 60000 }); await p.waitForTimeout(7000);
        if (css) await p.addStyleTag({ content: css });
        const t0 = Date.now();
        await p.click(`.tabbar button:has-text("${tab}")`, { timeout: 15000 });
        for (let i = 0; i < 12 && !crashed; i++) await p.waitForTimeout(1000);
        const st = crashed ? null : await p.evaluate(() => ({ rows: document.querySelectorAll('.board .row').length, podium: [...document.querySelectorAll('.pod .pn')].map(e => e.textContent),
          label: document.querySelector('.plabel span')?.textContent, imgs: document.querySelectorAll('img').length })).catch(e => 'eval failed ' + e.message);
        if (!crashed) await p.screenshot({ path: `${OUT}/${name}-${tab}.png` }).catch(() => {});
        say(`${name} ${tab}: ${crashed ? 'CRASHED after ' + (Date.now() - t0) + 'ms' : 'ok ' + JSON.stringify(st)} ${ev.join(' | ')}`);
      } catch (e) { say(`${name} ${tab}: FAILED ${e.message.split('\n')[0]} ${crashed ? 'CRASHED' : ''} ${ev.join(' | ')}`); }
      await ctx.close().catch(() => {});
    }
  }
  await b.close();
  fs.writeFileSync(`${OUT}/report.txt`, log.join('\n') + '\n');
})();
