// src/parser.ts
import { Chess } from 'chess.js';
import {
  ParsedChessData,
  MoveData,
  MoveNode,
  MoveAnnotation,
  ANNOTATION_COLORS,
  NAG_BY_CODE,
  NAG_BY_INLINE,
} from './types';

const SEPARATOR = '---';

// =========================================================================
// ENTRY POINT
// =========================================================================

export function parseChessInput(source: string): ParsedChessData {
  const result: ParsedChessData = {
    type: 'game',
    fen: null,
    pgn: null,
    moves: [],
    orientation: 'white',
    isStatic: false,
    isEditable: true,
    isPuzzle: false,
    playerColor: 'white',
    solutionMoves: [],
    puzzleRating: null,
    puzzleThemes: [],
    puzzleTitle: null,
    headers: {},
    arrows: [],
    circles: [],
    highlights: [],
    startMove: 0,
    error: null,
    warnings: []
  };

  try {
    const cleaned = source.trim();
    const { markers, chessData } = splitSections(cleaned);

    for (const line of markers) {
      parseMarkerLine(line, result);
    }

    if (!chessData) {
      result.error = 'No FEN or PGN data provided';
      return result;
    }

    parseChessData(chessData, result);

    if (result.isPuzzle && !result.error) {
      const hasOrientationMarker = markers.some(
        (l) => /^\[(white|black|flip)\]$/i.test(l)
      );
      finalizePuzzle(result, hasOrientationMarker);
    }

    return result;
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'Unknown parsing error';
    return result;
  }
}

// =========================================================================
// SECTION SPLITTING
// =========================================================================

function splitSections(source: string): {
  markers: string[];
  chessData: string;
} {
  const lines = source.split(/\r?\n/);
  const sepLineIndex = lines.findIndex((l) => l.trim() === SEPARATOR);

  if (sepLineIndex !== -1) {
    const markerLines = lines
      .slice(0, sepLineIndex)
      .map((l) => l.trim())
      .filter((l) => l);
    const chessData = lines
      .slice(sepLineIndex + 1)
      .join('\n')
      .trim();

    return { markers: markerLines, chessData };
  }

  const markers: string[] = [];
  const chessLines: string[] = [];
  let inChessData = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inChessData && !trimmed) continue;

    if (!inChessData && isMarkerLine(trimmed)) {
      markers.push(trimmed);
    } else {
      inChessData = true;
      chessLines.push(line);
    }
  }

  return { markers, chessData: chessLines.join('\n').trim() };
}

function isMarkerLine(line: string): boolean {
  return (
    /^\[(white|black|flip|static|noeditable|puzzle)\]$/i.test(line) ||
    /^\[(ply|rating|themes|title|arrow|circle|highlight)\s*:\s*[^\]]+\]$/i.test(
      line
    )
  );
}

// =========================================================================
// CHESS DATA PARSING
// =========================================================================

