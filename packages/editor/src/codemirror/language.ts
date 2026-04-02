import { StreamLanguage } from '@codemirror/language';

/**
 * StrokeScript StreamLanguage definition for CodeMirror 6 syntax highlighting.
 */
export const strokescriptLanguage = StreamLanguage.define({
  token(stream) {
    // Skip whitespace (but not newlines — handled by StreamLanguage)
    if (stream.eatSpace()) return null;

    // Comments: # to end of line
    if (stream.match('#')) {
      stream.skipToEnd();
      return 'comment';
    }

    // Separator: ---
    if (stream.match('---')) {
      return 'meta';
    }

    // Keywords: CW, CCW (standalone words)
    if (stream.match(/^(CCW|CW)(?=[\s\[\]:,)\]}]|$)/)) {
      return 'keyword';
    }

    // B(...) function-like syntax
    if (stream.match(/^B\(/)) {
      // Read until closing paren
      let depth = 1;
      while (!stream.eol() && depth > 0) {
        const ch = stream.next();
        if (ch === '(') depth++;
        if (ch === ')') depth--;
      }
      return 'string';
    }

    // Primitives: S, D, L, E, Q, H — when followed by a number, space, bracket, or at end
    if (stream.match(/^[SDLEQH](?=[0-9.\s\[\]@*:,)\]}]|$)/)) {
      return 'typeName';
    }

    // Numbers: integers and decimals
    if (stream.match(/^-?\d+(\.\d+)?/)) {
      return 'number';
    }

    // Brackets
    if (stream.match('[') || stream.match(']')) {
      return 'paren';
    }

    // Operators
    if (stream.match('@') || stream.match('*') || stream.match(':') || stream.match('=')) {
      return 'operator';
    }

    // Parentheses and comma (for B() definitions)
    if (stream.match('(') || stream.match(')') || stream.match(',')) {
      return 'operator';
    }

    // Identifiers: voice names, custom curve names (start with letter or @)
    if (stream.match(/^@?[a-zA-Z_][a-zA-Z0-9_]*/)) {
      return 'variableName';
    }

    // Consume any other character
    stream.next();
    return null;
  },
});
