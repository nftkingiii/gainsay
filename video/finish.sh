#!/bin/bash
# finish.sh: mix voice + ducked SFX at -16 LUFS, add soft subtitles, measure loudness. Runs for both aspects.
cd "$(dirname "$0")"
node mix.mjs --video=out/silent-169.mp4 --sfx=out/sfx.wav --sfx-vol=0.7 --voice=out/vo.wav --lufs=-16 --out=out/final-nosub.mp4 || exit 1
ffmpeg -y -loglevel error -i out/final-nosub.mp4 -i out/captions.srt -map 0:v -map 0:a -map 1:0 -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart out/final.mp4
node mix.mjs --video=out/silent-v.mp4 --sfx=out/sfx-v.wav --sfx-vol=0.7 --voice=out/vo-v.wav --lufs=-16 --out=out/final-vertical-nosub.mp4 || exit 1
ffmpeg -y -loglevel error -i out/final-vertical-nosub.mp4 -i out/captions-v.srt -map 0:v -map 0:a -map 1:0 -c:v copy -c:a copy -c:s mov_text -metadata:s:s:0 language=eng -movflags +faststart out/final-vertical.mp4
for f in final final-vertical; do echo "== $f"; ffprobe -v error -show_entries format=duration -of csv=p=0 out/$f.mp4; ffmpeg -nostats -i out/$f.mp4 -map 0:a -af ebur128=peak=true -f null - 2>&1 | tail -12 | grep -E "I:|Peak:|LRA:"; done
echo FINISH-DONE
