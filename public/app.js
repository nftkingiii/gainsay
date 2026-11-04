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
  paused: "Paused",
  budget_spent: "Budget spent",
  failed: "Failed",
};

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (hash) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "");

function minutesLeft(ms) {
  const m = Math.round((ms - Date.now()) / 60000);
  if (m <= 0) return "closed";
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
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
      ? `Each check may buy evidence on Telegraph (Ethereum Sepolia testnet, test USDC). Results are cached and shared.`
      : `Paid checks are paused on this deployment, so a check shows what would be bought instead of buying it.`;
  })
  .catch(() => {});

/* Check */
const form = $("check-form");
const button = $("check-button");

async function runCheck(market) {
  button.disabled = true;
  button.textContent = "Checking…";
  $("result").innerHTML = `<div class="card"><p class="note">Reading the market and buying evidence. This can take up to a minute.</p></div>`;
  try {
    const res = await fetch("/api/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ market }),
    });
    const body = await res.json();
    if (res.status === 300) return renderChoices(body.choices);
    if (!res.ok) throw new Error(body.error || "The check failed.");
    renderResult(body);
  } catch (error) {
    $("result").innerHTML = `<div class="card"><p class="verdict-word v-failed">Couldn't check</p><p class="note">${esc(error.message)}</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Check";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const market = $("market").value.trim();
  if (market) runCheck(market);
});

function renderChoices(choices) {
  $("result").innerHTML = `<div class="card"><p class="question">That event has several markets. Pick one.</p>
    <ul class="choices">${choices.map((c) => `<li><button type="button" data-id="${esc(c.id)}">${esc(c.question)}</button></li>`).join("")}</ul></div>`;
  for (const b of $("result").querySelectorAll("[data-id]")) {
    b.addEventListener("click", () => {
      $("market").value = b.dataset.id;
      runCheck(b.dataset.id);
    });
  }
}

function renderResult(r) {
  const v = r.verdict;
  const key = r.status === "checked" && v ? v.verdict : r.status === "not_started" ? "too_early" : r.status;
  const supports = v && v.expected !== null ? (v.expected === 1 ? r.market.outcomes[0] : r.market.outcomes[1]) : null;

  const chips = [];
  if (v && v.accepted.length) chips.push(v.singleSource ? `<span class="chip warn">Single source</span>` : `<span class="chip">Independent sources agree</span>`);
  if (r.market.league) chips.push(`<span class="chip">${esc(r.market.league.toUpperCase())} · ${esc(r.market.kind)}</span>`);
  chips.push(`<span class="chip">Testnet evidence</span>`);

  const facts = [
    ["Proposed", r.proposal ? esc(r.proposal.label) : "No live proposal seen"],
    ["Score supports", supports ? esc(supports) : "—"],
    ["Window", r.proposal ? minutesLeft(r.proposal.closesAt) : "—"],
    ["Bond / reward", r.market.bond ? `$${esc(r.market.bond)} / $${esc(r.market.reward ?? "?")}` : "—"],
    ["Evidence cost", v ? `$${v.costUsd.toFixed(2)}` : "—"],
  ];

  const rows = (v?.accepted ?? [])
    .map(
      (e) => `<tr><td>${esc(e.source)}</td><td>${esc(e.away)} ${esc(e.awayScore)} at ${esc(e.home)} ${esc(e.homeScore)}</td>
      <td>${e.finished ? "Final" : "In progress"}</td><td><a class="hash" href="${SIGNAL_URL}${esc(e.signalHash)}" target="_blank" rel="noopener">${short(e.signalHash)}</a></td></tr>`,
    )
    .join("");

  const rejected = v?.rejected?.length
    ? `<details><summary>${v.rejected.length} answer${v.rejected.length > 1 ? "s" : ""} rejected as not about this game</summary><ul>${v.rejected
        .slice(0, 12)
        .map((x) => `<li>${esc(x.reason)}</li>`)
        .join("")}</ul></details>`
    : "";

  const plan = r.plan?.length && !v?.accepted?.length
    ? `<p class="note">Would buy: ${r.plan.map((p) => `${esc(p.label)} (provider ${esc(p.minerId)}) at $0.01`).join(", ")}.</p>`
    : "";

  $("result").innerHTML = `<article class="card">
    <p class="question">${esc(r.market.question)}</p>
    <div class="verdict"><span class="verdict-word v-${esc(key)}">${esc(WORDS[key] ?? key)}</span></div>
    <p class="note">${esc(r.note)}</p>
    <div class="chips">${chips.join("")}</div>
    <dl class="facts">${facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join("")}</dl>
    ${rows ? `<table class="evidence"><thead><tr><th>Source</th><th>Game</th><th>Status</th><th>Telegraph signal</th></tr></thead><tbody>${rows}</tbody></table>` : ""}
    ${rejected}${plan}
    ${r.proposal ? `<p class="note"><a href="${POLYGON_TX}${esc(r.proposal.tx)}" target="_blank" rel="noopener">Proposal on Polygon</a></p>` : ""}
  </article>`;
}

/* Watch */
const STATUS = {
  covered: "Covered",
  unsupported: "Not covered",
  no_provider: "No provider",
};

async function loadFeed() {
  try {
    const { counts, entries } = await (await fetch("/api/feed")).json();
    $("feed-meta").textContent = `${counts.seen} proposals read since start · ${counts.notPolymarket} from other platforms refused · ${entries.length} Polymarket markets shown`;
    $("feed").innerHTML = entries.length
      ? entries
          .map((e) => {
            const status = e.verdict ? `<span class="status v-${esc(e.verdict)}">${esc(WORDS[e.verdict])}</span>` : `<span class="status v-${e.coverage === "covered" ? "settled" : "none"}">${STATUS[e.coverage]}</span>`;
            const left = minutesLeft(e.closesAt);
            const closing = left !== "closed" && (e.closesAt - Date.now()) / 60000 < 20;
            return `<li><button type="button" data-id="${esc(e.marketId)}">
              <span class="left${closing ? " closing" : ""}">${left}</span>
              <span class="q">${esc(e.question)}<small>Proposed ${esc(e.proposed)}${e.bond ? ` · bond $${esc(e.bond)}` : ""}</small></span>
              ${status}</button></li>`;
          })
          .join("")
      : `<li class="empty">Waiting for proposals. They arrive in bursts after games finish.</li>`;
    for (const b of $("feed").querySelectorAll("[data-id]")) {
      b.addEventListener("click", () => {
        $("market").value = b.dataset.id;
        select($("tab-check"));
        runCheck(b.dataset.id);
      });
    }
  } catch {
    $("feed-meta").textContent = "The feed is unavailable right now.";
  }
}
setInterval(() => {
  if (!$("panel-watch").hidden) loadFeed();
}, 20000);
