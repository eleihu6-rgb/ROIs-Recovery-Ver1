#!/bin/sh

if [ ! -d "./cmake-build" ]; then
  mkdir cmake-build
  echo "creating cmake-build"
fi

cd cmake-build || exit

cmake -DCMAKE_BUILD_TYPE=Release ..

cd ..

cmake --build ./cmake-build -j 6 --target RuleSrv