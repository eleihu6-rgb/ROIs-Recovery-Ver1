# ai-server/tests/test_importer.py
from pathlib import Path

from src.regression.importer import (
    parse_spec_titles,
    parse_spec_tests,
    extract_conditions,
    story_from_title,
    infer_category,
    _category_for,
    import_specs,
)
from src.regression.store import RegressionStore


SPEC = """
import { test, expect } from '@playwright/test'

test.describe('panes', () => {})
test('opens the roster pane', async ({ page }) => {})
test.skip('legacy broken case', async ({ page }) => {})
test.fixme('todo case', async ({ page }) => {})
test("closes the pane", async ({ page }) => {})
"""


def test_parse_titles_skips_describe_skip_fixme():
    assert parse_spec_titles(SPEC) == ['opens the roster pane', 'closes the pane']


def test_parse_spec_tests_pairs_title_with_body():
    pairs = parse_spec_tests(SPEC)
    assert [title for title, _ in pairs] == ['opens the roster pane', 'closes the pane']
    # bodies are non-empty source slices, skip/fixme/describe excluded as titles
    assert all(body.strip().startswith('test(') for _, body in pairs)


EXPLICIT_BLOCK_SPEC = """
test('Live-1041 — Crew: fleet filter (data-driven)', async ({ page }) => {
  // Conditions (set via Regression tab):
  //   1. fleet chip appears on roster pane strip for the selected fleet
  //   2. roster canvas shows crew rows (totalRows > 0) after filtering
  //   3. test specifically with fleet 73M first — FAIL if no crew (exposes data gap)
  await applyFilterLight(page)
  await expect(page.getByTestId('x')).toBeVisible()
})
"""


def test_extract_conditions_prefers_explicit_author_block():
    _, body = parse_spec_tests(EXPLICIT_BLOCK_SPEC)[0]
    conds = extract_conditions(body)
    assert conds == [
        'fleet chip appears on roster pane strip for the selected fleet',
        'roster canvas shows crew rows (totalRows > 0) after filtering',
        'test specifically with fleet 73M first — FAIL if no crew (exposes data gap)',
    ]


ASSERTION_SPEC = """
test('shows the loaded roster', async ({ page }) => {
  await expect(page.getByTestId('status')).toContainText('Current')
  await expect(page.getByTestId('rows')).toHaveCount(3)
  await expect(page.getByTestId('empty')).toHaveCount(0)
  await expect(page).toHaveURL('/altair/')
})
"""


def test_extract_conditions_translates_literal_assertions():
    _, body = parse_spec_tests(ASSERTION_SPEC)[0]
    conds = extract_conditions(body)
    assert 'Shows text "Current"' in conds
    assert 'Shows exactly 3 items' in conds
    assert 'Shows no items' in conds
    assert 'Navigates to /altair/' in conds


def test_extract_conditions_empty_when_nothing_translatable():
    _, body = parse_spec_tests(
        "test('opaque', async ({ page }) => {\n  await expect(x).toBeGreaterThan(0)\n})\n"
    )[0]
    assert extract_conditions(body) == []


def test_import_specs_backfills_conditions_on_new_tests(tmp_path):
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'gantt' / 'roster.spec.ts').write_text(ASSERTION_SPEC)
    (spec_dir / 'gantt' / 'fleet.spec.ts').write_text(EXPLICIT_BLOCK_SPEC)

    store = RegressionStore(tmp_path / 'reg.json')
    import_specs(store, spec_dir)

    roster = next(t for t in store.list_tests() if t['test_name'] == 'shows the loaded roster')
    assert 'Shows text "Current"' in roster['conditions']
    assert 'Shows exactly 3 items' in roster['conditions']

    fleet = next(t for t in store.list_tests() if t['test_name'].startswith('Live-1041'))
    assert fleet['conditions'][0] == 'fleet chip appears on roster pane strip for the selected fleet'


