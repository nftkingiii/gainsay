import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'msedge' }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await p.goto('https://gainsay.up.railway.app/#solana', { waitUntil: 'networkidle' });
await p.waitForFunction(() => document.querySelectorAll('#sol-recorded .sol-row').length > 2, null, { timeout: 90000 });
const rows = await p.$$eval('#sol-recorded .sol-row', els => els.map(e => { const r = e.getBoundingClientRect(); return [e.querySelector('.sol-title').textContent, Math.round(r.top + scrollY), Math.round(r.height)]; }));
console.log(JSON.stringify(rows));
const f = await p.$$eval('#sol-recorded .sol-row', els => els.slice(0, 2).map(e => [...e.querySelectorAll('*')].filter(x => x.children.length === 0).map(x => { const r = x.getBoundingClientRect(); return [x.textContent.slice(0, 30), Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; })));
console.log(JSON.stringify(f));
await b.close();
