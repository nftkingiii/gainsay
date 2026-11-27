// Builds cues.json (16:9) and cues-v.json (9:16) from shot-local cue times. Cue time = visual contact - 0.03 s.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
const PLAN = existsSync('plan.json') ? JSON.parse(readFileSync('plan.json', 'utf8')) : null;
const d2r = (id, d) => { const sh = PLAN.shots.find(x => x.id === id), p = sh.pts; if (d <= 0) return sh.from + d; for (let i = 1; i < p.length; i++) if (d <= p[i][1]) return sh.from + p[i - 1][0] + (d - p[i - 1][1]) * (p[i][0] - p[i - 1][0]) / (p[i][1] - p[i - 1][1]); return sh.from + p[p.length - 1][0]; };
const FROM = { s01: 0, s02: 7.2, s03: 14.4, s04: 31.2, s05: 38.4, s06a: 50.4, s06b: 57.6, s07: 64.8, s08: 69.6, s09: 79.2, s10: 86.4, sol: 96.0, s12: 110.4 };
const c = (t, type, vol = .4, pitch = 1) => ({ t, type, vol, pitch });
const typing = (t0, n, step = .14) => Array.from({ length: n }, (_, i) => c(t0 + i * step, 'type', .22, .9 + (i % 4) * .1));
const sh = {
  s01: [c(-.03, 'thump', .55), c(.47, 'tick', .3), c(2.37, 'whoosh', .25), c(2.87, 'tick', .3), c(4.77, 'whoosh', .25), c(5.27, 'error', .3)],
  s02: [c(-.03, 'thump', .6), c(.07, 'pop', .35), c(2.37, 'whoosh', .25), c(4.77, 'whoosh', .25), c(5.17, 'click', .3)],
  s03: [c(-.03, 'swish', .35), c(2.37, 'whoosh', .22), c(2.67, 'chime', .4), c(4.77, 'whoosh', .22), c(5.07, 'tick', .3), c(7.17, 'whoosh', .22), c(7.47, 'tick', .25, 1), c(7.67, 'tick', .25, 1.1), c(7.97, 'tick', .25, 1.2), c(8.27, 'tick', .25, 1.3),
    c(9.57, 'whoosh', .22), c(9.87, 'click', .35), c(10.37, 'sparkle', .25), c(12.0, 'whoosh', .22), c(12.27, 'tick', .3, .8), c(12.57, 'tick', .3, .8), c(14.37, 'whoosh', .2)],
  s04: [c(-.03, 'swish', .35), c(.07, 'tick', .25), c(.27, 'chime', .4), c(.77, 'tick', .25), c(1.27, 'tick', .22), c(1.57, 'tick', .22), c(1.87, 'tick', .22), c(2.87, 'tick', .25), c(3.57, 'tick', .3, .8)],
  s05: [c(-.03, 'thump', .5), c(.97, 'error', .3), c(1.47, 'tick', .3), c(4.77, 'swish', .35), c(4.87, 'tick', .25), c(5.27, 'tick', .25), c(6.07, 'tick', .22), c(6.47, 'tick', .22), c(7.27, 'error', .4), c(8.17, 'tick', .25)],
  s06a: [c(-.03, 'swish', .35), ...typing(.66, 7), c(2.53, 'click', .4), c(3.1, 'pop', .35), c(3.47, 'tick', .3), c(4.77, 'tick', .3)],
  s06b: [c(-.03, 'swish', .35), ...typing(.66, 7), c(2.5, 'click', .4), c(4.25, 'pop', .35), c(4.57, 'tick', .3, .85)],
  s07: [c(-.03, 'thump', .5), ...[0, 1, 2, 3, 4, 5].map(i => c(.07 + i * .28, 'tick', .26, 1 + i * .05)), c(2.57, 'error', .25)],
  s08: [c(-.03, 'swish', .35), c(.56, 'click', .4), c(1.77, 'pop', .3), c(4.77, 'tick', .3)],
  s09: [c(-.03, 'swish', .35), c(.77, 'tick', .3), c(1.97, 'tick', .3, 1.05), c(3.17, 'tick', .3, 1.1), c(4.37, 'tick', .3, 1.15), c(5.97, 'whoosh', .2)],
  s10: [c(-.03, 'thump', .5), c(.17, 'tick', .22), c(.57, 'tick', .22), c(1.17, 'tick', .22), c(2.37, 'whoosh', .25), c(3.37, 'tick', .3), c(4.77, 'swish', .3)],
  sol: [c(-.03, 'swish', .4), c(.97, 'click', .35), c(1.4, 'pop', .3), c(2.77, 'tick', .3), c(3.17, 'tick', .3, 1.1), c(5.07, 'tick', .3), c(5.47, 'tick', .3, 1.1), c(7.47, 'tick', .3), c(7.87, 'chime', .35), c(9.57, 'whoosh', .25), c(12.0, 'tick', .25, .8)],
  s12: [c(-.03, 'thump', .55), c(.47, 'success', .4), c(.87, 'tick', .25), c(1.37, 'tick', .25), c(2.37, 'sparkle', .25)],
};
const bars = [];
const flat = Object.entries(sh).flatMap(([k, a]) => a.map(x => ({ ...x, t: +(PLAN ? d2r(k, x.t) : FROM[k] + x.t).toFixed(3) })));
const all = [...flat, ...bars].filter(x => x.t >= 0).sort((a, b) => a.t - b.t);
writeFileSync('cues.json', JSON.stringify(all, null, 1));
const VSEG = [['s01', 0, 4.8], ['s03', 0, 14.4], ['s06a', 0, 7.2], ['s12', 2.4, 7.2]];
let off = 0; const v = [];
for (const [id, f, to] of VSEG) {
  const ra = PLAN ? d2r(id, f) : f, rb = PLAN ? d2r(id, to) : to;
  for (const x of sh[id]) { const r = PLAN ? d2r(id, x.t) : x.t; if (r >= ra - .05 && r < rb) v.push({ ...x, t: +(off + r - ra).toFixed(3) }); }
  off += rb - ra;
}
writeFileSync('cues-v.json', JSON.stringify(v.filter(x => x.t >= 0).sort((a, b) => a.t - b.t), null, 1));
console.log(all.length, v.length, 'cues; vertical dur', off.toFixed(1));
