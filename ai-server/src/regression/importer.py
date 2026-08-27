# ai-server/src/regression/importer.py
"""One-click catalog import: register existing e2e specs as regression cases (spec §3)."""

import re
from pathlib import Path
from typing import Any

from src.regression.store import RegressionStore

# Only plain `test('title'` — test.skip / test.fixme / test.describe don't match.
# Per-delimiter capture so a title may contain the OTHER quote chars (e.g.
# test('fizz "-ARR" ...') or test("R'Bot ...")) plus a backtick title and escapes — the
# old ['"](.+?)['"] truncated at the first inner quote.
_TEST_RE = re.compile(
    r"""^\s*test\(\s*"""
    r"""(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`)""",
    re.MULTILINE,
)

_SKIP_FILES = {'auth.setup.ts'}

# Matches the start of any test-like declaration so a test body can be sliced to the
# next boundary. Broader than _TEST_RE (which only matches plain `test(`) so that a
# skip/fixme/describe block between two plain tests does not bleed into the prior body.
_ANY_TEST_BOUNDARY = re.compile(r'^\s*test(?:\.\w+)?\(', re.MULTILINE)
_PLAIN_TEST_HEAD = re.compile(r'^\s*test\(')

# Author-maintained condition block convention (see filter-coverage.spec.ts):
#   // Conditions (set via Regression tab):
#   //   1. fleet chip appears ...
#   //   2. roster canvas shows crew rows ...
_CONDITIONS_HEADER = re.compile(r'^\s*//\s*Conditions\b.*?:\s*$', re.IGNORECASE)
_COMMENT_LINE = re.compile(r'^\s*//\s?(.*)$')
_BULLET_PREFIX = re.compile(r'^\s*(?:\d+[.)]|[-*•])\s*')

# Conservative literal-bearing assertion translations. Only matchers whose argument
# carries plain meaning are translated; opaque numeric/boolean assertions are skipped
# so the importer never emits misleading garble.
_STR_ARG = r"""['"`]((?:[^'"`\\]|\\.)*)['"`]"""
_ASSERTION_RULES: list[tuple[re.Pattern[str], Any]] = [
    (re.compile(r'\.toContainText\(\s*' + _STR_ARG), lambda m: f'Shows text "{m.group(1)}"'),
    (re.compile(r'\.toHaveText\(\s*' + _STR_ARG), lambda m: f'Shows text "{m.group(1)}"'),
    (re.compile(r'\.toHaveValue\(\s*' + _STR_ARG), lambda m: f'Field value is "{m.group(1)}"'),
    (re.compile(r'\.toHaveURL\(\s*' + _STR_ARG), lambda m: f'Navigates to {m.group(1)}'),
    (re.compile(r'\.toHaveCount\(\s*(\d+)\s*\)'),
     lambda m: 'Shows no items' if m.group(1) == '0' else f'Shows exactly {m.group(1)} item{"" if m.group(1) == "1" else "s"}'),
]

_GANTT_CATEGORY_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r'^auth'), 'Auth'),
    (re.compile(r'(^pane-|-pane\b|-pane\.)'), 'Panes'),
    (re.compile(r'(load-speed|first-paint|performance)'), 'Performance'),
    (re.compile(r'^pairing'), 'Pairing'),
    # Legality / rule-engine family — must precede the broad `filter` rule so a spec
    # like legality-8002-filtered.spec.ts lands under Legality, not Filter.
    (re.compile(r'(^legality|^rule-\d|^alert-center)'), 'Legality'),
    (re.compile(r'filter'), 'Filter'),
    (re.compile(r'^ai-chat'), 'AI Chat'),
    (re.compile(r'^regression'), 'Regression'),
]

# Title-based overrides: a spec file may contain tests from multiple domains
# (e.g. pairing-filter-chips.spec.ts hosts a "flight pane" test). These patterns
# win over the filename-derived category when the test title clearly names a
# different primary subject. Checked before filename rules.
_TITLE_CATEGORY_OVERRIDES: list[tuple[re.Pattern[str], str]] = [
    # Legality-family naming codes (Legal-/Rule-/Viol-####) win regardless of the
    # host spec file: e.g. Viol-8004 lives in legality-8002-filtered.spec.ts but is a
    # legality case, not a Filter one. Checked before filename rules.
    (re.compile(r'^(?:Legal|Rule|Viol)-\d', re.I), 'Legality'),
    (re.compile(r'\bflight pane\b', re.I), 'Panes'),    # chip/display behaviour on the flight pane
    (re.compile(r'\bflight filter\b', re.I), 'Filter'),  # filter-dialog flight-tab tests
    (re.compile(r'\broster pane\b', re.I), 'Panes'),
]


def parse_spec_titles(text: str) -> list[str]:
    titles: list[str] = []
    for m in _TEST_RE.finditer(text):
        raw = m.group(1) if m.group(1) is not None else (m.group(2) if m.group(2) is not None else m.group(3))
        if raw is None:
            continue
        title = re.sub(r'\\(.)', r'\1', raw)  # unescape \" \' \` \\ inside the title
        if title:
            titles.append(title)
    return titles


