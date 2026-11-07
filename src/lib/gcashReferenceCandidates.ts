// Extraction, ranking, and validation of GCash reference numbers from OCR text.
//
// GCash reference numbers are 13 digits and are displayed grouped as
// "1234 567 890123" next to a "Ref No." label. Phone numbers (11 digits, or 12
// with the 63 prefix), amounts (contain "," / "."), and dates never form a
// clean 13-digit value, so requiring exactly 13 digits is the main filter
// against grabbing unrelated numbers.

export const GCASH_REFERENCE_LENGTH = 13;
const MIN_CANDIDATE_SCORE = 10;

export type OcrLine = {
  text: string;
  /** Vertical center of the line within the cropped region, 0 (top) – 1. */
  centerY?: number;
};

export type RankedCandidate = {
  value: string;
  score: number;
  /** Number of OCR passes that produced this value. */
  hits: number;
  /** Found next to a "Ref No." style label. */
  labelled: boolean;
  /** Matched the "4 3 6" digit grouping GCash prints. */
  gcashGrouping: boolean;
};

const REFERENCE_LABEL =
  /\b(?:ref(?:erence)?\.?\s*(?:number|num|no|n0|#)?\.?|transaction\s*(?:id|number|no|#)|txn\s*(?:id|number|no|#))(?![a-z])/i;

// Context that suggests a line holds some other number. Only applied when the
// line carries no reference label (the GCash date sits on the "Ref No." row).
const UNRELATED_CONTEXT =
  /(\+\s?63|mobile|phone|contact|amount|total|php|₱|balance|fee|account)/i;

const DIGIT_LOOKALIKES: Record<string, string> = {
  O: "0", o: "0", Q: "0", D: "0",
  I: "1", l: "1", i: "1", "|": "1", "!": "1", "[": "1", "]": "1",
  Z: "2", z: "2",
  S: "5", s: "5",
  G: "6", b: "6",
  T: "7",
  B: "8",
  g: "9", q: "9",
};

export function normalizeGcashReference(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isValidGcashReference(value: string): boolean {
  return new RegExp(`^\\d{${GCASH_REFERENCE_LENGTH}}$`).test(
    normalizeGcashReference(value),
  );
}

/** "1234567890123" -> "1234 567 890123" (GCash's own display grouping). */
export function formatGcashReference(value: string): string {
  const digits = normalizeGcashReference(value);
  if (!isValidGcashReference(digits)) return value;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

/**
 * Fixes letter/digit confusions (O→0, l→1, S→5 …) but only inside tokens that
 * are already mostly digits, so words like "Nov" or "Sent" stay intact.
 */
function repairDigitTokens(line: string): string {
  return line.replace(/\S+/g, (token) => {
    const digitCount = (token.match(/\d/g) ?? []).length;
    if (digitCount < 2 || digitCount / token.length < 0.6) return token;
    return token.replace(/[A-Za-z|![\]]/g, (ch) => DIGIT_LOOKALIKES[ch] ?? ch);
  });
}

type DigitChain = { groups: string[]; positions: number[] };

/**
 * Splits a line into chains of digit groups. Groups may be separated by up to
 * two spaces or a hyphen (how OCR renders "1234 567 890123"); any other
 * character — letters, commas, colons, decimal points, wide gaps — breaks the
 * chain so the reference never merges with a neighbouring date or amount.
 */
function digitChains(line: string): DigitChain[] {
  const chains: DigitChain[] = [];
  const pattern = /\d+/g;
  let current: DigitChain | null = null;
  let lastEnd = -1;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    const separator = current ? line.slice(lastEnd, match.index) : "";
    const joinable = /^(?: {1,2}| ?- ?)$/.test(separator);

    if (!current || !joinable) {
      current = { groups: [], positions: [] };
      chains.push(current);
    }

    current.groups.push(match[0]);
    current.positions.push(match.index);
    lastEnd = match.index + match[0].length;
  }

  return chains;
}

type LineCandidate = Omit<RankedCandidate, "hits">;

function candidatesFromLine(
  rawText: string,
  centerY: number | undefined,
  previousLineLabelled: boolean,
): LineCandidate[] {
  const text = repairDigitTokens(rawText);
  const label = REFERENCE_LABEL.exec(text);
  const labelEnd = label ? label.index + label[0].length : -1;
  const found: LineCandidate[] = [];

  for (const chain of digitChains(text)) {
    for (let start = 0; start < chain.groups.length; start += 1) {
      let length = 0;

      for (let end = start; end < chain.groups.length; end += 1) {
        length += chain.groups[end].length;
        if (length > GCASH_REFERENCE_LENGTH) break;
        if (length < GCASH_REFERENCE_LENGTH) continue;

        const groups = chain.groups.slice(start, end + 1);
        const shape = groups.map((group) => group.length).join(",");
        const gcashGrouping = shape === "4,3,6";
        const extendsBeyond = start > 0 || end < chain.groups.length - 1;
        const labelledHere = label !== null && chain.positions[start] >= labelEnd;
        const labelled = labelledHere || (label === null && previousLineLabelled);

        let score = 10;
        if (gcashGrouping) score += 8;
        else if (groups.length === 1) score += 4;
        else score -= Math.max(0, groups.length - 3);
        if (extendsBeyond) score -= 3;
        if (labelledHere) score += 12;
        else if (labelled) score += 6;
        if (!label && UNRELATED_CONTEXT.test(text)) score -= 6;
        if (centerY !== undefined) {
          score += (1 - Math.min(1, Math.abs(centerY - 0.5) * 2)) * 3;
        }

        found.push({ value: groups.join(""), score, labelled, gcashGrouping });
      }
    }
  }

  return found;
}

/**
 * Ranks 13-digit reference candidates across one or more OCR passes. Values
 * read identically by several passes are boosted.
 */
export function rankGcashReferenceCandidates(
  passes: OcrLine[][],
): RankedCandidate[] {
  const byValue = new Map<string, RankedCandidate>();

  for (const lines of passes) {
    const seenThisPass = new Set<string>();

    lines.forEach((line, index) => {
      const previous = lines[index - 1];
      const previousLineLabelled =
        previous !== undefined &&
        REFERENCE_LABEL.test(previous.text) &&
        !/\d{3}/.test(previous.text);

      for (const candidate of candidatesFromLine(
        line.text,
        line.centerY,
        previousLineLabelled,
      )) {
        const existing = byValue.get(candidate.value);
        const firstHitThisPass = !seenThisPass.has(candidate.value);
        seenThisPass.add(candidate.value);

        if (!existing) {
          byValue.set(candidate.value, { ...candidate, hits: 1 });
          continue;
        }

        existing.score = Math.max(existing.score, candidate.score);
        existing.labelled ||= candidate.labelled;
        existing.gcashGrouping ||= candidate.gcashGrouping;
        if (firstHitThisPass) existing.hits += 1;
      }
    });
  }

  return [...byValue.values()]
    .map((candidate) => ({
      ...candidate,
      score: candidate.score + (candidate.hits - 1) * 4,
    }))
    // Discard weak matches (e.g. digits stitched together from a phone-number
    // row) instead of suggesting them.
    .filter((candidate) => candidate.score >= MIN_CANDIDATE_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/** Whether the best candidate is trustworthy enough to stop scanning early. */
export function isConfidentResult(ranked: RankedCandidate[]): boolean {
  const [best, runnerUp] = ranked;
  if (!best) return false;
  if (runnerUp && best.score - runnerUp.score < 4) return false;
  return best.labelled || best.hits >= 2;
}

/**
 * Groups OCR lines that sit on the same row (e.g. "Ref No." and the digits
 * detected as separate lines) into one line, left-to-right. Separate pieces
 * are joined by a wide gap so their digits never merge into one chain.
 */
export function mergeLinesIntoRows(
  lines: { text: string; top: number; bottom: number; left: number }[],
  regionHeight: number,
): OcrLine[] {
  const sorted = [...lines].sort((a, b) => a.top - b.top);
  const rows: { items: typeof lines; top: number; bottom: number }[] = [];

  for (const line of sorted) {
    const row = rows.find((candidate) => {
      const overlap =
        Math.min(candidate.bottom, line.bottom) -
        Math.max(candidate.top, line.top);
      const smaller = Math.min(
        candidate.bottom - candidate.top,
        line.bottom - line.top,
      );
      return smaller > 0 && overlap / smaller > 0.5;
    });

    if (row) {
      row.items.push(line);
      row.top = Math.min(row.top, line.top);
      row.bottom = Math.max(row.bottom, line.bottom);
    } else {
      rows.push({ items: [line], top: line.top, bottom: line.bottom });
    }
  }

  return rows
    .sort((a, b) => a.top - b.top)
    .map((row) => ({
      text: row.items
        .sort((a, b) => a.left - b.left)
        .map((item) => item.text)
        .join("   "),
      centerY:
        regionHeight > 0 ? (row.top + row.bottom) / 2 / regionHeight : undefined,
    }));
}
