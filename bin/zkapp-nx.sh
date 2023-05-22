#!/usr/bin/env bash

# assist zkapp contracts to work within nx project with libs

test ! -f ../../nx.json \
  && echo "ERROR: ${0}: run from within zkapp contracts directory" \
  && exit 1

ln -sf ../../node_modules . \
  && mkdir -p node_modules/@zkhumans \
  && ln -sf \
    ../../dist/libs/snarky-bioauth \
    ../../dist/libs/utils \
    ./node_modules/@zkhumans/
