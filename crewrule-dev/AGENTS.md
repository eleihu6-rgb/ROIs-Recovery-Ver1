# Repository Guidelines

## Project Structure & Module Organization
- Root targets (CMake): `RuleSrv` (HTTP API), `RuleTool` (CLI), and the optional `RuleTest` (GoogleTest suite); all link the shared `RuleEngine` core library.
- `RuleEngine/`: domain logic (framework + rules under `RuleEngine/rule/...`); depends on `db/` (CSV/JSON IO), `orUtil/` (utilities), and `GlobalDefinition/` (shared headers).
- `RuleTest/`: consolidated GoogleTest cases (legacy `ruletest_*.cpp` plus pairing/duty suites) and sample data in `RuleTest/data`.
- `doc/`: SQL init/change scripts; `ThirdParty/`: vendored libs. `CMakePresets.json` defines Windows Ninja presets.

## Build, Test, and Development Commands
- Configure + build (Windows/MSVC):
  - config: configure_x64_debug.cmd
  - build RuleTest: run_ruletest_build.cmd
- Linux/MacOS Only: Enable the test target only when needed: append `-DCREWRULE_ENABLE_GTEST=ON` to the configure step and build `RuleTest` explicitly (`cmake --build --preset x64-debug --target RuleTest`).
- Binaries (examples): `out/build/x64-debug/RuleSrv.exe`, `RuleTool.exe`, `RuleTest.exe`.
- Run server: set working dir to repo root (or folder with `RuleSrv/RuleServiceConfig.txt`), start `RuleSrv.exe`, then open `http://localhost:8000/test`.

## Coding Style & Naming Conventions
- C++17, UTF-8. Prefer 4-space indentation; match surrounding files; avoid mass reformatting.
- Types/classes: PascalCase; functions: camelCase; macros/constants: UPPER_SNAKE_CASE; member fields: `_prefix` (e.g., `_ruleFactory`).
- File names: headers `.h`, sources `.cpp`; follow neighbors (e.g., `RuleEngine/...`, `ruletest_*.cpp`).

## Testing Guidelines
- Add suites under `RuleTest/` (tests auto-picked via `aux_source_directory`). Prefer GoogleTest fixtures and keep data dependencies in `RuleTest/data` when possible.
- Configure with `-DCREWRULE_ENABLE_GTEST=ON`, build the `RuleTest` target, then run with `ctest -R RuleTest --test-dir out/build/<preset>` or execute `RuleTest.exe` directly.
- RuleTest now locates shared CSV fixtures under `RuleTest/data` automatically (e.g., `scenario_input.csv`). Update `RuleTest/AGENTS.md` if you add new data requirements.

## Commit & Pull Request Guidelines
- Commit format: `[Ticket-ID]` short imperative summary.
  - Example: `[CMSPAL-385] 7311 BLH ranges fix`.
- PRs: clear description, linked issues, affected modules, how you tested (commands + logs), and screenshots/API responses for `RuleSrv` when relevant. Keep PRs focused and small.

## Security & Configuration Tips
- `RuleSrv` reads `RuleSrv/RuleServiceConfig.txt` (e.g., `RuleEngineDir=.\`, `Port=8000`). Do not commit real credentials or machine-specific paths.
- Prefer environment variables/local config for secrets; scrub logs before sharing.

## SQL Migration Constraints
- For prod-bound SQL migration scripts under `doc/`, do not use `CREATE TABLE`, `CREATE TEMPORARY TABLE`, `DROP TABLE`, or similar table-creation/table-deletion steps.
- Prefer idempotent in-place migrations using `UPDATE`, `INSERT`, and `DELETE`.
- If a migration needs intermediate logic, write it without temp tables so it remains acceptable for prod execution.

## Agent-Specific Instructions
- New rules: place sources under `RuleEngine/rule/ruleXXXX/`. They are auto-included by CMake globs; rebuild to link.
- Follow the open/closed principle for shared rule-engine flows: prefer stable abstractions, capability interfaces, or rule-factory extension points over direct dependencies on specific rule implementations. Avoid including `ruleXXXX` concrete headers from generic engine code when a rule-agnostic interface can express the behavior.
- In rule-engine code, avoid degradation handling, fallback behavior, hacks, local stabilizations, or post-processing bandages that are not faithful general algorithms.
- Do not add routine `nullptr`, `0`, empty-string, or similar fallback handling inside rule logic when those preconditions should already be guaranteed at the rule-engine entry point. Prefer enforcing the correct contract at the entrance over masking invalid state deeper in the algorithm.
- Apply `trim` and upper-casing when parsing rule parameters. During actual rule checking/calculation, usually do not cast segment/duty/pairing attributes to upper case; that normalization cost is unnecessary at runtime and those domain values should already be guaranteed during domain object creation.
