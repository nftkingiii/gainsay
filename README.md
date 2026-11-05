# Gainsay

Independent evidence on a Polymarket resolution before anyone posts a bond. Gainsay reads resolution proposals from UMA's oracle on Polygon, buys the final score through [Telegraph](https://anjoman.ai/docs), rejects answers about the wrong game, and settles winners, totals and spreads by arithmetic. Every verdict carries the Telegraph receipts it was built on.

**Who it is for:** proposers, who post a $250 to $750 bond on each market they resolve for a reward of under a dollar to a few dollars, and lose the bond if a dispute succeeds. Holders of a position can use the same check during the challenge window.

## What a check returns

| Verdict | Meaning |
|---|---|
| Holds | The final score supports the proposed outcome |
| Wrong | The final score contradicts it |
| Settled | No proposal yet; the score decides the market this way |
| Too early | The game hasn't started or hasn't finished |
| Contested | A push, a draw, or independent sources that disagree |
| No independent source | No answer was about this game, or no proven provider covers the league |

Each verdict says whether it rests on a single source.

## Evidence so far (Ethereum Sepolia testnet, test USDC)

Live checks on real Polymarket proposals, 2026-11-01. Each bought the official NHL scoreboard through Telegraph for $0.01, picked the right game out of 10, and matched Polymarket's final result:

| Market | Proposed | Verdict | Telegraph signal |
|---|---|---|---|
| Flames vs. Avalanche | Avalanche | Holds | `0xfa08b5f9…a0e41` |
| Flames vs. Avalanche: O/U 7.5 | Under | Holds | `0x7e70712…7d4164` |
| Spread: Avalanche (-1.5) | Avalanche | Holds | `0x37d1f683…f2ab1` |

Look any signal up at `https://devnode.telegraphprotocol.com/engine/v1/signal/<hash>`.

Why the relevance check exists: on the same day, two of the first paid sports answers were about other games (Real Madrid v Barcelona, Thunder v Rockets) with every field marked `ok` and the signal `verified: true`. A verified receipt proves the record wasn't altered, not that the answer is about your game.

## How it works

1. **Read the proposal.** UMA's managed oracle `0x2c03…58b1` on Polygon. Each request is mapped to its Polymarket market by requester: `keccak256(ancillary)` equals gamma `questionID`, a JSON `integration_id` equals the gamma `id`, or for neg-risk markets `keccak256(ancillary)` equals `negRiskRequestID`. Requests from other platforms on the same oracle are refused.
2. **Buy the score.** Providers are called with their own parameters. Sources that only repeat a prediction market's own answer are excluded, and two wrappers of one feed count as one source.
3. **Reject the wrong game.** The teams must match and the kickoff must be within three hours of the market's.
4. **Settle by arithmetic.** Proposed value 1 means the first listed outcome wins. This matched 28 of 28 settled markets.

## Run it

Requires Node 22+.

```bash
npm install
npm test        # 23 tests, using recorded real Telegraph responses
npm start       # http://localhost:8090, paid checks off
```

| Variable | Default | Purpose |
|---|---|---|
| `GAINSAY_EVM_PRIVATE_KEY` | unset | Burner wallet that pays Telegraph. Without it, checks show what they would buy |
| `GAINSAY_DAILY_BUDGET_USD` | `0` | Hard daily cap on evidence spend |
| `GAINSAY_AUTO_CHECK` | `false` | Check covered proposals in the feed automatically |
| `POLYGON_WS_URL` | publicnode | Live proposal stream |
| `POLYGON_RPC_URL` | drpc | Two-hour backfill |

Command-line tools: `npm run scan 2` lists recent settleable proposals for free. `npm run check <marketId> <0|1> --pay` checks one market and spends test USDC.

## Limits

- Coverage is game-level only: winners, full-game totals and spreads. NHL and MLB use the official feeds, and NBA uses an ESPN-based provider, all proven through paid Telegraph calls. La Liga and EPL are routed to the same ESPN-based provider but haven't been tested through Telegraph yet. Player props, quarters and halves need box scores that no Telegraph provider serves yet.
- Most leagues have one proven source today.
- The checks above ran after their windows closed. A check inside an open window, and a live `Wrong` verdict, haven't happened yet.
- Gainsay never proposes, disputes or posts a bond.
- Proposer demand is a hypothesis; no proposer has used Gainsay yet.
