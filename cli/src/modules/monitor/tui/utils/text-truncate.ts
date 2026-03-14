/**
 * Unicode-aware text truncation utilities
 */

/**
 * Get the display width of a string, accounting for wide characters
 * (CJK characters, emojis) that take 2 cells
 */
export function getDisplayWidth(str: string): number {
  let width = 0;
  for (const char of str) {
    const code = char.codePointAt(0) ?? 0;

    // Wide characters (CJK, emojis, etc.)
    if (
      (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
      (code >= 0x2e80 && code <= 0x9fff) || // CJK
      (code >= 0xac00 && code <= 0xd7af) || // Hangul syllables
      (code >= 0xf900 && code <= 0xfaff) || // CJK compatibility
      (code >= 0xfe10 && code <= 0xfe1f) || // Vertical forms
      (code >= 0xfe30 && code <= 0xfe6f) || // CJK compatibility forms
      (code >= 0xff00 && code <= 0xff60) || // Fullwidth forms
      (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
      (code >= 0x1f300 && code <= 0x1f64f) || // Misc symbols, emoticons
      (code >= 0x1f680 && code <= 0x1f6ff) || // Transport symbols
      (code >= 0x1f900 && code <= 0x1f9ff) // Supplemental symbols
    ) {
      width += 2;
    } else if (code >= 0x20 && code < 0x7f) {
      // ASCII printable
      width += 1;
    } else if (code >= 0xa0) {
      // Other non-control characters
      width += 1;
    }
    // Control characters (< 0x20) and some others contribute 0 width
  }
  return width;
}

/**
 * Truncate a string to a maximum display width, adding ellipsis if needed
 */
export function truncate(str: string, maxWidth: number, ellipsis: string = '...'): string {
  const strWidth = getDisplayWidth(str);

  if (strWidth <= maxWidth) {
    return str;
  }

  const ellipsisWidth = getDisplayWidth(ellipsis);
  const targetWidth = maxWidth - ellipsisWidth;

  if (targetWidth <= 0) {
    return ellipsis.slice(0, maxWidth);
  }

  let result = '';
  let currentWidth = 0;

  for (const char of str) {
    const charWidth = getDisplayWidth(char);
    if (currentWidth + charWidth > targetWidth) {
      break;
    }
    result += char;
    currentWidth += charWidth;
  }

  return result + ellipsis;
}

/**
 * Truncate from the middle of a string
 */
export function truncateMiddle(str: string, maxWidth: number, separator: string = '...'): string {
  const strWidth = getDisplayWidth(str);

  if (strWidth <= maxWidth) {
    return str;
  }

  const sepWidth = getDisplayWidth(separator);
  const sideWidth = Math.floor((maxWidth - sepWidth) / 2);

  if (sideWidth <= 0) {
    return separator.slice(0, maxWidth);
  }

  // Get left side
  let leftPart = '';
  let leftWidth = 0;
  for (const char of str) {
    const charWidth = getDisplayWidth(char);
    if (leftWidth + charWidth > sideWidth) {
      break;
    }
    leftPart += char;
    leftWidth += charWidth;
  }

  // Get right side (from end)
  const chars = Array.from(str);
  let rightPart = '';
  let rightWidth = 0;
  for (let i = chars.length - 1; i >= 0; i--) {
    const char = chars[i];
    const charWidth = getDisplayWidth(char);
    if (rightWidth + charWidth > sideWidth) {
      break;
    }
    rightPart = char + rightPart;
    rightWidth += charWidth;
  }

  return leftPart + separator + rightPart;
}

/**
 * Pad a string to a target width, accounting for wide characters
 */
export function padEnd(str: string, targetWidth: number, padChar: string = ' '): string {
  const strWidth = getDisplayWidth(str);
  const padWidth = targetWidth - strWidth;

  if (padWidth <= 0) {
    return str;
  }

  return str + padChar.repeat(padWidth);
}

/**
 * Pad a string at the start to a target width
 */
export function padStart(str: string, targetWidth: number, padChar: string = ' '): string {
  const strWidth = getDisplayWidth(str);
  const padWidth = targetWidth - strWidth;

  if (padWidth <= 0) {
    return str;
  }

  return padChar.repeat(padWidth) + str;
}

/**
 * Truncate and pad a string to exactly match target width
 */
export function fitWidth(str: string, targetWidth: number, ellipsis: string = '...'): string {
  const truncated = truncate(str, targetWidth, ellipsis);
  return padEnd(truncated, targetWidth);
}

/**
 * Word wrap text to fit within a maximum width
 */
export function wordWrap(text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';
  let currentWidth = 0;

  for (const word of words) {
    const wordWidth = getDisplayWidth(word);
    const spaceWidth = currentLine ? 1 : 0;

    if (currentWidth + spaceWidth + wordWidth <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
      currentWidth += spaceWidth + wordWidth;
    } else {
      if (currentLine) {
        lines.push(currentLine);
      }
      // If word itself is too long, truncate it
      if (wordWidth > maxWidth) {
        currentLine = truncate(word, maxWidth);
        currentWidth = getDisplayWidth(currentLine);
      } else {
        currentLine = word;
        currentWidth = wordWidth;
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
