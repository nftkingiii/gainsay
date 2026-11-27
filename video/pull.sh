#!/bin/bash
# pull.sh <remote path relative to ~/gainsay-video> <local path>
for i in 1 2 3 4 5; do gcloud compute scp "testbench:/home/USER/gainsay-video/$1" "$2" --zone=us-central1-a >/dev/null 2>&1 && exit 0; sleep 4; done; exit 1
