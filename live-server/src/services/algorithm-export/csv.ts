const FORMULA_PREFIX_PATTERN = /^\s*[=+\-@]/;
const DANGEROUS_CONTROL_PREFIX_PATTERN = /^[\t\r\n]/;

const neutralizeSpreadsheetFormula = (value: string): string => {
  if (FORMULA_PREFIX_PATTERN.test(value) || DANGEROUS_CONTROL_PREFIX_PATTERN.test(value)) {
    return `'${value}`;
  }

  return value;
};

export const escapeCsvCell = (value: string | number | null | undefined): string => {
  const text = typeof value === "number"
    ? String(value)
    : neutralizeSpreadsheetFormula(value ?? "");

  if (!/[",\r\n]/.test(text)) {
    return text;
  }

  return `"${text.replace(/"/g, "\"\"")}"`;
};
