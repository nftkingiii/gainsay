const SIGNAL_URL = "https://devnode.telegraphprotocol.com/engine/v1/signal/";
const POLYGON_TX = "https://polygonscan.com/tx/";

const WORDS = {
  holds: "Holds",
  wrong: "Wrong",
  settled: "Settled",
  too_early: "Too early",
  contested: "Contested",
  no_independent_source: "No independent source",
  unsupported: "Not covered",
  no_provider: "No provider",
  not_started: "Too early",
  paused: "Not checked",
  budget_spent: "Budget spent",
  failed: "Failed",
};
const STRONG = new Set(["holds", "wrong", "settled", "too_early", "contested"]);

/** A real check made on 1 Nov 2026 through Telegraph, shown until you run your own. */
const RECORDED = {
  market: { id: "5285957", question: "Flames vs. Avalanche", outcomes: ["Flames", "Avalanche"], bond: "250", reward: "0.8", kind: "moneyline", league: "nhl" },
  proposal: { label: "Avalanche", value: 0, closesAt: 0, tx: null },
  status: "checked",
  note: "The final score supports this proposal",
  verdict: {
    verdict: "holds",
    expected: 0,
    singleSource: true,
    costUsd: 0.01,
    accepted: [
      { source: "nhl-official", minerId: "44002", away: "Flames", home: "Avalanche", awayScore: 2, homeScore: 5, finished: true, signalHash: "0xfa08b5f9c7d38bb28b6e3d5b3111ea8f10ba62fed07c8dba08e48759b44a0e41" },
    ],
    rejected: Array.from({ length: 9 }, () => ({ reason: "answer is about another game on the same scoreboard" })),
  },
  plan: [],
};

const SOURCE = { "nhl-official": "NHL official", "mlb-official": "MLB official", espn: "SportWire (ESPN)" };

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "");
const usd = (value) => (value === null || value === undefined || value === "" || Number.isNaN(Number(value)) ? "—" : `$${Number(value).toFixed(2)}`);

function windowLeft(ms) {
  if (!ms) return "closed";
  const m = Math.round((ms - Date.now()) / 60000);
  if (m <= 0) return "closed";
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/* Tabs */
const tabs = [...document.querySelectorAll('[role="tab"]')];
function select(tab) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !on;
  }
  history.replaceState(null, "", `#${tab.id.slice(4)}`);
  if (tab.id === "tab-watch") loadFeed();
}
tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => select(tab));
  tab.addEventListener("keydown", (e) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const next = tabs[(i + step + tabs.length) % tabs.length];
    next.focus();
    select(next);
  });
});
const start = tabs.find((t) => t.id === `tab-${location.hash.slice(1)}`);
if (start) select(start);

/* Status */
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    $("paid-note").textContent = s.paidChecks
      ? "A check may buy evidence on Telegraph with test USDC. Results are cached and shared."
      : "Paid checks are off on this deployment, so a check shows what it would buy without buying it.";
  })
  .catch(() => {});

/* Check */
const button = $("check-button");

async function runCheck(market) {
  button.disabled = true;
  button.textContent = "Checking";
  $("slot-label").textContent = "Your check";
  $("result").innerHTML = `<div class="sheet"><p class="loading">Reading the market and buying evidence. This can take up to a minute.</p></div>`;
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ market }),
    });
    const body = await res.json();
    if (res.status === 300) return renderChoices(body.choices);
    if (!res.ok) throw new Error(body.error || "The check failed");
    renderSheet(body);
  } catch (error) {
    $("result").innerHTML = `<article class="sheet"><div class="sheet-top"><p class="verdict-word v-quiet">Couldn't check</p><p class="note">${esc(error.message)}</p></div></article>`;
  } finally {
    button.disabled = false;
    button.textContent = "Check";
  }
}

$("check-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const market = $("market").value.trim();
  if (market) runCheck(market);
});

function renderChoices(choices) {
  $("result").innerHTML = `<article class="sheet"><div class="sheet-top"><p class="note">That event has several markets. Pick one</p></div>
    <ul class="choices">${choices.map((c) => `<li><button type="button" data-id="${esc(c.id)}">${esc(c.question)}</button></li>`).join("")}</ul></article>`;
  for (const b of $("result").querySelectorAll("[data-id]")) {
    b.addEventListener("click", () => {
      $("market").value = b.dataset.id;
      runCheck(b.dataset.id);
    });
  }
}

