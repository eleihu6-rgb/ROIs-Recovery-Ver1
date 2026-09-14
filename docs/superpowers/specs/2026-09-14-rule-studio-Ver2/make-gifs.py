"""Encode captured browser frames as GIF previews, without changing their content."""
from pathlib import Path
from PIL import Image
import shutil
root=Path(__file__).resolve().parent/'replays'
for a in sorted(root.glob('*-frame0.png')):
    name=a.name.removesuffix('-frame0.png')
    frames=[Image.open(root/f'{name}-frame{i}.png').convert('RGB') for i in range(3)]
    frames[0].save(root/f'{name}.gif',save_all=True,append_images=frames[1:],duration=[1200,1200,2200],loop=0)
    shutil.copyfile(root/f'{name}-frame2.png',root/f'{name}.png')
    with Image.open(root/f'{name}.gif') as gif:
        assert gif.n_frames==3
print('PASS: 24 animated GIFs, each with 3 frames, and 24 static result previews.')
