#!/bin/bash
# sync-lite.sh: only the small source files (index.html, cues, scripts, docs) to the VM
cd "$(dirname "$0")"
tar czf ../.gl.tgz index.html lib cues.json cues-v.json *.mjs *.sh docs BRIEF.md narration.json vo.py plan.js plan.json 2>/dev/null || tar czf ../.gl.tgz index.html lib cues.json cues-v.json *.mjs *.sh docs BRIEF.md narration.json vo.py
for i in 1 2 3; do gcloud compute scp ../.gl.tgz testbench:/home/USER/gl.tgz --zone=us-central1-a >/dev/null 2>&1 && break; sleep 3; done
./vm.sh "tar xzf ~/gl.tgz -C ~/gainsay-video && rm ~/gl.tgz && echo synced-lite"
rm -f ../.gl.tgz
