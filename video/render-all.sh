#!/bin/bash
# render-all.sh <tag> <size or "-"> : render the whole film in 10 s chunks (frames -> mp4 -> delete frames), then concatenate to out/silent-<tag>.mp4
# Safe for the shared testbench: 2 workers, deletes frames after each chunk, stops if free disk drops under 1.2 GB.
cd "$(dirname "$0")"; TAG=$1; SIZE=$2; SZ=""; [ "$SIZE" != "-" ] && SZ="--size=$SIZE"
DUR=$(node -e "const p=require('./plan.json');console.log($( [ "$TAG" = v ] && echo 'p.vtotal' || echo 'p.total'))")
mkdir -p out/chunks-$TAG; : > out/chunks-$TAG/list.txt
N=$(node -e "console.log(Math.ceil($DUR/10))")
for k in $(seq 0 $((N-1))); do
  A=$((k*10)); B=$(node -e "console.log(Math.min($A+10,$DUR))")
  AV=$(df --output=avail -B1M / | tail -1); if [ "$AV" -lt 1200 ]; then echo "DISK LOW ($AV MB), stopping" ; exit 3; fi
  if [ ! -s out/chunks-$TAG/c$k.mp4 ]; then
    rm -rf out/ck-$TAG
    node render.mjs --frames=$A:$B --dir=out/ck-$TAG --workers=2 --sub=3 $SZ 2>&1 | tail -1
    node render.mjs --encode --dir=out/ck-$TAG --out=out/chunks-$TAG/c$k.mp4 2>&1 | tail -1
    rm -rf out/ck-$TAG
  fi
  echo "file 'c$k.mp4'" >> out/chunks-$TAG/list.txt
  echo "chunk $k/$N done $(date +%T)"
done
ffmpeg -y -loglevel error -f concat -safe 0 -i out/chunks-$TAG/list.txt -c copy out/silent-$TAG.mp4 && echo "RENDER-DONE $TAG $(ffprobe -v error -show_entries format=duration -of csv=p=0 out/silent-$TAG.mp4)"
