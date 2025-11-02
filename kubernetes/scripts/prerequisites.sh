#!/bin/bash

helm init --client-only || echo "probably helm3"

helm plugin install https://github.com/databus23/helm-diff
helm plugin install https://github.com/rimusz/helm-tiller

wget -O ~/bin/helmfile https://github.com/roboll/helmfile/releases/download/v0.102.0/helmfile_linux_amd64
chmod +x ~/bin/helmfile

helmfile init --force
