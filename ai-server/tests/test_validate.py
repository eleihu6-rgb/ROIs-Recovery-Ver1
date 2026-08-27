from src.regression.validate import validate_generated


def test_clean_measured_test_is_ok():
    code = "test('x', async ({ page }) => { await expect(page.getByTestId('chip')).toHaveCount(3); });"
    result = validate_generated(code)
    assert result['ok'] is True
    assert result['issues'] == []


def test_wait_for_timeout_is_not_ok():
    code = "test('x', async ({ page }) => { await page.waitForTimeout(500); await expect(x).toHaveCount(1); });"
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('waitForTimeout' in i for i in result['issues'])


def test_only_to_be_visible_is_not_ok():
    code = "test('x', async ({ page }) => { await expect(page.getByTestId('chip')).toBeVisible(); });"
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('only visibility' in i for i in result['issues'])


def test_to_be_visible_with_to_have_count_is_ok():
    code = ("test('x', async ({ page }) => { "
            "await expect(page.getByTestId('chip')).toBeVisible(); "
            "await expect(page.getByTestId('chip')).toHaveCount(2); });")
    result = validate_generated(code)
    assert result['ok'] is True
    assert result['issues'] == []


def test_no_expect_is_not_ok():
    code = "test('x', async ({ page }) => { await page.click('button'); });"
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('no assertion' in i for i in result['issues'])


def test_for_loop_does_not_count_as_measured():
    code = ("test('x', async ({ page }) => { "
            "await expect(page.getByTestId('chip')).toBeVisible(); "
            "for (let i = 0; i < items.length; i++) {} });")
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('only visibility' in i for i in result['issues'])


def test_numeric_budget_counts_as_measured():
    code = ("test('x', async ({ page }) => { "
            "await expect(page.getByTestId('chip')).toBeVisible(); "
            "expect(elapsed).toBeLessThan(800); });")
    result = validate_generated(code)
    assert result['ok'] is True
    assert result['issues'] == []

    code2 = ("test('x', async ({ page }) => { "
             "await expect(page.getByTestId('chip')).toBeVisible(); "
             "expect(elapsed < 800).toBe(true); });")
    result2 = validate_generated(code2)
    assert result2['ok'] is True
    assert result2['issues'] == []


def test_clean_test_with_no_imports_is_ok():
    code = "test('x', async ({ page }) => { await expect(page.getByTestId('chip')).toHaveCount(3); });"
    result = validate_generated(code)
    assert result['ok'] is True
    assert result['issues'] == []


def test_test_only_is_blocked():
    code = "test.only('x', async ({ page }) => { await expect(page.getByTestId('chip')).toHaveCount(3); });"
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('test.only' in i for i in result['issues'])


def test_require_is_blocked():
    code = ("test('x', async ({ page }) => { const cp = require('child_process'); "
            "await expect(page.getByTestId('chip')).toHaveCount(3); });")
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('require()' in i for i in result['issues'])


def test_non_playwright_import_is_blocked():
    code = ("import foo from 'foo';\n"
            "test('x', async ({ page }) => { await expect(page.getByTestId('chip')).toHaveCount(3); });")
    result = validate_generated(code)
    assert result['ok'] is False
    assert any('non-playwright module' in i for i in result['issues'])


def test_playwright_import_is_allowed():
    code = ("import { test } from '@playwright/test';\n"
            "test('x', async ({ page }) => { await expect(page.getByTestId('chip')).toHaveCount(3); });")
    result = validate_generated(code)
    assert result['ok'] is True
    assert result['issues'] == []


GOOD_BODY = "await expect(page.getByTestId('regression-list')).toHaveCount(1);"


def test_xpath_locator_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('//div[@id=1]').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert any('xpath' in i for i in issues)


def test_xpath_prefix_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('xpath=//tr').click(); {GOOD_BODY} }});"
    assert any('xpath' in i for i in validate_generated(code)['issues'])


def test_css_locator_rejected():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('div.row > span#id').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert any('raw .locator() string' in i for i in issues)


def test_data_testid_locator_allowed():
    code = f"test('x', async ({{ page }}) => {{ await page.locator('[data-testid=\"row\"]').click(); {GOOD_BODY} }});"
    issues = validate_generated(code)['issues']
    assert not any('raw .locator() string' in i or 'xpath' in i for i in issues)


def test_getby_locators_allowed():
    code = f"test('x', async ({{ page }}) => {{ await page.getByRole('button', {{ name: 'Run' }}).click(); {GOOD_BODY} }});"
    assert validate_generated(code)['ok']
