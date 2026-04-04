export type {
  Position,
  Diagnostic,
  TokenType,
  Token,
  SegmentNode,
  GroupNode,
  VoiceNode,
  ReferenceNode,
  CustomCurveDefNode,
  ScoreHeaderNode,
  ScoreNode,
  Segment,
  Voice,
  Score,
  ShaftShape,
  ParseResult,
} from './types.js';

export { TokenType as TokenTypeEnum, SHAFT_ORIGIN_VALUES } from './types.js';
export { tokenize } from './tokenizer.js';
export { parseTokens } from './parser.js';
export { compile } from './compiler.js';
export { validate } from './validator.js';

import { tokenize } from './tokenizer.js';
import { parseTokens } from './parser.js';
import { compile } from './compiler.js';
import { validate } from './validator.js';
import type { ParseResult, Diagnostic } from './types.js';

/**
 * Parse a StrokeScript notation string through the full pipeline:
 * tokenize → parse → compile → validate → return ParseResult.
 */
export function parse(input: string): ParseResult {
  const diagnostics: Diagnostic[] = [];

  // Stage 1: Tokenize
  const { tokens, diagnostics: tokenDiags } = tokenize(input);
  diagnostics.push(...tokenDiags);

  // Stage 2: Parse (tokens → AST)
  const { ast, diagnostics: parseDiags } = parseTokens(tokens);
  diagnostics.push(...parseDiags);

  // If there are parse errors, still try to compile for partial results
  const hasErrors = diagnostics.some((d) => d.severity === 'error');

  // Stage 3: Compile (AST → IR)
  const { score, diagnostics: compileDiags } = compile(ast);
  diagnostics.push(...compileDiags);

  // Stage 4: Validate
  const validationDiags = validate(score);
  diagnostics.push(...validationDiags);

  // Return null score if there were critical errors
  const hasCriticalErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    score: hasCriticalErrors ? score : score, // always return score even with errors for partial results
    diagnostics,
  };
}
