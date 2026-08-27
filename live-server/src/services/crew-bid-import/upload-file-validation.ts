import { TextDecoder } from 'node:util'

type ValidateCrewBidImportFileInput = {
  buffer: Buffer
  filename?: string
  mimetype?: string
}

type ValidateCrewBidImportFileResult =
  | { success: true; sourceText: string }
  | { success: false; message: string }

const ALLOWED_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'text/plain',
])

const hasTxtExtension = (filename?: string): boolean =>
  Boolean(filename?.trim().toLowerCase().endsWith('.txt'))

const normalizeMimeType = (mimetype?: string): string =>
  mimetype?.split(';')[0]?.trim().toLowerCase() ?? ''

const containsDisallowedControlCharacter = (text: string): boolean => {
  for (const char of text) {
    const code = char.charCodeAt(0)
    if (code === 0) return true
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return true
  }

  return false
}

const hasCrewBidStructure = (text: string): boolean =>
  /^Period:\s*.+$/m.test(text)
  && /^Seniority\s+\d+\s+Category\s+\S+\s+Employee #\s+\S+/m.test(text)
  && /\b(Default|Current) Bid\b/.test(text)

export const validateCrewBidImportFile = ({
  buffer,
  filename,
  mimetype,
}: ValidateCrewBidImportFileInput): ValidateCrewBidImportFileResult => {
  if (!hasTxtExtension(filename)) {
    return {
      success: false,
      message: 'Crew bid import file must be a .txt file.',
    }
  }

  if (!ALLOWED_MIME_TYPES.has(normalizeMimeType(mimetype))) {
    return {
      success: false,
      message: 'Crew bid import file type is not allowed.',
    }
  }

  let sourceText: string
  try {
    sourceText = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return {
      success: false,
      message: 'Crew bid import file must be valid UTF-8 text.',
    }
  }

  if (sourceText.charCodeAt(0) === 0xFEFF) {
    sourceText = sourceText.slice(1)
  }

  if (!sourceText.trim()) {
    return {
      success: false,
      message: 'file is required and must not be empty.',
    }
  }

  if (containsDisallowedControlCharacter(sourceText) || !hasCrewBidStructure(sourceText)) {
    return {
      success: false,
      message: 'Crew bid import file format is invalid.',
    }
  }

  return {
    success: true,
    sourceText,
  }
}
