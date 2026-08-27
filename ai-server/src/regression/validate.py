"""Pure quality gate for AI-generated Playwright code (Goal 4 / §10).

Rejects hard sleeps, assertion-free tests, and bare-visibility "proof".
"""

import re

_NUMERIC_CMP = re.compile(r'[<>]=?\s*\d')

# Locator quality (spec §5): xpath and raw CSS selectors are brittle — require
# getByTestId/getByRole/getByText/getByLabel/getByPlaceholder or [data-testid=…].
_XPATH_LOCATOR = re.compile(r"""\.locator\(\s*['"]\s*(?://|xpath=)""")
_RAW_CSS_LOCATOR = re.compile(r"""\.locator\(\s*['"](?!\[data-testid)""")

# Generated code must be ONLY a test() block (no imports). Any import that is
# not from '@playwright/test' is rejected.
_IMPORT_RE = re.compile(r"""import\b[^;\n]*?\bfrom\s+['"]([^'"]+)['"]""")

_MEASURED_MARKERS = (
    'toHaveCount',
    'toHaveText',
    'toHaveValue',
    'toContainText',
    '.status(',
    'expect.poll',
    'toPass',
    'toBeLessThan',
    'toBeGreaterThan',
)


def _has_numeric_comparison(code: str) -> bool:
    # Require a numeric literal on the right of a comparison operator
    # (e.g. `elapsed < 800`). A bare loop guard like `i < items.length`
    # must NOT count as a measured assertion.
    return bool(_NUMERIC_CMP.search(code))


def _has_measured_assertion(code: str) -> bool:
    if any(marker in code for marker in _MEASURED_MARKERS):
        return True
    return _has_numeric_comparison(code)


def validate_generated(code: str) -> dict:
    """Return {'ok': bool, 'issues': list[str]} for AI-generated test code."""
    issues: list[str] = []

    if 'waitForTimeout' in code:
        issues.append('uses waitForTimeout (hard sleep) — use expect.poll/toPass with a timeout')

    if 'expect(' not in code:
        issues.append('no assertion (expect) found')

    if 'toBeVisible' in code and not _has_measured_assertion(code):
        issues.append('only visibility asserted — add a measured assertion (toHaveCount/toHaveText/status/<N ms)')

    if _XPATH_LOCATOR.search(code):
        issues.append('uses an xpath selector — forbidden; use getByTestId/getByRole/getByText')
    elif _RAW_CSS_LOCATOR.search(code):
        issues.append('uses a raw .locator() string — use getByTestId/getByRole/getByText or [data-testid=…]')

    # Dangerous patterns in generated Playwright code — each is blocking.
    if 'test.only' in code or '.only(' in code:
        issues.append('uses test.only — forbidden')
    if 'require(' in code:
        issues.append('uses require() — forbidden')
    if 'child_process' in code:
        issues.append('references child_process — forbidden')
    if 'eval(' in code:
        issues.append('uses eval() — forbidden')
    if 'process.' in code:
        issues.append('references node process — forbidden')
    for module in _IMPORT_RE.findall(code):
        if module != '@playwright/test':
            issues.append('imports a non-playwright module — emit only the test() block')
            break

    return {'ok': len(issues) == 0, 'issues': issues}
