# Targeting Operation System: MacOS use Darwin
set(CMAKE_SYSTEM_NAME Darwin)

# which compilers to use for C and C++, for now, use default compiler toolset LLVM
set(CMAKE_C_COMPILER   clang)
set(CMAKE_CXX_COMPILER clang++)

# force to use LLVM linker lld and Archiver llvm-ar when linking
set(CMAKE_LINKER    ldd)
set(CMAKE_AR        llvm-ar)
set(CMAKE_EXE_LINKER_FLAGS -fuse-ld=lld)

# Set Clang targeting arm64_macos
set(CMAKE_C_COMPILER_TARGET    arm64-apple-macos)
set(CMAKE_CXX_COMPILER_TARGET  arm64-apple-macos)

# where is the target environment located, namely MacOSSDK
set(CMAKE_OSX_SYSROOT $ENV{MacSDK})
set(CMAKE_OSX_DEPLOYMENT_TARGET 10.15) # Only support 10.15 or above (Catalina, release in 2019)
set(CMAKE_FIND_ROOT_PATH ${CMAKE_OSX_SYSROOT})

# adjust the default behavior of the FIND_XXX() commands:
# search programs in the host environment
set(CMAKE_FIND_ROOT_PATH_MODE_PROGRAM NEVER)

# search headers and libraries in the target environment
set(CMAKE_FIND_ROOT_PATH_MODE_LIBRARY ONLY)
set(CMAKE_FIND_ROOT_PATH_MODE_INCLUDE ONLY)