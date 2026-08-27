# RuleTest Guidelines

- Enable the target with `-DCREWRULE_ENABLE_GTEST=ON` (use `cmake --preset <preset> -DCREWRULE_ENABLE_GTEST=ON`) and build it explicitly via `cmake --build --preset <preset> --target RuleTest`.
- On Windows/MSVC, run the build from a Visual Studio Developer Command Prompt / Developer PowerShell (or use the helper `run_ruletest_build.cmd` in the repo root) so the MSVC environment is initialized before `cmake --build` is invoked; this ensures standard library headers and GoogleTest are found correctly.
- Tests run under GoogleTest; add new suites anywhere under this folder and they are auto-picked by `aux_source_directory`. Prefer descriptive filenames (e.g., `ruleXXXX_gtest.cpp` or `ruletest_feature.cpp`).
- Regression tests automatically load shared fixtures from `RuleTest/data` (e.g., `scenario_input.csv`). Keep heavy CSVs there and update this file if you add new dependencies.
- Use `ctest -R RuleTest --test-dir out/build/<preset>` or `out/build/<preset>/RuleTest.exe` to execute; the data path is wired in at build time so no special working directory is required.
- When porting older custom tests, wrap them with GoogleTest assertions rather than rolling a bespoke runner. `RuleTest/main.cpp` shows how the legacy helper functions are bridged today.