def test_story_from_title_strips_code_and_tags():
    assert story_from_title(
        'Live-1040 — Crew: rank filter (data-driven) — filter store updated @filter-crew'
    ) == 'Crew: rank filter (data-driven) — filter store updated'
    assert story_from_title('Data-5002 — Expiry mode defaults to current') == 'Expiry mode defaults to current'
    # no code prefix → returns the title unchanged (minus any trailing tags)
    assert story_from_title('plain title @smoke') == 'plain title'


def test_import_specs_seeds_story_from_title(tmp_path):
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'gantt' / 'x.spec.ts').write_text(
        "test('Live-1040 — Crew: rank filter @filter-crew', async ({ page }) => {\n"
        "  await expect(page.getByTestId('c')).toContainText('CA')\n})\n"
    )
    store = RegressionStore(tmp_path / 'reg.json')
    import_specs(store, spec_dir)
    t = store.list_tests()[0]
    assert t['story'] == 'Crew: rank filter'
    assert 'Shows text "CA"' in t['conditions']


def test_update_story_persists(tmp_path):
    store = RegressionStore(tmp_path / 'reg.json')
    t = store.create_test(title='t', category='General', priority='Medium', description='')
    assert t['story'] == ''
    store.update_story(t['id'], 'Open the crew filter, pick a rank, apply.')
    assert store.get_test(t['id'])['story'] == 'Open the crew filter, pick a rank, apply.'
    # survives reload from disk
    reloaded = RegressionStore(tmp_path / 'reg.json')
    assert reloaded.get_test(t['id'])['story'] == 'Open the crew filter, pick a rank, apply.'


def test_infer_category():
    assert infer_category('gantt/auth.spec.ts') == 'Auth'
    assert infer_category('auth.spec.ts') == 'Auth'
    assert infer_category('pane-limits.spec.ts') == 'Panes'
    assert infer_category('flight-pane.spec.ts') == 'Panes'
    assert infer_category('load-speed.spec.ts') == 'Performance'
    assert infer_category('first-paint-phases.spec.ts') == 'Performance'
    assert infer_category('pairing-filter-chips.spec.ts') == 'Pairing'
    assert infer_category('query-filter.spec.ts') == 'Filter'
    assert infer_category('ai-chat.spec.ts') == 'AI Chat'
    assert infer_category('regression-page.spec.ts') == 'Regression'
    assert infer_category('pbs-portal/auth.spec.ts') == 'PBS Portal'
    assert infer_category('pbs-app/home.spec.ts') == 'PBS App'
    assert infer_category('perf/nginx-headers.spec.ts') == 'Performance'
    assert infer_category('whatever-else.spec.ts') == 'General'


def test_infer_category_legality_family():
    # Legality tab, rule-engine, alert-center specs all land in the dedicated Legality category.
    assert infer_category('gantt/legality-tab.spec.ts') == 'Legality'
    assert infer_category('gantt/legality-8002-ui-debug.spec.ts') == 'Legality'
    assert infer_category('gantt/rule-7505-gdo.spec.ts') == 'Legality'
    assert infer_category('gantt/rule-8002-windows.spec.ts') == 'Legality'
    assert infer_category('gantt/alert-center-8002.spec.ts') == 'Legality'
    # A rule-engine spec whose name also contains "filter" must NOT regress to Filter:
    # the Legality rule precedes the broad filter rule.
    assert infer_category('gantt/legality-8002-filtered.spec.ts') == 'Legality'
    # `rule-` without a trailing digit is not a rule-engine spec (stays General).
    assert infer_category('gantt/rule-engine-config.spec.ts') == 'General'


