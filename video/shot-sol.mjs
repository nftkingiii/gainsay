import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge' }); const c = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const p = await c.newPage(); await p.goto('https://gainsay.up.railway.app/#solana', { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelectorAll('#sol-recorded .sol-row').length > 2, null, { timeout: 90000 }); await p.waitForTimeout(800);
await p.screenshot({ path: 'assets/shots/solana2.png' }); await p.screenshot({ path: 'assets/shots/solana-full.png', fullPage: true }); console.log(await p.locator('#sol-meta').innerText(), new Date().toISOString()); await b.close();
