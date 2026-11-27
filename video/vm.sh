#!/bin/bash
# vm.sh <cmd...>: run a command in ~/gainsay-video on the testbench VM (shared: never stop it, never touch other processes). Retries flaky ssh.
for i in 1 2 3 4 5; do
  out=$(gcloud compute ssh testbench --zone=us-central1-a --command="cd /home/USER/gainsay-video && $*" 2>&1); rc=$?
  if echo "$out" | grep -q "plink.exe\] exited with return code \[1\]" && ! echo "$out" | grep -q "^__ran__"; then sleep 4; continue; fi
  echo "$out"; exit $rc
done
echo "$out"; exit 1