function parseChessData(
  chessData: string,
  result: ParsedChessData
): void {
  const hasPgnHeaders = /\[\w+\s+"[^"]*"\]/.test(chessData);
  const cleanedForDetection = chessData
    .replace(/\[[^\]]*"[^\]]*\]/g, '')
    .trim();
  const firstToken = cleanedForDetection.split(/\s+/)[0] ?? '';
  const isFen =
    !hasPgnHeaders &&
    firstToken.split('/').length === 8 &&
    /^[rnbqkpRNBQKP1-8/]+$/.test(firstToken);

  if (isFen) {
    result.type = 'fen';
    result.fen = normalizeFen(chessData.trim());
    const validation = validateFen(result.fen);
    if (!validation.valid) {
      result.error = 'Invalid FEN: ' + validation.error;
    }
  } else {
    result.type = result.isPuzzle ? 'puzzle' : 'game';
    result.pgn = chessData;

    const fenHeader = chessData.match(/\[FEN\s+"([^"]+)"\]/i);
    if (fenHeader) {
      result.fen = normalizeFen(fenHeader[1]);
      const validation = validateFen(result.fen);
      if (!validation.valid) {
        result.error = 'Invalid FEN: ' + validation.error;
      }
    }

    const headerMatches = chessData.matchAll(/\[(\w+)\s+"([^"]+)"\]/g);
    for (const match of headerMatches) {
      result.headers[match[1]] = match[2];
    }

    if (result.isPuzzle) {
      result.solutionMoves = parseFlatMoves(
        chessData,
        result.fen,
        result.warnings
      );
    } else {
      result.moves = parseMovesWithVariations(
        chessData,
        result.fen,
        result.warnings
      );
    }
  }
}

// =========================================================================
// PUZZLE FINALIZATION
// =========================================================================

function finalizePuzzle(
  result: ParsedChessData,
  hasOrientationMarker: boolean
): void {
  if (result.type === 'fen') {
    result.error = 'Puzzle requires PGN with moves, not just a FEN position';
    return;
  }

  if (result.solutionMoves.length === 0) {
    result.error = 'Puzzle has no valid moves';
    return;
  }

  result.isEditable = false;

  const fenTurn = result.fen
    ? result.fen.split(/\s+/)[1] === 'b'
      ? 'black'
      : 'white'
    : 'white';

  if (result.solutionMoves.length % 2 === 0) {
    result.playerColor = fenTurn === 'white' ? 'black' : 'white';
  } else {
    result.playerColor = fenTurn;
  }

  if (!hasOrientationMarker) {
    result.orientation = result.playerColor;
  }
}

// =========================================================================
// MARKER PARSING
// =========================================================================

function parseMarkerLine(line: string, result: ParsedChessData): void {
  const kvMatch = line.match(/^\[(\w+)\s*:\s*([^\]]+)\]$/i);
  if (kvMatch) {
    const key = kvMatch[1].toLowerCase();
    const value = kvMatch[2].trim();

    switch (key) {
    case 'rating':
      result.puzzleRating = parseInt(value) || null;
      break;
    case 'themes':
      result.puzzleThemes = value.split(/[,\s]+/).filter((t) => t);
      break;
    case 'title':
      result.puzzleTitle = value;
      break;
    case 'ply':
      result.startMove = parseInt(value) || 0;
      break;
    }
  }

  if (/^\[puzzle\]$/i.test(line)) {
    result.isPuzzle = true;
  } else if (/^\[(?:black|flip)\]$/i.test(line)) {
    result.orientation = 'black';
  } else if (/^\[white\]$/i.test(line)) {
    result.orientation = 'white';
  } else if (/^\[static\]$/i.test(line)) {
    result.isStatic = true;
    result.isEditable = false;
  } else if (/^\[noeditable\]$/i.test(line)) {
    result.isEditable = false;
  }

  parseAnnotationMarker(line, result);
}

function parseAnnotationMarker(
  marker: string,
  result: ParsedChessData
): void {
  const arrowMatch = marker.match(
    /^\[arrow\s*:\s*([a-h][1-8])[-]?([a-h][1-8])(?:\s+(\w+))?\]$/i
  );
  if (arrowMatch) {
    result.arrows.push({
      from: arrowMatch[1].toLowerCase(),
      to: arrowMatch[2].toLowerCase(),
      color: arrowMatch[3]
        ? ANNOTATION_COLORS[arrowMatch[3]] ?? arrowMatch[3]
        : undefined
    });
  }

  const circleMatch = marker.match(
    /^\[circle\s*:\s*([a-h][1-8])(?:\s+(\w+))?\]$/i
  );
  if (circleMatch) {
    result.circles.push({
      square: circleMatch[1].toLowerCase(),
      color: circleMatch[2]
        ? ANNOTATION_COLORS[circleMatch[2]] ?? circleMatch[2]
        : undefined
    });
  }

  const highlightMatch = marker.match(
    /^\[highlight\s*:\s*([a-h][1-8])(?:\s+(\w+))?\]$/i
  );
  if (highlightMatch) {
    result.highlights.push({
      square: highlightMatch[1].toLowerCase(),
      color: highlightMatch[2]
        ? ANNOTATION_COLORS[highlightMatch[2]] ?? highlightMatch[2]
        : undefined
    });
  }
}

// =========================================================================
// TOKENIZER
// =========================================================================

interface PgnToken {
  type: 'move' | 'comment' | 'nag' | 'open_variation' | 'close_variation';
  value: string;
}

