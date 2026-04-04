/**
 * Text-to-path renderer — converts text to SVG paths using opentype.js.
 *
 * Uses a proper font library to extract glyph outlines and render them as
 * filled SVG paths, producing clean, readable text ideal for laser cutting:
 *   - Proper filled glyphs (not stroke-based)
 *   - Crisp rendering at any scale
 *   - Clean SVG path data compatible with all cutting software
 *   - Uses Roboto Mono from Google Fonts CDN for clean, readable letterforms
 */

import * as opentype from 'opentype.js';

// Font from jsDelivr CDN - WOFF format (opentype.js supports TTF, OTF, and WOFF but not WOFF2)
// DejaVu Mono from @fontsource package (verified package on npm/jsdelivr)
const FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/dejavu-mono@5.2.5/files/dejavu-mono-latin-400-normal.woff';

// Cache for the loaded font
let cachedFont: opentype.Font | null = null;

/**
 * Load the font from CDN. Returns cached font if already loaded.
 */
async function loadFont(): Promise<opentype.Font> {
  if (cachedFont) return cachedFont;

  try {
    // Fetch the font file and parse it with opentype
    // opentype.parse() auto-detects format (TTF, OTF, WOFF)
    const response = await fetch(FONT_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch font: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    cachedFont = opentype.parse(arrayBuffer);
    return cachedFont;
  } catch (error) {
    console.error('[textToPath] Failed to load font:', error);
    throw error;
  }
}

/**
 * Options for text-to-path rendering.
 */
export interface TextToPathOptions {
  /** Font size in mm (cap height = fontSize) */
  fontSize: number;
  /** Fill color. Default: #333 */
  fill?: string;
  /** Text anchor: 'start' | 'middle' | 'end'. Default: 'start' */
  textAnchor?: 'start' | 'middle' | 'end';
}

/**
 * Calculate the width of text at a given font size.
 */
function calculateTextWidth(font: opentype.Font, text: string, fontSize: number): number {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const glyph = font.charToGlyph(char);
    width += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
  }
  return width;
}

/**
 * Convert a string of text to SVG path elements.
 *
 * Uses opentype.js to extract proper filled glyph outlines from a font,
 * producing clean SVG paths ideal for laser cutting.
 *
 * @param text    Text content to render
 * @param x       X position (subject to textAnchor)
 * @param y       Y position (text baseline)
 * @param options Rendering options
 * @returns SVG path element string with class "text-path"
 */
export async function textToPath(
  text: string,
  x: number,
  y: number,
  options: TextToPathOptions,
): Promise<string> {
  const font = await loadFont();
  const { fontSize, fill = '#333', textAnchor = 'start' } = options;

  // Get the total width for text alignment
  const totalWidth = calculateTextWidth(font, text, fontSize);

  let offsetX: number;
  switch (textAnchor) {
    case 'middle':
      offsetX = x - totalWidth / 2;
      break;
    case 'end':
      offsetX = x - totalWidth;
      break;
    default:
      offsetX = x;
  }

  // Generate path commands for each glyph
  const pathCommands: string[] = [];
  let cursorX = offsetX;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const glyph = font.charToGlyph(char);

    if (char === ' ') {
      // Space: advance cursor by whitespace width
      cursorX += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
      continue;
    }

    const path = glyph.getPath(cursorX, y, fontSize);

    // Convert path to SVG path data
    let pathData = '';
    for (const cmd of path.commands) {
      switch (cmd.type) {
        case 'M':
          pathData += `M${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'L':
          pathData += `L${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'Q':
          pathData += `Q${cmd.x1.toFixed(4)},${cmd.y1.toFixed(4)} ${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'C':
          pathData += `C${cmd.x1.toFixed(4)},${cmd.y1.toFixed(4)} ${cmd.x2.toFixed(4)},${cmd.y2.toFixed(4)} ${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'Z':
          pathData += 'Z ';
          break;
      }
    }

    // Close the path for proper fill
    pathData = pathData.trim() + 'Z ';

    pathCommands.push(`<path class="text-path" fill="${fill}" d="${pathData.trim()}"/>`);

    // Advance cursor for next glyph
    cursorX += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
  }

  return pathCommands.join('');
}

/**
 * Synchronous version that requires font to be pre-loaded.
 * Throws if font is not yet loaded.
 */
export function textToPathSync(
  text: string,
  x: number,
  y: number,
  options: TextToPathOptions,
): string {
  if (!cachedFont) {
    throw new Error('[textToPath] Font not loaded. Call textToPath() first or pre-load with loadFont().');
  }

  const font = cachedFont;
  const { fontSize, fill = '#333', textAnchor = 'start' } = options;

  const totalWidth = calculateTextWidth(font, text, fontSize);

  let offsetX: number;
  switch (textAnchor) {
    case 'middle':
      offsetX = x - totalWidth / 2;
      break;
    case 'end':
      offsetX = x - totalWidth;
      break;
    default:
      offsetX = x;
  }

  const pathCommands: string[] = [];
  let cursorX = offsetX;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const glyph = font.charToGlyph(char);

    if (char === ' ') {
      cursorX += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
      continue;
    }

    const path = glyph.getPath(cursorX, y, fontSize);

    let pathData = '';
    for (const cmd of path.commands) {
      switch (cmd.type) {
        case 'M':
          pathData += `M${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'L':
          pathData += `L${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'Q':
          pathData += `Q${cmd.x1.toFixed(4)},${cmd.y1.toFixed(4)} ${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'C':
          pathData += `C${cmd.x1.toFixed(4)},${cmd.y1.toFixed(4)} ${cmd.x2.toFixed(4)},${cmd.y2.toFixed(4)} ${cmd.x.toFixed(4)},${cmd.y.toFixed(4)} `;
          break;
        case 'Z':
          pathData += 'Z ';
          break;
      }
    }

    pathData = pathData.trim() + 'Z ';
    pathCommands.push(`<path class="text-path" fill="${fill}" d="${pathData.trim()}"/>`);

    cursorX += (glyph.advanceWidth ?? 0) * (fontSize / font.unitsPerEm);
  }

  return pathCommands.join('');
}

/**
 * Pre-load the font so subsequent calls to textToPathSync work without async.
 */
export async function preloadFont(): Promise<void> {
  await loadFont();
}

/**
 * Legacy export name for backward compatibility with existing imports.
 */
export const strokeText = textToPath;
