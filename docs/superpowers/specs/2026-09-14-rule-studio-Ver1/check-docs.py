"""Path, artifact and whitespace checks for this documentation package."""
from pathlib import Path
from html.parser import HTMLParser
import re
import subprocess

root = Path(__file__).resolve().parents[4]
package = Path(__file__).resolve().parent

class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ('href', 'src') and value and not value.startswith(('http', '#', 'data:')):
                assert (package / value).exists(), value

for file in package.iterdir():
    if file.suffix == '.html':
        Links().feed(file.read_text())
    if file.suffix == '.md':
        for link in re.findall(r'\]\(([^)]+)\)', file.read_text()):
            if not link.startswith(('http', '#')):
                assert (package / link).exists(), link
    if file.is_file():
        result = subprocess.run(['git', 'diff', '--no-index', '--check', '/dev/null', str(file)], capture_output=True, text=True)
        assert result.returncode in (0, 1) and not result.stdout and not result.stderr, result.stdout + result.stderr
for file in ['rule-engine-rs/src/lib.rs', 'rule-engine-rs/src/rules/rule7508.rs', 'rule-engine-rs/src/rules/rule7305.rs', 'rule-engine-rs/py/src/lib.rs', 'rule-engine-rs/tests/rule_7505_tests.rs', 'rule-engine-rs/tests/rule_7305_tests.rs', 'rule-engine-rs/py/tests/test_engine_phase2_7505.py']:
    assert (root / file).exists(), file
assert len(list(package.glob('*.html'))) == 4
print('PASS: document links, HTML assets, source paths, four HTML pages and whitespace.')
