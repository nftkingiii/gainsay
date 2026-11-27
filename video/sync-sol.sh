#!/bin/bash
cd "$(dirname "$0")"
tar czf ../.gs.tgz assets/shots/solana-full.png
for i in 1 2 3 4; do gcloud compute scp ../.gs.tgz testbench:/home/USER/gs.tgz --zone=us-central1-a >/dev/null 2>&1 && break; sleep 3; done
./vm.sh "tar xzf ~/gs.tgz -C ~/gainsay-video && rm ~/gs.tgz && echo synced-sol"; rm -f ../.gs.tgz