function renderSheet(r) {
  const v = r.verdict;
  const key = r.status === "checked" && v ? v.verdict : r.status;
  const tone = STRONG.has(key) ? `v-${key}` : "v-quiet";
  const supports = v && v.expected !== null && v.expected !== undefined ? (v.expected === 1 ? r.market.outcomes[0] : r.market.outcomes[1]) : null;
  const game = v?.accepted?.[0];

  const meta = [];
  if (r.market.league) meta.push(`${esc(r.market.league.toUpperCase())} ${esc(r.market.kind)}`);
  if (v?.accepted?.length) meta.push(v.singleSource ? `<span class="warn">Single source</span>` : "Independent sources agree");
  meta.push("Testnet evidence");

  const scoreline = game
    ? `<div class="scoreline">
        <span class="team">${esc(game.away)}</span>
        <span class="score">${esc(game.awayScore)} – ${esc(game.homeScore)}<small>${game.finished ? "Final" : "In progress"}</small></span>
        <span class="team home">${esc(game.home)}</span>
      </div>`
    : "";

  const facts = [
    ["Proposed", r.proposal ? esc(r.proposal.label) : "None seen"],
    ["Score supports", supports ? esc(supports) : "—"],
    ["Window", r.proposal ? windowLeft(r.proposal.closesAt) : "—"],
    ["Bond", usd(r.market.bond)],
    ["Reward", usd(r.market.reward)],
    ["Evidence cost", usd(v ? v.costUsd : 0)],
  ];

  const receipts = (v?.accepted ?? [])
    .map(
      (e) => `<div class="receipt"><span>${esc(SOURCE[e.source] ?? e.source)}, provider ${esc(e.minerId)}</span>
        <a class="hash" href="${SIGNAL_URL}${esc(e.signalHash)}" target="_blank" rel="noopener">${short(e.signalHash)}</a></div>`,
    )
    .join("");

  const rejected = v?.rejected?.length
    ? `<details><summary>${v.rejected.length} answer${v.rejected.length > 1 ? "s" : ""} rejected as not about this game</summary><ul>${[...new Set(v.rejected.map((x) => x.reason))]
        .slice(0, 8)
        .map((reason) => `<li>${esc(reason)}</li>`)
        .join("")}</ul></details>`
    : "";

  const plan =
    r.plan?.length && !v?.accepted?.length
      ? `<p class="plan">Would buy ${r.plan.map((p) => `${esc(p.label)} (provider ${esc(p.minerId)})`).join(" and ")} at $0.01 each</p>`
      : "";

  $("result").innerHTML = `<article class="sheet">
    <div class="sheet-top">
      <p class="market-q">${esc(r.market.question)}</p>
      <p class="verdict-word ${tone}">${esc(WORDS[key] ?? key)}</p>
      <p class="note">${esc(r.note)}</p>
      <div class="meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
    </div>
    ${scoreline}
    <dl class="facts">${facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("")}</dl>
    ${receipts || rejected ? `<div class="receipts"><h3>Telegraph receipts</h3>${receipts}${rejected}</div>` : ""}
    ${plan}
    ${r.proposal?.tx ? `<p class="plan"><a href="${POLYGON_TX}${esc(r.proposal.tx)}" target="_blank" rel="noopener">Proposal on Polygon</a></p>` : ""}
  </article>`;
}

renderSheet(RECORDED);

/* Watch */
async function loadFeed() {
  try {
    const { counts, entries: all } = await (await fetch("/api/feed")).json();
    const entries = $("covered-only").checked ? all.filter((e) => e.coverage === "covered") : all;
    $("feed-meta").textContent = `${counts.seen} proposals read · ${counts.notPolymarket} from other platforms refused · ${entries.length} shown`;
    $("feed").innerHTML = entries.length
      ? entries
          .map((e) => {
            const left = windowLeft(e.closesAt);
            const minutes = (e.closesAt - Date.now()) / 60000;
            const leftClass = left === "closed" ? "closed" : minutes < 20 ? "closing" : "";
            const coverage = e.verdict
              ? `<span class="cov on">${esc(WORDS[e.verdict])}</span>`
              : e.coverage === "covered"
                ? `<span class="cov on">Covered</span>`
                : `<span class="cov">${e.coverage === "no_provider" ? "No provider" : "Not covered"}</span>`;
            return `<li><button type="button" data-id="${esc(e.marketId)}">
              <span class="left ${leftClass}">${left}</span>
              <span class="cell">${esc(e.question)}</span>
              <span class="cell muted proposed">${esc(e.proposed)}</span>
              <span class="num muted bond">${usd(e.bond)}</span>
              ${coverage}</button></li>`;
          })
          .join("")
      : `<li class="empty">${$("covered-only").checked ? "No settleable markets in the window right now. NHL, NBA, MLB and top football games arrive after they finish" : "Waiting for proposals. They arrive in bursts after games finish"}</li>`;
    for (const b of $("feed").querySelectorAll("[data-id]")) {
      b.addEventListener("click", () => {
        $("market").value = b.dataset.id;
        select($("tab-check"));
        runCheck(b.dataset.id);
      });
    }
  } catch {
    $("feed-meta").textContent = "The feed is unavailable right now";
  }
}
$("covered-only").addEventListener("change", loadFeed);
setInterval(() => {
  if (!$("panel-watch").hidden) loadFeed();
}, 20000);