function tokenizePgn(pgn: string): PgnToken[] {
  let cleaned = pgn.replace(/\[[^\]]*"[^\]]*"\]/g, '');
  cleaned = cleaned
    .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '')
    .trim();

  const tokens: PgnToken[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Skip move numbers: digits followed by dots
    if (/\d/.test(ch)) {
      let j = i;
      while (j < cleaned.length && /[\d.]/.test(cleaned[j])) j++;
      const segment = cleaned.slice(i, j);
      if (/^\d+\.+$/.test(segment)) {
        i = j;
        continue;
      }
    }

    // Comment
    if (ch === '{') {
      const end = cleaned.indexOf('}', i + 1);
      if (end === -1) {
        i++;
        continue;
      }
      tokens.push({ type: 'comment', value: cleaned.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }

    // NAG
    if (ch === '$') {
      let j = i + 1;
      while (j < cleaned.length && /\d/.test(cleaned[j])) j++;
      tokens.push({ type: 'nag', value: cleaned.slice(i, j) });
      i = j;
      continue;
    }

    // Open variation
    if (ch === '(') {
      tokens.push({ type: 'open_variation', value: '(' });
      i++;
      continue;
    }

    // Close variation
    if (ch === ')') {
      tokens.push({ type: 'close_variation', value: ')' });
      i++;
      continue;
    }

    // Move (SAN)
    if (/[a-hKQRBNO]/.test(ch)) {
      let j = i;
      while (
        j < cleaned.length &&
        !/[\s{}()$]/.test(cleaned[j])
      ) {
        j++;
      }
      const moveStr = cleaned.slice(i, j);
      tokens.push({ type: 'move', value: moveStr });
      i = j;
      continue;
    }

    // Skip anything else
    i++;
  }

  return tokens;
}

// =========================================================================
// INLINE NAG EXTRACTION
// =========================================================================

/**
 * Extract inline NAG suffix from a move string.
 * Returns the NAG code (e.g. '$1') and the cleaned move string.
 */
function extractInlineNag(moveStr: string): { move: string; nagCode: string | undefined } {
  const nagSuffix = moveStr.match(/([!?]{1,2})$/);
  if (!nagSuffix) return { move: moveStr, nagCode: undefined };

  const inline = nagSuffix[1];
  const def = NAG_BY_INLINE[inline];
  if (!def) return { move: moveStr, nagCode: undefined };

  return {
    move: moveStr.replace(/[!?]+$/, ''),
    nagCode: def.code
  };
}

// =========================================================================
// TREE MOVE PARSING (for games with variations)
// =========================================================================

export function parseMovesWithVariations(
  pgn: string,
  startFen: string | null,
  warnings?: string[]
): MoveNode[] {
  const tokens = tokenizePgn(pgn);

  const rootChess = new Chess();
  if (startFen) {
    try {
      rootChess.load(normalizeFen(startFen));
    } catch {
      return [];
    }
  }

  interface ParseFrame {
    chess: Chess;
    moves: MoveNode[];
    parentMoves: MoveNode[] | null;
    branchFromIndex: number;
  }

  const stack: ParseFrame[] = [];
  let currentMoves: MoveNode[] = [];
  let chess = rootChess;
  let pendingComment: string | undefined;
  let pendingAnnotation: MoveAnnotation | undefined;
  let pendingNag: string | undefined;

  for (const token of tokens) {
    switch (token.type) {
    case 'comment': {
      const content = token.value;
      const annotation = parseCommentAnnotations(content);
      const textComment = content
        .replace(/\[%cal\s+[^\]]+\]/gi, '')
        .replace(/\[%csl\s+[^\]]+\]/gi, '')
        .trim();

      if (currentMoves.length > 0) {
        const lastMove = currentMoves[currentMoves.length - 1];
        if (textComment) lastMove.comment = textComment;
        if (annotation.arrows.length > 0 || annotation.circles.length > 0) {
          lastMove.annotations = mergeAnnotations(
            lastMove.annotations,
            annotation
          );
        }
      } else {
        pendingComment = textComment || undefined;
        pendingAnnotation =
            annotation.arrows.length > 0 || annotation.circles.length > 0
              ? annotation
              : undefined;
      }
      break;
    }

    case 'nag': {
      const def = NAG_BY_CODE[token.value];
      if (def) {
        if (currentMoves.length > 0) {
          currentMoves[currentMoves.length - 1].nag = def.code;
        } else {
          pendingNag = def.code;
        }
      }
      break;
    }

    case 'open_variation': {
      if (currentMoves.length === 0) break;

      const branchIndex = currentMoves.length - 1;
      const branchFen = branchIndex > 0
        ? currentMoves[branchIndex - 1].fen
        : (startFen ? normalizeFen(startFen) : new Chess().fen());

      stack.push({
        chess,
        moves: currentMoves,
        parentMoves: currentMoves,
        branchFromIndex: branchIndex
      });

      const varChess = new Chess();
      try {
        varChess.load(branchFen);
      } catch {
        break;
      }
      chess = varChess;
      currentMoves = [];
      pendingComment = undefined;
      pendingAnnotation = undefined;
      pendingNag = undefined;
      break;
    }

    case 'close_variation': {
      if (stack.length === 0) break;

      const frame = stack.pop()!;

      if (currentMoves.length > 0 && frame.parentMoves) {
        const parentMove = frame.parentMoves[frame.branchFromIndex];
        if (parentMove) {
          parentMove.variations.push(currentMoves);
        }
      }

      chess = frame.chess;
      currentMoves = frame.moves;
      pendingComment = undefined;
      pendingAnnotation = undefined;
      pendingNag = undefined;
      break;
    }

    case 'move': {
      const { move: moveStr, nagCode: inlineNagCode } = extractInlineNag(token.value);

      try {
        const result = chess.move(moveStr, { sloppy: true });
        if (!result) continue;

        const node: MoveNode = {
          san: result.san,
          from: result.from,
          to: result.to,
          fen: chess.fen(),
          comment: pendingComment,
          nag: pendingNag,
          annotations: pendingAnnotation,
          variations: []
        };

        if (inlineNagCode) {
          node.nag = inlineNagCode;
        }

        currentMoves.push(node);
        pendingComment = undefined;
        pendingAnnotation = undefined;
        pendingNag = undefined;
      } catch {
        if (warnings) {
          warnings.push(
            `Skipped invalid move "${moveStr}" after ${currentMoves.length} moves`
          );
        }
      }
      break;
    }
    }
  }

  // Close any unclosed variations
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (currentMoves.length > 0 && frame.parentMoves) {
      const parentMove = frame.parentMoves[frame.branchFromIndex];
      if (parentMove) {
        parentMove.variations.push(currentMoves);
      }
    }
    chess = frame.chess;
    currentMoves = frame.moves;
  }

  return currentMoves;
}

