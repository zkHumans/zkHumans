#!/usr/bin/env bash

# A snarky-run wrapper to set node options

test -z "${1}" && echo "USAGE: ${0} <path to file>" && exit 1
test ! -f nx.json && echo "ERROR: ${0}: run from project root" && exit 1

node_options=(
  # fixes ERR_MODULE_NOT_FOUND
  --es-module-specifier-resolution=node

  # inspiration from https://github.com/o1-labs/snarkyjs/blob/main/run
  --enable-source-maps
  --stack-trace-limit=1000

  # noisy warnings for experimental node options obscure console output
  --no-warnings
)

# using snarky-run; breaks on local imports
# # change to the project directory to run snarky-run on the file
# d=$(echo ${1} | cut -d'/' -f 1,2)
# f=$(echo ${1} | cut -d'/' -f 3-)
# cd ${d} \
#   && npm run build \
#   && NODE_OPTIONS="${node_options[@]}" npx snarky-run ${f}

d=$(echo ${1} | cut -d'/' -f 1,2)
f=$(echo ${1} | cut -d'/' -f 3- | sed -e 's/\.ts$/.js/')
cd ${d} \
  && npm run build \
  && node ${node_options[@]} build/${f}
