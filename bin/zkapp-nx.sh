#!/usr/bin/env bash

# assist zkapp contracts to work within nx project with nx libs
# and "zk deploy" compatibility

test ! -f ../../nx.json \
  && echo "ERROR: ${0}: run from within zkapp contracts directory" \
  && exit 1

# "zk deploy" expects compiled output in ./build
build_dir=$(basename $(pwd))
rm -rf ./build
ln -sf ../../dist/libs/${build_dir} ./build

# "zk deploy" expects ./node_modules exists
# - custom tsconfig paths are found there
# - built nx libraries are manually linked
ln -sf ../../node_modules . \
  && mkdir -p node_modules/@zkhumans \
  && ln -sf \
    ../../dist/libs/snarky-bioauth \
    ../../dist/libs/utils \
    ./node_modules/@zkhumans/
