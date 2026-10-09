// Live-site check (run in GitHub Actions): API responses, layout overlap check at several sizes, a real graphic.
// Usage: node tools/site-check.cjs https://your-site.vercel.app   (writes into site-check/)
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2].replace(/\/$/, '');
const OUT = 'site-check';
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = [[360, 640], [390, 844], [768, 1024], [1440, 900]];
const CHECK=(scope)=>{
  const root=document.querySelector(scope);if(!root)return['no '+scope];
  const vw=innerWidth,vh=innerHeight,out=[];
  const vis=e=>{const s=getComputedStyle(e);if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0)return false;
    for(let p=e;p;p=p.parentElement){const ps=getComputedStyle(p);if(+ps.opacity===0)return false}
    const r=e.getBoundingClientRect();return r.width>1&&r.height>1&&r.right>0&&r.bottom>0&&r.left<vw&&r.top<vh};
  const inClosedSheet=e=>!!e.closest('.cm:not(.open)');
  const all=[...root.querySelectorAll('*')].filter(e=>!inClosedSheet(e));
  const leaves=all.filter(e=>{if(e.matches('img,svg,input,.dot'))return true;if(e.closest('svg'))return false;
    return [...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())}).filter(vis);
  // only the slide nearest the centre of the gallery counts (others are scrolled aside on purpose)
  const pan=document.querySelector('#panel'),pc=pan&&pan.getBoundingClientRect();
  const cur=pan&&[...pan.children].sort((a,b)=>{const c=x=>Math.abs(x.getBoundingClientRect().left+x.getBoundingClientRect().width/2-pc.left-pc.width/2);return c(a)-c(b)})[0];
  const L=leaves.filter(e=>!e.closest('.slide')||e.closest('.slide')===cur);
  const name=e=>(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:e.tagName)+'"'+(e.textContent||'').trim().slice(0,18)+'"';
  // clip to scroll containers: a leaf scrolled out of view is not an overlap
  const clipR=e=>{let r=e.getBoundingClientRect();r={l:r.left,t:r.top,r:r.right,b:r.bottom};
    for(let p=e.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(/(auto|scroll|hidden)/.test(s.overflow+s.overflowX+s.overflowY)){const q=p.getBoundingClientRect();r={l:Math.max(r.l,q.left),t:Math.max(r.t,q.top),r:Math.min(r.r,q.right),b:Math.min(r.b,q.bottom)}}}
    return r};
  const R=L.map(e=>({e,r:clipR(e)})).filter(x=>x.r.r-x.r.l>1&&x.r.b-x.r.t>1);
  for(let i=0;i<R.length;i++)for(let j=i+1;j<R.length;j++){const a=R[i],b=R[j];
    if(a.e.contains(b.e)||b.e.contains(a.e))continue;
    if(a.e.closest('.frame')&&b.e.closest('.frame'))continue;
    // the pinned header and the tab bar sit over scrolled content on purpose
    if(!!a.e.closest('.tabbar,.sticky')!==!!b.e.closest('.tabbar,.sticky'))continue;
    const ix=Math.min(a.r.r,b.r.r)-Math.max(a.r.l,b.r.l),iy=Math.min(a.r.b,b.r.b)-Math.max(a.r.t,b.r.t);
    if(ix>1&&iy>1)out.push('OVERLAP '+name(a.e)+' x '+name(b.e)+` (${ix|0}x${iy|0})`)}
  for(const e of L){if(e.matches('img,svg,input,.dot'))continue;const s=getComputedStyle(e);
    const ell=s.textOverflow==='ellipsis'||e.closest('.per .lbl,#note');
    if(!ell&&(e.scrollWidth>e.clientWidth+2&&e.clientWidth>0)&&s.overflowX!=='visible')out.push('CLIPPED '+name(e));
    const r=e.getBoundingClientRect();if(!e.closest('#panel')&&(r.right>vw+1||r.left<-1))out.push('OFFSCREEN '+name(e))}
  // the graphic preview must be fully visible: rendered image box inside its frame, ratio kept
  const gi=document.querySelector('.gview img');
  if(gi&&root.contains(gi)){const f=gi.parentElement.getBoundingClientRect(),r=gi.getBoundingClientRect(),ar=gi.naturalWidth/gi.naturalHeight;
    const shown=Math.min(r.width/gi.naturalWidth,r.height/gi.naturalHeight),dw=gi.naturalWidth*shown,dh=gi.naturalHeight*shown;
    if(r.top<f.top-1||r.bottom>f.bottom+1||r.left<f.left-1||r.right>f.right+1)out.push('GRAPHIC CROPPED by frame');
    if(f.bottom>vh+1||f.top<-1)out.push('GRAPHIC FRAME off-screen '+(f.top|0)+'..'+(f.bottom|0));}
  // report (not fail) when the current card needs scrolling
  const sc=cur&&cur.querySelector('.sc');if(sc&&sc.scrollHeight>sc.clientHeight+2)out.push('NOTE card scrolls '+(sc.scrollHeight-sc.clientHeight)+'px');
  return out};

