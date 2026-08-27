# Plan: Union CrewBase/COF bases into ro_input Airport

Spec: `docs/superpowers/specs/2026-08-24-ro-input-airport-crew-base-union-design.md`

1. Add FakeConn unit test in `test_ro_input_context.py` asserting `scenario_airports` unions flight airports with dated crew_base bases for scenario+COF crews.
2. Update `context.scenario_airports()` accordingly.
3. Run `pytest engine-server/tests/test_ro_input_context.py -q` (and variant airport tests if DB available).
