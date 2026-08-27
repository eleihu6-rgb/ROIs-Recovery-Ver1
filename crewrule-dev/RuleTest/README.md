# RuleTest README

RuleTest hosts focused regression coverage for the shared `RuleEngine` library. Every test target links the same core engine, so keep scenarios deterministic and document any new data dependencies. You can author cases in two ways: (1) inline GoogleTest fixtures that build their own data; or (2) data-driven harnesses that read `.ini`/`.csv` files from `RuleTest/data`.

## Build & run
1. Configure with GoogleTest enabled: `cmake --preset x64-debug -DCREWRULE_ENABLE_GTEST=ON` (adjust the preset if you use a different generator).
2. Build the suite: `cmake --build --preset x64-debug --target RuleTest`.
3. Execute with `ctest -R RuleTest --test-dir out/build/x64-debug` or run `out/build/x64-debug/RuleTest.exe` directly. The working directory does not matter because the data path is fixed at configure time.

## Authoring tests
### 1. Inline GoogleTest fixtures (prepare data with code)
Use this path when the scenario is compact and you want the assertion to live next to the code under test (e.g., `rule2003_gtest.cpp`). Typical steps:
- Create a new `ruleXXXX_gtest.cpp` so the existing `aux_source_directory` picks it up automatically.
- Include `<gtest/gtest.h>` plus any headers needed to build `Duty`, `Pairing`, custom rule structs, or helpers from `RuleEngine/`.
- Assemble the data directly in C++ (for example, helpers such as `makeDuty`, `makePairing`, or builder structs around `ruleXXXX`). This keeps the scenario self-contained and easy to refactor.
- Drive the engine with `LegalityChecker` or other public APIs, then assert with `EXPECT_*` macros.

```cpp
TEST_F(Rule2003Test, PairingWithinLimitsPasses) {
    Rule2003Config cfg;
    auto rule = makeRule2003(cfg);
    std::vector<std::unique_ptr<Duty>> duties;
    duties.push_back(makeDuty({0, 360, 0, 360, 60, 30, 300, "PEK", "CKG"}));
    auto raw = asRaw(duties);
    LegalityChecker checker(PAIRING_OPTIMIZER, false);
    EXPECT_TRUE(checker.checkPairingLimitationImplemenation(raw, rule.get(), nullptr));
}
```

Guidelines:
- Keep helpers local to the test when they are scenario-specific; factor them into `ruletest_util.*` only if multiple suites reuse them.
- Favor descriptive `TEST_F` names that encode the rule id and the behavior under test.
- Seed `RuleParams::GetInstancePtr()` and any global state inside `SetUp()` so cases stay isolated.

### 2. File-backed regression cases (load test data from file)
Prefer this method for large pairings, long CSV payloads, or when porting the legacy `.ini`-style scenarios. Existing drivers such as `ruletest_2003.cpp` demonstrate the pattern.

1. Place the data file under `RuleTest/data` (for example, `rule_case_2003.ini` or `scenario_input.csv`). Update `RuleTest/AGENTS.md` if the suite now depends on a new file.
2. Describe each case inside the `.ini` file using the established format: a section header, key-value rule parameters, and a `pairing` block describing duties.

```ini
[maxPgHour_ok]
expectLegal=Y
base=PEK
maxPgHours=48
pairing=
DUTY
FLY,9800,PEK,SHA,2017-1-1 08:00:00,2017-1-1 10:00:00
```

3. In your driver (`ruletest_XXXX.cpp`), call `loadRuleTestCase("rule_case_XXXX.ini")`, iterate over the returned `ruleTestCase` objects, and feed them into `LegalityChecker`.
4. Compare `expectLegal` (or any other flag you add) with the engine output and print or fail accordingly. The helper already normalizes keys, so follow the same naming conventions as the existing files.

This style keeps bulky fixtures out of the binary, makes it easier to share CSVs with analysts, and mirrors historical coverage that relied on `.ini` files.

## Checklist before submitting
- Keep added data files under `RuleTest/data` and document them in `RuleTest/AGENTS.md`.
- Rebuild and run `RuleTest` to confirm the new cases are discovered by CTest.