(async () => {
  const report = [];
  for (const p of ['/api/meta', '/api/day?date=2026-03-01&stat=pts&n=all', '/api/season?season=2025-26&stat=pts', '/api/top?mode=season&season=2025-26&stat=fg2m']) {
    try { const r = await fetch(BASE + p); const t = await r.text(); let extra = '';
      try { const j = JSON.parse(t); if (j.lines) { const v = j.lines.map(l => l.pts); extra = `\n  -> ${j.lines.length} players, sorted desc: ${v.every((x, i) => !i || v[i - 1] >= x)}, first ${v.slice(0, 3)}, last ${v.slice(-3)}`; } } catch {}
      report.push(`API ${p} ${r.status}${extra}\n${t.slice(0, 600)}\n`); }
    catch (e) { report.push(`API ${p} ERROR ${e.message}`); }
  }
  const b = await chromium.launch();
  for (const [w, h] of VIEWS) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    try {
      await p.goto(BASE + '/'); await p.waitForTimeout(7000);
      const res = {};
      const tab = async m => { const t = p.locator(`.tabbar button:has-text("${m}")`); if (await t.isVisible()) await t.click(); else await p.click(`.seg button:has-text("${m}")`); };
      for (const mode of ['DAY', 'SEASON', 'WEEK']) {
        await tab(mode); await p.waitForTimeout(4000);
        res[mode] = await p.evaluate(CHECK, '#app');
        await p.screenshot({ path: `${OUT}/${w}-${mode}.png` });
      }
      await tab('SEASON'); await p.waitForTimeout(3000);
      res.seasonRows = [String(await p.locator('.board .row').count()) + ' rows rendered of ' + (await p.textContent('.headline p'))];
      await p.click('.acts .icon.hot'); await p.waitForSelector('.gview img', { timeout: 60000 }); await p.waitForTimeout(1200);
      res.graphic = await p.evaluate(CHECK, '.scrim');
      await p.screenshot({ path: `${OUT}/${w}-graphic.png` });
      if (w === 1440) { const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.gactions .btn >> nth=0')]); await dl.saveAs(`${OUT}/graphic.png`); }
      // player page from the first card, then player search
      await p.keyboard.press('Escape'); await p.waitForTimeout(800);
      await p.click('.board .row >> nth=0'); await p.waitForSelector('.card-body', { timeout: 20000 }); await p.waitForTimeout(1500);
      res.card = await p.evaluate(CHECK, '.scrim');
      await p.screenshot({ path: `${OUT}/${w}-card.png` });
      await p.click('.card-acts .btn.ghost >> nth=0'); await p.waitForSelector('.psheet .pp-hd', { timeout: 60000 }); await p.waitForTimeout(1500);
      res.player = await p.evaluate(CHECK, '.scrim');
      await p.screenshot({ path: `${OUT}/${w}-player.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(800);
      await p.click('.acts .icon >> nth=0'); await p.waitForTimeout(700); await p.keyboard.type('lebron'); await p.waitForTimeout(4000);
      res.searchHits = [String(await p.locator('.sr-row').count())];
      await p.screenshot({ path: `${OUT}/${w}-search.png` });
      await p.keyboard.press('Escape'); await p.waitForTimeout(600);
      report.push(`${w}x${h}: ` + JSON.stringify(res) + (errs.length ? ' ERRORS ' + errs.join(' | ') : ''));
    } catch (e) { report.push(`${w}x${h}: FAILED ${e.message} ${errs.join(' | ')}`); await p.screenshot({ path: `${OUT}/${w}-failed.png` }).catch(() => {}); }
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(`${OUT}/report.txt`, report.join('\n'));
  console.log(report.join('\n'));
})();
