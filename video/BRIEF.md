# Gainsay walkthrough: brief

## Goal
- Kind: judge walkthrough, about 110 s, 16:9, 30 fps, plus a ~30 s 9:16 cut. Captions only (no voice), synthesized sound at -16 LUFS.
- Audience: Telegraph Hackathon S2 judges and builders (Apps and Agents, Web3 and DeFi). Deadline for the entry 2026-12-01 23:59 UTC.
- The one thing to understand: before anyone stakes a bond on a Polymarket resolution, Gainsay buys the final score from specialist providers through Telegraph, rejects answers about the wrong game, settles by arithmetic, and says plainly when it cannot.
- Not for posting: rendered locally and on the testbench VM only. Nothing is uploaded or published.

## Truth sheet (the film may only show what is here)
| Claim / number / screen | Evidence | Status |
|---|---|---|
| Site UI: Check, Watch, How it works tabs; "Sepolia testnet" chip; Playwright captures | https://gainsay.up.railway.app, captured 2026-11-26 (assets/shots, assets/cap-*) | live site |
| Proposer posts a $250 bond (README: $250 to $750) for a reward of $0.80 on the recorded market; a wrong proposal stands unless someone disputes it, and a successful dispute loses the bond | site sheet "Bond $250.00 / Reward $0.80"; README; research/anjoman-app-gainsay.md | live site / repo |
| Recorded check, 1 Nov 2026: Flames vs. Avalanche, proposed Avalanche, verdict Holds, score 2 - 5 Final, NHL official provider 44002, signal 0xfa08b5f9...a0e41, $0.01, "Single source", "Testnet evidence", window closed | the site's default sheet (public/app.js RECORDED); README evidence table; PROJECT_STATE 2026-11-01 | real paid check, Sepolia test USDC, after the window closed |
| Rejected 9 answers as not about this game | same sheet; PROJECT_STATE ("rejected 9 other games on the scoreboard") | real |
| Live-site check 2026-11-05: Timberwolves vs. Rockets O/U 196.5, proposed Over, Holds from SportWire (ESPN) via Telegraph, Timberwolves 117 Rockets 107, $0.01, signal 0x164c2229...a9d67; matches ESPN and Polymarket's settlement; single source; window had already closed | PROJECT_STATE 2026-11-05; research/anjoman-app-gainsay.md | real paid check, testnet. Shown as a typographic card, not a screenshot (no capture exists) |
| Two of the first paid sports answers were about other games (Real Madrid v Barcelona for a Pistons v Knicks question) with every field ok and signal verified; verified proves the record was not altered, not that it answers your question; reported as bounties#177 | PROJECT_STATE 2026-11-01; README; research doc | real |
| Settles winners, totals and spreads by arithmetic; matched 28 of 28 settled markets | README; research doc | repo test result, offline |
| Six verdicts: Holds, Wrong, Settled, Too early, Contested, No independent source; each says whether it is single-source | README, site | repo |
| "Wrong" has only occurred in tests, never live; no check inside an open window yet | README limits | stated on screen |
| Too early: Bears vs. Lions (market 6747201, NFL moneyline) on 2026-11-26 about 09:20 UTC, kickoff 18:00 UTC, "The game has not started", evidence cost $0.00, "Would buy Takar Outcome, ESPN scoreboard (provider 20261117) at $0.01 each" | live Playwright capture, assets/cap-tooearly | live site, nothing bought |
| Not covered: Devin Booker Assists O/U 5.5 (market 7309517): "Final scores cannot settle this market type yet (props, quarters, halves, non-sports)", cost $0.00 | live capture, assets/cap-prop | live site, nothing bought |
| Watch feed on 2026-11-26: "84064 proposals read, 20182 from other platforms refused, 120 shown"; windows, bonds $250, "Not covered" rows | live capture, assets/cap-watch | live site (numbers are the moment of capture) |
| How it works: four steps, "Not covered yet" list | live capture how.png | live site |
| Outside contribution: PR #2 from PugarHuda/bangdrop, NFL and Champions League evidence from Takar Outcome (miner 20261117, another team's miner), merged 2026-11-22, 28/28 tests, deployed 10c0939 | git log of the Gainsay repo; PROJECT_STATE 2026-11-22 | real, public PR |
| Paid checks use a burner wallet with a hard daily budget; Gainsay never proposes, disputes or posts a bond | README, site | stated |
| "No proposer has used Gainsay yet" | README limits | stated on end card |
| Solana tab (live, fetched 2026-11-26 14:11 UTC via /api/solana, page capture 14:29 UTC; repo commit 4d8a107 records it): Jupiter Predict (Polymarket and Kalshi on Solana); the tab lists 18 recorded rows: 15 Polymarket games across NBA, NHL, NFL and UCL (14 Holds, 1 No independent source: Utah vs. Wild, 0 Wrong), 1 Kalshi game that Holds (Toronto at Orlando), 2 Kalshi rows Failed ("did not return an answer. Nothing was charged"). Each row: venue result, verdict, Telegraph signal, on-chain result account(s) matched to the API (45 of 45 accounts match across rows), cost $0.01 test USDC. Suns vs. Rockets row: venue says Rockets, Suns 104 - 116 Rockets, 65 of 65 totals and spreads hold, 2 of 2 accounts match, Telegraph sportwire 0x19f90914...858bb6 | /api/solana JSON (data/solana-record.json), live tab capture (assets/shots/solana-full.png) | live site; evidence paid in Sepolia test USDC; venue results and result accounts are Solana mainnet data |
| Coordinator brief said "15 games, 14 hold, 1 no source, 0 wrong, cost $0.10". The live tab agrees on 14/1/0 for the 15 Polymarket games. It shows 16 paid rows at $0.01 each (= $0.16), not $0.10; the film says $0.01 per game and never states a total | live API | cost total NOT verified at $0.10; film avoids the total |
| No contested case on Solana, none on Polymarket UMA live either | tab and README | stated on screen |
- Must be labelled on screen: testnet (Sepolia test USDC); UMA proposals are real Polygon mainnet data; "single source"; recorded checks ran after their windows closed; Wrong not yet seen live.

## Inputs
- Product: https://gainsay.up.railway.app. Repo: https://github.com/nftkingiii/gainsay. Code folder: Gainsay/.
- Captures (Playwright, free actions only, no paid check was run): stills at DPR 2 in assets/shots; flows at 1280x720 DPR 1.5 in assets/cap-tooearly, cap-prop, cap-watch.
- Look: derived from Gainsay's own UI: ink #1f1b16 ground for the film chrome, the product's paper #f7f4ee and card #fdfbf7 on the real screens, ink-blue accent #245c8a (lifted on dark), verdict green #1d7a46, red #b42318, caution amber #9a5b08; Newsreader for display, IBM Plex Sans for UI, IBM Plex Mono for hashes and labels (the product's own faces; fonts embedded in assets/fonts).
- Music and SFX: synthesized by sfx.mjs. Voice: none (captions).

## Order of work
Everything except the Solana beat is rendered first. The Solana slot (placeholder, red) is held at 98.4-108.0 s. When the tab is live: capture it, replace the slot, render that chunk, concatenate, mix.

## Gates
1. Brief + truth sheet 2. Shot list 3. Stills and contact sheets scored in docs/review_log.md 4. `--verify` deterministic 5. Chunked render and encode 6. After Solana: full mix, check.mjs, loudness, deliver.
