# Review log

Scores 1-10: hook / phone readability / motion / variety / composition / sound sync / polish. Truthfulness is pass/fail.

## Round 1 (1.6 s contact sheet of the first full build, 72 frames)
Worst 3: (1) flow highlights misplaced: the screencast frames are 1280x720 (CSS px), not 1920x1080, so every box was 1.5x off; (2) s01 camera cut the Reward cell; (3) Solana beat was a red placeholder.
Fixes: flow frames drawn at an explicit 1920x1080, highlight coordinates re-checked on stills; cell cameras narrowed; Solana beat rebuilt from the live tab.
Scores: hook 7, readability 6, motion 7, variety 8, composition 7, polish 6.

## Round 2 (stills at 24 times, 16:9, after the Solana tab went live)
Worst 3: (1) Solana flow was too soft to read and the tab had no recorded games when first captured; replaced by a DPR 2 full-page capture of the tab with its 18 recorded rows, read by the camera (DOM row positions used for the highlights); (2) Solana beat 2 camera clipped the Holds word (widened); (3) end of beat stills showed highlights in the right places.
Scores: hook 8, readability 8, motion 8, variety 8, composition 8, polish 8.

## Round 3 (narration fitted: plan.mjs warps each shot to its sentences; verify at 11 hand-off times: deterministic)
Total length 131.4 s at ~150 words a minute (223 words). Contact sheet of the encoded master (every 3 s) and phone sheet of the 9:16 cut read.
Known and accepted: brief motion-blur ghosting at the fastest camera moves (s02 push, s06b result zoom, Solana pan), visible only in single frames; flow shots are 1280x720 upscaled (soft when zoomed); the 9:16 cut leaves out the Solana beat; right panel of s10 bottom is empty by design.
Scores: hook 8, readability 8 (16:9; 9:16 shows panels as context, captions carry it), motion 8, variety 8, composition 8, sound sync 7 (voice starts on its statement by construction; SFX cues were placed on design time and warped with the shot; NOT listened to, metered only), polish 8.
Truthfulness: pass. Every number traced to BRIEF.md. Coordinator's "$0.10 for 15 games" is not on screen or in the audio: the live tab shows $0.01 per row. The Solana narration says fourteen of fifteen Polymarket games hold, one has no independent source, none wrong, which matches the tab.

## Encoded master
final.mp4: 1920x1080, 30 fps, 131.43 s, integrated loudness -16.0 LUFS, true peak -1.5 dBTP (ebur128). final-vertical.mp4: 1080x1920, 31.93 s, -16.2 LUFS, -1.5 dBTP. Soft subtitle track (mov_text) plus captions.srt / captions-v.srt.
