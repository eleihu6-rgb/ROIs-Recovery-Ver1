// Guard: the launcher icons must actually exist, in the sizes the catalog
// claims, and be OPAQUE.
//
// Why this test exists: the icon PNGs were once referenced by Contents.json but
// never committed, so a build from main shipped with no app icon at all — and an
// iOS icon that carries an alpha channel renders wrong (iOS composites it, the
// App Store rejects it). Both failure modes are cheap to catch here.
import fs from 'fs';
import path from 'path';

const REPO = path.resolve(__dirname, '..', '..');
const ICON_SET = path.join(REPO, 'ios/RoyceTravelTemplate/Images.xcassets/AppIcon.appiconset');
const ANDROID_RES = path.join(REPO, 'android/app/src/main/res');

interface CatalogImage { filename?: string; idiom: string; scale?: string; size?: string }

/** PNG IHDR colour type: 0 grey, 2 RGB, 3 palette, 4 grey+alpha, 6 RGBA. */
function pngColourType(file: string): number {
  const buf = fs.readFileSync(file);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a'); // PNG signature
  return buf[25];
}

function pngSize(file: string): {width: number; height: number} {
  const buf = fs.readFileSync(file);
  return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)};
}

describe('app launcher icons', () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ICON_SET, 'Contents.json'), 'utf8'),
  ) as {images: CatalogImage[]};
  const listed = catalog.images.filter(i => i.filename);

  it('lists the full iPhone set plus the 1024 marketing icon', () => {
    expect(listed.length).toBeGreaterThanOrEqual(9);
    expect(listed.some(i => i.filename === 'AppIcon-1024.png')).toBe(true);
  });

  it('has every file the catalog references', () => {
    for (const image of listed) {
      const file = path.join(ICON_SET, image.filename!);
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it('carries no alpha and the exact pixel size each entry claims', () => {
    for (const image of listed) {
      const file = path.join(ICON_SET, image.filename!);
      const colourType = pngColourType(file);
      expect([4, 6]).not.toContain(colourType); // no grey+alpha / RGBA
      if (!image.size) continue;
      const [w, h] = image.size.split('x').map(Number);
      const scale = Number((image.scale ?? '1x').replace('x', ''));
      expect(pngSize(file)).toEqual({width: w * scale, height: h * scale});
    }
  });

  it('ships an Android launcher icon at every density', () => {
    for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
        expect(fs.existsSync(path.join(ANDROID_RES, `mipmap-${density}`, name))).toBe(true);
      }
    }
  });
});
