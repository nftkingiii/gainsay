// plan.mjs: fit the film to the measured voice. Reads narration.json + out/vo/durations.json and writes
//   plan.json / plan.js  (per-shot real length and a design-time warp, voice clip starts, vertical segments)
//   out/captions.srt, out/captions-v.srt, out/vo.wav, out/vo-v.wav  (voice tracks on the plan)
// Each narration item has an anchor `at` (design time of the on-screen statement it belongs to). The shot's time is warped so
// that statement starts when its sentence starts. A shot is never shorter than its design length.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const N = JSON.parse(readFileSync('narration.json', 'utf8')), dur = JSON.parse(readFileSync('out/vo/durations.json', 'utf8'));
const LEAD = 0.35, GAP = 0.32, TAIL = 0.7, MIN_SCALE = 0.75, END_HOLD = 1.6;
const VSEG = [['s01', 0, 4.8], ['s03', 0, 14.4], ['s06a', 0, 7.2], ['s12', 2.4, 7.2]];
let t0 = 0; const shots = [], clips = [];
for (const s of N.shots) {
  let prevEnd = -1e9, prevStart = 0, prevAt = 0; const pts = [[0, 0]], local = [];
  s.items.forEach((it, i) => {
    const d = dur[`${s.id}_${i}`];
    let start = i === 0 ? LEAD : Math.max(prevEnd + GAP, prevStart + (it.at - prevAt) * MIN_SCALE);
    if (i === 0 && it.at > 0) start = Math.max(LEAD, it.at * MIN_SCALE);
    local.push({ key: `${s.id}_${i}`, start, end: start + d, text: it.text });
    if (it.at > 0) pts.push([+start.toFixed(3), it.at]);
    prevEnd = start + d; prevStart = start; prevAt = it.at;
  });
  const need = prevEnd + TAIL + (s.id === 's12' ? END_HOLD : 0), real = Math.ceil(Math.max(s.D, need) * 30 - 1e-6) / 30;
  pts.push([+real.toFixed(5), s.D]);
  for (let i = 1; i < pts.length; i++) if (!(pts[i][0] > pts[i - 1][0] && pts[i][1] > pts[i - 1][1])) throw new Error(`non-monotonic warp in ${s.id}: ${JSON.stringify(pts)}`);
  shots.push({ id: s.id, from: +t0.toFixed(5), to: +(t0 + real).toFixed(5), D: s.D, pts });
  for (const c of local) clips.push({ key: c.key, shot: s.id, start: +(t0 + c.start).toFixed(3), end: +(t0 + c.end).toFixed(3), text: c.text });
  t0 += real;
}
const d2r = (sh, d) => { const p = sh.pts; if (d <= 0) return d; for (let i = 1; i < p.length; i++) if (d <= p[i][1]) return p[i - 1][0] + (d - p[i - 1][1]) * (p[i][0] - p[i - 1][0]) / (p[i][1] - p[i - 1][1]); return p[p.length - 1][0] + (d - p[p.length - 1][1]); };
const vsegs = []; let off = 0, vclips = [];
for (const [id, a, b] of VSEG) {
  const sh = shots.find(x => x.id === id), ra = d2r(sh, a), rb = d2r(sh, b);
  vsegs.push({ id, a, b, ra: +ra.toFixed(3), rb: +rb.toFixed(3), off: +off.toFixed(3) });
  for (const c of clips.filter(c => c.shot === id)) { const rs = c.start - sh.from; if (rs >= ra - 0.01 && rs < rb - 0.05) vclips.push({ ...c, start: +(off + rs - ra).toFixed(3), end: +(off + c.end - sh.from - ra).toFixed(3) }); }
  off += rb - ra;
}
const plan = { voice: N.voice, speed: N.speed, total: +t0.toFixed(5), shots, clips, vseg: vsegs, vtotal: +off.toFixed(3), vclips };
writeFileSync('plan.json', JSON.stringify(plan, null, 1)); writeFileSync('plan.js', 'window.PLAN = ' + JSON.stringify(plan) + ';\n');
const ts = x => { const h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = Math.floor(x % 60), ms = Math.round((x % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; };
const srt = list => list.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text.replace(/U S D C/g, 'USDC').replace(/N F L/g, 'NFL').replace(/A P I/g, 'API')}\n`).join('\n');
mkdirSync('out', { recursive: true }); writeFileSync('out/captions.srt', srt(clips)); writeFileSync('out/captions-v.srt', srt(vclips));
function track(list, total, out) {
  const args = ['-y', '-loglevel', 'error']; list.forEach(c => args.push('-i', `out/vo/${c.key}.wav`));
  const f = list.map((c, i) => `[${i}:a]aformat=sample_rates=48000:channel_layouts=mono,adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}[a${i}]`).join(';') + ';' + list.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${list.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(2)},atrim=0:${total.toFixed(2)}[o]`;
  args.push('-filter_complex', f, '-map', '[o]', '-ac', '1', out);
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' }); if (r.status) throw new Error('ffmpeg vo failed');
}
track(clips, t0, 'out/vo.wav'); track(vclips, off, 'out/vo-v.wav');
console.log('16:9 total', plan.total.toFixed(1), 's; vertical', plan.vtotal.toFixed(1), 's;', clips.length, 'clips');
console.log(shots.map(s => `${s.id} ${s.from.toFixed(1)}-${s.to.toFixed(1)} (D ${s.D}, x${((s.to - s.from) / s.D).toFixed(2)})`).join('\n'));
