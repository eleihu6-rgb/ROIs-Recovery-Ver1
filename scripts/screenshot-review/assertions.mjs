/**
 * Pure assertion helpers for screenshot-review.
 *
 * Kept separate from review.mjs so they can be unit-tested without spawning the
 * native OCR binary.
 */

/** Collapse all whitespace runs (OCR returns one fragment per visual block). */
export function normalize(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse an expectation spec.
 *   "/regex/flags"  -> regex (case-insensitive unless `i`-affecting flags given)
 *   anything else   -> literal, case-insensitive substring
 */
export function matcher(spec) {
  const m = /^\/(.*)\/([a-z]*)$/s.exec(spec);
  if (m) {
    const flags = m[2].includes('i') ? m[2] : `${m[2]}i`;
    return { kind: 'regex', re: new RegExp(m[1], flags), label: spec };
  }
  return { kind: 'substring', needle: normalize(spec).toLowerCase(), label: spec };
}

/** Does `haystack` (already-normalized OCR text) satisfy `spec`? */
export function matches(spec, haystack) {
  const m = matcher(spec);
  if (m.kind === 'regex') return m.re.test(haystack);
  return haystack.toLowerCase().includes(m.needle);
}