def test_category_for_legality_naming_code_overrides_spec():
    # A Legality-family naming code wins over the host spec's filename category.
    # Viol-8004 lives in a *-filtered spec but is a legality case, not a Filter one.
    assert _category_for('gantt/legality-8002-filtered.spec.ts',
                         'Viol-8004 — Alert Center lists 8002 messages unfiltered') == 'Legality'
    assert _category_for('gantt/some-random.spec.ts',
                         'Legal-6006 — observe gantt violations request') == 'Legality'
    assert _category_for('gantt/some-random.spec.ts',
                         'Rule-3019 — live param_json carries 7501/004') == 'Legality'
    # Non-legality codes are untouched by the override.
    assert _category_for('gantt/pane-limits.spec.ts',
                         'Live-1001 — roster pane shows crew') == 'Panes'


def test_import_specs_recurses_and_is_idempotent(tmp_path):
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt' / 'help').mkdir(parents=True)
    (spec_dir / 'pbs-portal').mkdir(parents=True)
    (spec_dir / 'gantt' / 'pane-limits.spec.ts').write_text(SPEC)
    (spec_dir / 'gantt' / 'auth.setup.ts').write_text("test('must be skipped', () => {})")
    (spec_dir / 'gantt' / 'help' / 'help-x.spec.ts').write_text("test('help case', () => {})")
    (spec_dir / 'pbs-portal' / 'auth.spec.ts').write_text("test('portal logs in', async ({ page }) => {})")

    store = RegressionStore(tmp_path / 'reg.json')
    first = import_specs(store, spec_dir)
    assert first == {'imported': 4, 'skipped': 0}
    t = store.list_tests()[0]
    assert t['spec_file'] == 'gantt/help/help-x.spec.ts'
    assert t['test_name'] == 'help case'

    pane = next(test for test in store.list_tests() if test['test_name'] == 'opens the roster pane')
    assert pane['spec_file'] == 'gantt/pane-limits.spec.ts'
    assert pane['category'] == 'Panes'
    assert pane['source'] == 'User'

    portal = next(test for test in store.list_tests() if test['test_name'] == 'portal logs in')
    assert portal['spec_file'] == 'pbs-portal/auth.spec.ts'
    assert portal['category'] == 'PBS Portal'

    second = import_specs(store, spec_dir)
    assert second == {'imported': 0, 'skipped': 4}


def test_import_specs_dedupes_on_relative_file_and_title(tmp_path):
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'pbs-portal').mkdir()
    (spec_dir / 'gantt' / 'auth.spec.ts').write_text("test('same title', async ({ page }) => {})")
    (spec_dir / 'pbs-portal' / 'auth.spec.ts').write_text("test('same title', async ({ page }) => {})")

    store = RegressionStore(tmp_path / 'reg.json')
    first = import_specs(store, spec_dir)
    assert first == {'imported': 2, 'skipped': 0}
    assert {t['spec_file'] for t in store.list_tests()} == {
        'gantt/auth.spec.ts',
        'pbs-portal/auth.spec.ts',
    }

    second = import_specs(store, spec_dir)
    assert second == {'imported': 0, 'skipped': 2}


def test_import_specs_treats_legacy_top_level_gantt_files_as_existing(tmp_path):
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'gantt' / 'auth.spec.ts').write_text("test('legacy title', async ({ page }) => {})")

    store = RegressionStore(tmp_path / 'reg.json')
    t = store.create_test(title='legacy title', category='Auth', priority='Medium', description='')
    store.update_test(t['id'], spec_file='auth.spec.ts', test_name='legacy title')

    assert import_specs(store, spec_dir) == {'imported': 0, 'skipped': 1}
    assert len(store.list_tests()) == 1


def test_import_attributes_baseline_to_ai(tmp_path):
    store = RegressionStore(tmp_path / 'r.json')
    spec_dir = tmp_path / 'tests'
    (spec_dir / 'gantt').mkdir(parents=True)
    (spec_dir / 'gantt' / 'a.spec.ts').write_text("test('t1', async () => {})\n")
    import_specs(store, spec_dir)
    t = store.list_tests()[0]
    assert t['created_by'] == 'AI'
    assert t['versions'][-1]['trigger'] == 'import'
    assert t['versions'][-1]['modified_by'] == 'AI'
