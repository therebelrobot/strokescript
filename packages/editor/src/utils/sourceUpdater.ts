/**
 * Update or insert a metadata key-value pair in the score source text.
 * Returns the modified source string.
 *
 * Logic:
 * 1. If a `---` separator exists, look for the key in the header (lines before `---`).
 *    - If found, replace that line.
 *    - If not found, insert the line just before `---`.
 * 2. If no separator exists (single-voice mode), convert to score format:
 *    - Add metadata line + `---` before content.
 *    - If the content is a bare sequence (no voice name prefix), prefix with `A: `.
 */
export function updateMetadata(
  source: string,
  key: string,
  value: string,
): string {
  const lines = source.split('\n');
  const separatorIndex = lines.findIndex((l) => l.trim() === '---');

  if (separatorIndex >= 0) {
    // Score format already has a header section
    return updateExistingHeader(lines, separatorIndex, key, value);
  }

  // No separator — convert to score format
  return convertToScoreFormat(lines, key, value);
}

/** Regex to match a metadata line for the given key (e.g. `rpm:`, `shaft-diameter:`) */
function metadataLineRegex(key: string): RegExp {
  // Match key at start of line, optional whitespace, then colon
  return new RegExp(`^\\s*${escapeRegex(key)}\\s*:`, 'i');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function updateExistingHeader(
  lines: string[],
  separatorIndex: number,
  key: string,
  value: string,
): string {
  const regex = metadataLineRegex(key);

  // Search only in the header section (before ---)
  for (let i = 0; i < separatorIndex; i++) {
    if (regex.test(lines[i])) {
      // Replace existing line
      lines[i] = `${key}: ${value}`;
      return lines.join('\n');
    }
  }

  // Key not found in header — insert before the separator line.
  // Find the best insertion point: after the last metadata line,
  // before any blank lines or custom curve defs that precede ---.
  let insertAt = separatorIndex;

  // Walk backwards from separator to find a good spot
  // Skip blank lines right before ---
  while (insertAt > 0 && lines[insertAt - 1].trim() === '') {
    insertAt--;
  }

  // If insertAt is 0 or at a custom curve def (@name = ...), insert before that
  // We want metadata lines grouped together at the top
  // Find the first non-metadata, non-blank line in the header
  let lastMetaLine = -1;
  for (let i = 0; i < separatorIndex; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('@')) break; // custom curve defs come after metadata
    if (/^\S[\w-]*\s*:/.test(trimmed)) {
      lastMetaLine = i;
    }
  }

  if (lastMetaLine >= 0) {
    insertAt = lastMetaLine + 1;
  } else {
    // No existing metadata lines — insert at the very top
    insertAt = 0;
  }

  lines.splice(insertAt, 0, `${key}: ${value}`);
  return lines.join('\n');
}

function convertToScoreFormat(
  lines: string[],
  key: string,
  value: string,
): string {
  // Check if the content already has named voices (e.g. `A: [...]`)
  const hasNamedVoice = lines.some((l) =>
    /^\s*[A-Za-z_]\w*\s*:/.test(l) && !isMetadataLine(l),
  );

  const headerLine = `${key}: ${value}`;

  if (hasNamedVoice) {
    // Already has named voices, just prepend header + separator
    return [headerLine, '---', ...lines].join('\n');
  }

  // Bare sequence — prefix with `A: ` for the content
  const content = lines.join('\n').trim();
  if (content === '') {
    return [headerLine, '---', ''].join('\n');
  }

  return [headerLine, '---', `A: ${content}`].join('\n');
}

/** Check if a line looks like a metadata line (key: value) rather than a voice */
function isMetadataLine(line: string): boolean {
  const trimmed = line.trim();
  // Metadata keys are typically short lowercase words/hyphenated
  // Voice names are followed by sequence content like [ or primitives
  const match = trimmed.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)/);
  if (!match) return false;
  const val = match[2].trim();
  // If the value starts with [ or is a primitive pattern, it's a voice
  if (val.startsWith('[') || /^[SDLEHQ]\d/.test(val)) return false;
  // If the value contains a reference like A@0.5, it's a voice
  if (/^[A-Za-z_]\w*@/.test(val)) return false;
  return true;
}
