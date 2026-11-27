// Real screenshots of the live site at DPR 2 (so camera zooms stay crisp). Free actions only: no paid check is run.
import { chromium } from 'playwright';
const URL = 'https://gainsay.up.railway.app';
const launch = async () => { for (const c of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) { try { return await chromium.launch(c); } catch {} } throw new Error('no browser'); };
const b = await launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const out = n => `assets/shots/${n}.png`;
await p.goto(URL, { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
await p.screenshot({ path: out('check-landing') });
await p.locator('.sheet').screenshot({ path: out('sheet-recorded') });
await p.locator('summary').first().click(); await p.waitForTimeout(300);
await p.locator('.sheet').screenshot({ path: out('sheet-recorded-open') });
await p.screenshot({ path: out('check-landing-open') });
// too early: Bears vs. Lions kickoff is in the future, so nothing is bought
for (const [id, name] of [['6747201', 'result-tooearly'], ['7309517', 'result-prop']]) {
  await p.fill('#market', id); await p.click('#check-button');
  await p.waitForFunction(() => document.querySelector('#slot-label')?.textContent === 'Your check' && !document.querySelector('.loading'), null, { timeout: 60000 });
  await p.waitForTimeout(600);
  await p.screenshot({ path: out(name + '-page') });
  await p.locator('.sheet').screenshot({ path: out(name) });
  console.log(name, (await p.locator('.sheet').innerText()).replace(/\n+/g, ' | '));
}
await p.click('#tab-watch'); await p.waitForFunction(() => document.querySelectorAll('#feed li').length > 2 && !/Loading/.test(document.querySelector('#feed-meta').textContent), null, { timeout: 120000 }); await p.waitForTimeout(800);
await p.screenshot({ path: out('watch') });
console.log(await p.locator('#feed-meta').innerText());
await p.click('#tab-how'); await p.waitForTimeout(600); await p.screenshot({ path: out('how') });
await b.close();