# Leading naming code (e.g. "Live-1040 — ") and trailing Playwright @tags are chrome,
# not the story. Stripping them yields the human-readable "what to test" seed.
_TITLE_CODE_PREFIX = re.compile(r'^\s*[A-Za-z][A-Za-z0-9]*-\d{3,4}\s*[—–-]\s*')
_TRAILING_TAGS = re.compile(r'(?:\s+@[\w-]+)+\s*$')


def story_from_title(title: str) -> str:
    """Seed a plain-English test story from a test title: drop the naming code and @tags."""
    story = _TITLE_CODE_PREFIX.sub('', title)
    story = _TRAILING_TAGS.sub('', story)
    return story.strip()


def parse_spec_tests(text: str) -> list[tuple[str, str]]:
    """Return (title, body) for each plain ``test(...)``; body is the source slice up to
    the next test-like boundary (or EOF). describe/skip/fixme blocks are excluded as
    titles but still act as slice boundaries so they never bleed into a prior body."""
    matches = list(_ANY_TEST_BOUNDARY.finditer(text))
    pairs: list[tuple[str, str]] = []
    for idx, m in enumerate(matches):
        if not _PLAIN_TEST_HEAD.match(m.group(0)):
            continue  # test.skip / test.fixme / test.describe
        end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
        block = text[m.start():end]
        titles = parse_spec_titles(block)
        if titles:
            pairs.append((titles[0], block))
    return pairs


def _conditions_from_block(body: str) -> list[str]:
    """Parse the author-maintained ``// Conditions ...:`` comment block, if present."""
    lines = body.splitlines()
    out: list[str] = []
    capturing = False
    for line in lines:
        if not capturing:
            if _CONDITIONS_HEADER.match(line):
                capturing = True
            continue
        cm = _COMMENT_LINE.match(line)
        if cm is None:
            break  # left the comment block
        text = _BULLET_PREFIX.sub('', cm.group(1).strip()).strip()
        if not text:
            break  # blank comment line ends the block
        out.append(text)
    return out


def _conditions_from_assertions(body: str) -> list[str]:
    """Translate literal-bearing assertions into plain-English conditions (order-preserving)."""
    out: list[str] = []
    for pattern, render in _ASSERTION_RULES:
        for m in pattern.finditer(body):
            out.append(render(m))
    # de-dupe preserving first-seen order; cap to keep the panel readable
    seen: set[str] = set()
    deduped = [c for c in out if not (c in seen or seen.add(c))]
    return deduped[:6]


def extract_conditions(body: str) -> list[str]:
    """Best-effort plain-English pass/fail conditions for a test body.

    Priority: (1) explicit author ``// Conditions:`` block, (2) literal assertion
    translation, else (3) empty (panel shows "No conditions set" — never garble)."""
    explicit = _conditions_from_block(body)
    if explicit:
        return explicit
    return _conditions_from_assertions(body)


def infer_category(spec_file: str) -> str:
    if spec_file.startswith('pbs-portal/'):
        return 'PBS Portal'
    if spec_file.startswith('pbs-app/'):
        return 'PBS App'
    if spec_file.startswith('perf/'):
        return 'Performance'

    filename = spec_file.removeprefix('gantt/')
    for pattern, category in _GANTT_CATEGORY_RULES:
        if pattern.search(filename):
            return category
    return 'General'


def _category_for(spec_file: str, title: str) -> str:
    """Title overrides win when the test's subject is clearly different from its filename."""
    for pattern, category in _TITLE_CATEGORY_OVERRIDES:
        if pattern.search(title):
            return category
    return infer_category(spec_file)


def import_specs(store: RegressionStore, spec_dir: Path) -> dict[str, Any]:
    """Recursively scan e2e specs; register unseen (relative spec_file, test_name) pairs."""
    existing = {(t['spec_file'], t['test_name']) for t in store.list_tests()}
    imported = skipped = 0
    for path in sorted(spec_dir.rglob('*.spec.ts')):
        if path.name in _SKIP_FILES:
            continue
        spec_file = path.relative_to(spec_dir).as_posix()
        legacy_gantt_file = (
            path.name
            if spec_file.startswith('gantt/') and '/' not in spec_file.removeprefix('gantt/')
            else ''
        )
        for title, body in parse_spec_tests(path.read_text()):
            if (spec_file, title) in existing or (legacy_gantt_file, title) in existing:
                skipped += 1
                continue
            t = store.create_test(title=title, category=_category_for(spec_file, title),
                                  priority='Medium', description=f'Imported from {spec_file}')
            store.update_test(t['id'], spec_file=spec_file, test_name=title,
                              trigger='import', modified_by='AI')
            story = story_from_title(title)
            if story:
                store.update_story(t['id'], story)
            conditions = extract_conditions(body)
            if conditions:
                store.update_conditions(t['id'], conditions)
            existing.add((spec_file, title))
            imported += 1
    return {'imported': imported, 'skipped': skipped}
