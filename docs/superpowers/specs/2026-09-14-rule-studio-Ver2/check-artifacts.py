"""Verify docs, GIFs and preservation of the user's existing Ver 1 package."""
from pathlib import Path
from html.parser import HTMLParser
from PIL import Image
import hashlib,json,re,subprocess
package=Path(__file__).resolve().parent
root=package.parents[3]
class Links(HTMLParser):
    def handle_starttag(self,tag,attrs):
        for k,v in attrs:
            if k in ('href','src') and v and not v.startswith(('http','#','data:')):
                assert (package/v).exists(),v
Links().feed((package/'index.html').read_text())
for file in package.glob('*.md'):
    for link in re.findall(r'\]\(([^)]+)\)',file.read_text()):
        if not link.startswith(('http','#')):
            assert (package/link).exists(),link
for file in package.iterdir():
    if file.is_file():
        result=subprocess.run(['git','diff','--no-index','--check','/dev/null',str(file)],capture_output=True,text=True)
        assert result.returncode in (0,1) and not result.stdout and not result.stderr,result.stdout+result.stderr
hashes=json.loads((package/'ver1-preservation.json').read_text())
for file,digest in hashes.items():
    assert hashlib.sha256((root/file).read_bytes()).hexdigest()==digest,'Ver 1 modified: '+file
assert set(hashes)=={str(p.relative_to(root)) for p in (root/'docs/superpowers/specs/2026-09-14-rule-studio-Ver1').rglob('*') if p.is_file()}
assert len(list((package/'replays').glob('*.gif')))==24
for file in (package/'replays').glob('*.gif'):
    with Image.open(file) as gif:
        assert gif.n_frames==3
        assert gif.width>500 and gif.height>200
    assert file.with_suffix('.png').exists()
print('PASS: links/assets/whitespace; 24 three-frame GIFs and static alternatives; all Ver 1 files unchanged (SHA-256).')