// =========================================================================
// FLAT MOVE PARSING (for puzzles — no variations)
// =========================================================================

export function parseFlatMoves(
  pgn: string,
  startFen: string | null,
  warnings?: string[]
): MoveData[] {
  const chess = new Chess();
  const moves: MoveData[] = [];

  if (startFen) {
    try {
      chess.load(normalizeFen(startFen));
    } catch {
      return moves;
    }
  }

  let cleaned = pgn.replace(/\[[^\]]*"[^\]]*"\]/g, '');
  cleaned = stripVariations(cleaned);
  cleaned = cleaned
    .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const tokenRegex =
    /(\{[^}]*\})|(\$\d+)|([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?(?:[!?]{1,2})?|O-O-O[!?]{0,2}|O-O[!?]{0,2})/g;
  let match;
  let pendingComment: string | undefined;
  let pendingAnnotation: MoveAnnotation | undefined;
  let pendingNag: string | undefined;

  while ((match = tokenRegex.exec(cleaned)) !== null) {
    const token = match[0];

    if (token.startsWith('{') && token.endsWith('}')) {
      const content = token.slice(1, -1).trim();
      const annotation = parseCommentAnnotations(content);
      const textComment = content
        .replace(/\[%cal\s+[^\]]+\]/gi, '')
        .replace(/\[%csl\s+[^\]]+\]/gi, '')
        .trim();

      if (moves.length > 0) {
        const lastMove = moves[moves.length - 1];
        if (textComment) lastMove.comment = textComment;
        if (annotation.arrows.length > 0 || annotation.circles.length > 0) {
          lastMove.annotations = mergeAnnotations(
            lastMove.annotations,
            annotation
          );
        }
      } else {
        pendingComment = textComment || undefined;
        pendingAnnotation =
          annotation.arrows.length > 0 || annotation.circles.length > 0
            ? annotation
            : undefined;
      }
    } else if (token.startsWith('$')) {
      const def = NAG_BY_CODE[token];
      if (def) {
        if (moves.length > 0) {
          moves[moves.length - 1].nag = def.code;
        } else {
          pendingNag = def.code;
        }
      }
    } else {
      const { move: moveStr, nagCode: inlineNagCode } = extractInlineNag(token);

      try {
        const result = chess.move(moveStr, { sloppy: true });
        if (!result) continue;

        const moveData: MoveData = {
          san: result.san,
          from: result.from,
          to: result.to,
          fen: chess.fen(),
          comment: pendingComment,
          nag: pendingNag,
          annotations: pendingAnnotation
        };

        if (inlineNagCode) {
          moveData.nag = inlineNagCode;
        }

        moves.push(moveData);
        pendingComment = undefined;
        pendingAnnotation = undefined;
        pendingNag = undefined;
      } catch {
        if (warnings) {
          warnings.push(
            `Skipped invalid move "${moveStr}" after ${moves.length} moves`
          );
        }
      }
    }
  }

  return moves;
}

// =========================================================================
// COMMENT ANNOTATIONS
// =========================================================================

