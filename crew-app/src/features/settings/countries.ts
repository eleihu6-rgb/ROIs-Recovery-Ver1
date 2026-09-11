// ISO-3166 alpha-2 → country name, for the crew profile line ("ET" alone is not
// something a crew should have to decode). Intl knows every region on a device
// that ships the full ICU data; the small table is the offline fallback and
// covers the carriers this app serves today.
const FALLBACK: Record<string, string> = {
  ET: 'Ethiopia',
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  AE: 'United Arab Emirates',
  KE: 'Kenya',
  IN: 'India',
  TH: 'Thailand',
  PH: 'Philippines',
  NG: 'Nigeria',
  GH: 'Ghana',
  ZA: 'South Africa',
  FR: 'France',
  DE: 'Germany',
};

export function countryName(code: string | null | undefined): string {
  const key = (code ?? '').trim().toUpperCase();
  if (!key) {
    return '';
  }
  try {
    const ctor = (Intl as unknown as {
      DisplayNames?: new (locales: string[], options: { type: string }) => { of(value: string): string | undefined };
    }).DisplayNames;
    if (ctor) {
      const display = new ctor(['en'], { type: 'region' }).of(key);
      if (display && display !== key) {
        return display;
      }
    }
  } catch {
    // Hermes without full ICU — fall through to the table.
  }
  return FALLBACK[key] ?? key;
}
