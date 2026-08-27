@echo off
REM Helper script to build RuleTest with the VS 2022 environment
set "VS_ROOT=C:\Program Files\Microsoft Visual Studio\2022\Community"
call "%VS_ROOT%\VC\Auxiliary\Build\vcvars64.bat"
set "PATH=%VS_ROOT%\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja;%PATH%"
cmake --build --preset x64-debug --target RuleTest -j