export function parseCommentAnnotations(comment: string): MoveAnnotation {
  const annotation: MoveAnnotation = {
    arrows: [],
    circles: [],
    highlights: []
  };

  const calMatch = comment.match(/\[%cal\s+([^\]]+)\]/i);
  if (calMatch) {
    const defs = calMatch[1].split(',');
    for (const def of defs) {
      const m = def.trim().match(/^([RGBYOP]?)([a-h][1-8])([a-h][1-8])$/i);
      if (m) {
        annotation.arrows.push({
          from: m[2].toLowerCase(),
          to: m[3].toLowerCase(),
          color: m[1]
            ? ANNOTATION_COLORS[m[1].toUpperCase()] ?? 'green'
            : 'green'
        });
      }
    }
  }

  const cslMatch = comment.match(/\[%csl\s+([^\]]+)\]/i);
  if (cslMatch) {
    const defs = cslMatch[1].split(',');
    for (const def of defs) {
      const m = def.trim().match(/^([RGBYOP]?)([a-h][1-8])$/i);
      if (m) {
        annotation.circles.push({
          square: m[2].toLowerCase(),
          color: m[1]
            ? ANNOTATION_COLORS[m[1].toUpperCase()] ?? 'green'
            : 'green'
        });
      }
    }
  }

  return annotation;
}

function mergeAnnotations(
  existing: MoveAnnotation | undefined,
  incoming: MoveAnnotation
): MoveAnnotation {
  if (!existing) return incoming;
  return {
    arrows: [...existing.arrows, ...incoming.arrows],
    circles: [...existing.circles, ...incoming.circles],
    highlights: [...existing.highlights, ...incoming.highlights]
  };
}

// =========================================================================
// UTILITIES
// =========================================================================

function stripVariations(text: string): string {
  let result = '';
  let depth = 0;
  let inComment = false;

  for (const ch of text) {
    if (ch === '{' && depth === 0) {
      inComment = true;
      result += ch;
      continue;
    }
    if (ch === '}' && inComment) {
      inComment = false;
      result += ch;
      continue;
    }
    if (inComment) {
      result += ch;
      continue;
    }

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

export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length === 0 || parts[0].split('/').length !== 8) return fen;

  const position = parts[0];
  const turn = parts[1] ?? 'w';
  const castling = parts[2] ?? '-';
  const enPassant = parts[3] ?? '-';
  const halfMove = parts[4] ?? '0';
  const fullMove = parts[5] ?? '1';

  return `${position} ${turn} ${castling} ${enPassant} ${halfMove} ${fullMove}`;
}

export function validateFen(fen: string): { valid: boolean; error?: string } {
  const chess = new Chess();

  if (typeof chess.validate_fen === 'function') {
    const result = chess.validate_fen(fen);
    return {
      valid: result.valid,
      error: result.valid ? undefined : result.error
    };
  }

  try {
    const loaded = chess.load(fen);
    if (loaded === false) {
      return { valid: false, error: 'Invalid FEN position' };
    }
    return { valid: true };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid FEN'
    };
  }
}

export function generateAnalysisUrls(data: ParsedChessData): {
  lichess: string;
  chessCom: string;
} {
  const isFlipped = data.orientation === 'black';
  const colorParam = isFlipped ? '?color=black' : '?color=white';
  const flipParam = isFlipped ? '&flip=true' : '';

  let lichessUrl: string;
  let chessComUrl: string;

  if (data.type === 'fen' && data.fen) {
    const fenForLichess = data.fen.replace(/\s+/g, '_');
    lichessUrl = `https://lichess.org/analysis/${fenForLichess}${colorParam}`;
    chessComUrl = `https://www.chess.com/analysis?fen=${encodeURIComponent(data.fen)}${flipParam}`;
  } else {
    const movesSan = flattenMainLine(data.moves)
      .map((m) => m.san)
      .join(' ');
    const fallback = data.solutionMoves.map((m) => m.san).join(' ');
    const san = movesSan || fallback;
    const pgnForUrl = data.fen
      ? `[SetUp "1"][FEN "${data.fen}"] ${san}`
      : san;

    lichessUrl = `https://lichess.org/analysis/pgn/${encodeURIComponent(pgnForUrl)}${colorParam}`;
    chessComUrl = `https://www.chess.com/analysis?pgn=${encodeURIComponent(pgnForUrl)}${flipParam}`;
  }

  return { lichess: lichessUrl, chessCom: chessComUrl };
}

/** Flatten main line MoveNodes to just san strings (ignoring variations) */
function flattenMainLine(moves: readonly MoveNode[]): MoveNode[] {
  return moves.map((m) => m);
}