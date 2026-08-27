import type {
  ParsedCrewBidBlock,
  ParsedCrewBidDocument,
  ParsedCrewBidPreference,
} from "./types.js";

const headerRegex = /^Seniority\s+(\d+)\s+Category\s+(\S+)\s+Employee #\s+(\S+)/;
const confirmationRegex = /\b(Default|Current) Bid\b/;
const preferenceRegex = /^\s*(\d+)\.\s+(.*\S)\s*$/;

const normalizePreferenceText = (value: string) => value.replace(/\s+/g, " ").trim();

const findGroupIndex = (
  text: string,
  currentGroupIndex: number | null,
) => {
  if (text === "Pairing Bid Group") {
    return (currentGroupIndex ?? 0) + 1;
  }

  return currentGroupIndex;
};

export const parseCrewBidTxt = (sourceText: string): ParsedCrewBidDocument => {
  const lines = sourceText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  let periodLabel: string | null = null;
  const blocks: ParsedCrewBidBlock[] = [];
  let pendingHeader: Omit<ParsedCrewBidBlock, "bidContext" | "preferences"> | null = null;
  let currentBlock: ParsedCrewBidBlock | null = null;
  let currentGroupIndex: number | null = null;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const periodMatch = line.match(/^Period:\s*(.+?)\s*$/);

    if (periodMatch) {
      periodLabel = periodMatch[1]?.trim() || null;
      return;
    }

    const headerMatch = line.match(headerRegex);

    if (headerMatch) {
      const seniorityValue = Number.parseInt(headerMatch[1] ?? "", 10);
      pendingHeader = {
        sourceStartLine: lineNumber,
        seniority: Number.isNaN(seniorityValue) ? null : seniorityValue,
        category: headerMatch[2] ?? "",
        crewId: headerMatch[3] ?? "",
      };
      currentBlock = null;
      currentGroupIndex = null;
      return;
    }

    const confirmationMatch = line.match(confirmationRegex);

    if (confirmationMatch && pendingHeader) {
      currentBlock = {
        ...pendingHeader,
        bidContext: confirmationMatch[1] === "Current" ? "Current" : "Default",
        preferences: [],
      };
      blocks.push(currentBlock);
      pendingHeader = null;
      currentGroupIndex = null;
      return;
    }

    if (!currentBlock) {
      return;
    }

    const preferenceMatch = line.match(preferenceRegex);

    if (!preferenceMatch) {
      return;
    }

    const sourceSeq = Number.parseInt(preferenceMatch[1] ?? "", 10);
    const rawText = normalizePreferenceText(preferenceMatch[2] ?? "");
    currentGroupIndex = findGroupIndex(rawText, currentGroupIndex);

    const preference: ParsedCrewBidPreference = {
      sourceLineNumber: lineNumber,
      sourceSeq,
      rawText,
      groupIndex: currentGroupIndex,
    };

    currentBlock.preferences.push(preference);
  });

  return {
    periodLabel,
    blocks,
  };
};
