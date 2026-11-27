#!/bin/bash
# sync.sh: copy video sources + assets to the testbench VM (~/gainsay-video). Never touches other folders there.
cd "$(dirname "$0")"
tar czf ../.gv.tgz --exclude=node_modules --exclude=out --exclude=assets/shots/*-page.png . 
for i in 1 2 3; do gcloud compute scp ../.gv.tgz testbench:/home/USER/gv.tgz --zone=us-central1-a >/dev/null 2>&1 && break; sleep 3; done
./vm.sh "tar xzf ~/gv.tgz -C ~/gainsay-video && rm ~/gv.tgz && echo synced"
