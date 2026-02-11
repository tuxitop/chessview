// src/utils.ts
import { Chess } from 'chess.js';
import { Key } from 'chessground/types';

/**
 * Validate a square string like "e4"
 */
export function isValidSquare(sq: string): boolean {
  return /^[a-h][1-8]$/.test(sq);
}

/**
 * Get all legal moves as a Map<from, to[]> for chessground
 */
export function getValidMoves(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  const allMoves = chess.moves({ verbose: true }) as Array<{
    from: string;
    to: string;
  }>;
  for (const move of allMoves) {
    const from = move.from as Key;
    const existing = dests.get(from);
    if (existing) {
      existing.push(move.to as Key);
    } else {
      dests.set(from, [move.to as Key]);
    }
  }
  return dests;
}

/**
 * Safely check if king is in check
 */
export function isInCheck(chess: Chess): boolean {
  try {
    return chess.in_check();
  } catch {
    return false;
  }
}

/**
 * Convert a square to percentage-based position on the board
 */
export function squareToPosition(
  square: string,
  isFlipped: boolean
): { x: number; y: number } | null {
  if (square.length !== 2) return null;
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]) - 1;
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;

  let x: number, y: number;
  if (isFlipped) {
    x = (7 - file) * 12.5;
    y = rank * 12.5;
  } else {
    x = file * 12.5;
    y = (7 - rank) * 12.5;
  }
  return { x, y };
}

/**
 * Strip nested variations (parenthesized text) using stack-based parsing.
 * Handles arbitrarily nested variations like (1. e4 (1... d5) d6).
 */
export function stripVariations(text: string): string {
  let result = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0) {
      result += ch;
    }
  }
  return result;
}
