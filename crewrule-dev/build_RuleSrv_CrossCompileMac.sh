#!/bin/sh

if [ ! -d "./cmake-build-cross-compile-mac" ]; then
  mkdir cmake-build-cross-compile-mac
  echo "creating cmake-build-cross-compile-mac"
fi

echo "This Shell only work in ARM Linux Machine with LLVM & MacOSSDK installed"
cd cmake-build-cross-compile-mac || exit

cmake -DCMAKE_BUILD_TYPE=Release -DOATPP_LINK_TEST_LIBRARY:BOOL=TRUE -DENABLE_HTTPS:BOOL=OFF -DARM_CROSS_COMPILE_FOR_M_CHIP_MAC:BOOL=ON -DCMAKE_TOOLCHAIN_FILE=$PWD/../Darwin_clang_arm64.cmake ..

cd ..

cmake --build ./cmake-build-cross-compile-mac -j 4 --target RuleSrv