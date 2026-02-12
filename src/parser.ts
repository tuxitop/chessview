import { Chess } from 'chess.js';
import { stripVariations } from './utils';
import {
  ParsedChessData,
  MoveData,
  MoveAnnotation,
  ANNOTATION_COLORS,
  NAG_SYMBOLS
} from './types';

const SEPARATOR = '---';

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
    result.isPuzzle = /^\[puzzle\]/im.test(cleaned);

    if (result.isPuzzle) {
      return parsePuzzle(cleaned, result);
    } else {
      return parseGame(cleaned, result);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : 'Unknown parsing error';
    return result;
  }
}

// =========================================================================
// PUZZLE PARSING
// =========================================================================

function parsePuzzle(source: string, result: ParsedChessData): ParsedChessData {
  result.type = 'puzzle';
  result.isEditable = false;

  const sepIndex = source.indexOf(SEPARATOR);
  let markerSection: string;
  let pgnSection: string;

  if (sepIndex !== -1) {
    markerSection = source.substring(0, sepIndex).trim();
    pgnSection = source.substring(sepIndex + SEPARATOR.length).trim();
  } else {
    // No separator — treat everything as markers, no PGN
    markerSection = source;
    pgnSection = '';
  }

  // Parse markers (before ---)
  const markerLines = markerSection
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l);

  for (const line of markerLines) {
    parseMarkerLine(line, result);
  }

  if (!pgnSection) {
    result.error = 'Puzzle has no PGN data after ---';
    return result;
  }

  // Parse PGN section (after ---) — standard PGN
  const fenHeader = pgnSection.match(/\[FEN\s+"([^"]+)"\]/i);
  if (fenHeader) {
    result.fen = normalizeFen(fenHeader[1]);
    const validation = validateFen(result.fen);
    if (!validation.valid) {
      result.error = 'Invalid FEN: ' + validation.error;
      return result;
    }
  }

  // Extract all PGN headers
  const headerMatches = pgnSection.matchAll(/\[(\w+)\s+"([^"]+)"\]/g);
  for (const match of headerMatches) {
    result.headers[match[1]] = match[2];
  }

  // Store raw PGN
  result.pgn = pgnSection;

  // Parse moves
  result.solutionMoves = parseMovesFromPgn(pgnSection, result.fen, result.warnings);

  if (result.solutionMoves.length === 0) {
    result.error = 'Puzzle has no valid moves';
    return result;
  }

  // Determine player color: the side that makes the LAST move
  const fenTurn = result.fen
    ? result.fen.split(/\s+/)[1] === 'b'
      ? 'black'
      : 'white'
    : 'white';

  if (result.solutionMoves.length % 2 === 0) {
    // Even number of moves: first move is opponent, last is player
    // Player is opposite of FEN turn
    result.playerColor = fenTurn === 'white' ? 'black' : 'white';
  } else {
    // Odd number of moves: first move is player, last is player
    // Player is same as FEN turn
    result.playerColor = fenTurn;
  }

  // Default orientation to player's side unless explicitly set
  if (!markerSection.match(/\[(white|black|flip)\]/i)) {
    result.orientation = result.playerColor;
  }

  return result;
}

// =========================================================================
// GAME PARSING
// =========================================================================

function parseGame(source: string, result: ParsedChessData): ParsedChessData {
  const lines = source.split(/\r?\n/);
  const markerLines: string[] = [];
  const chessLines: string[] = [];
  let inChessData = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!inChessData && !trimmed) continue;

    const isMarker =
      /^\[(white|black|flip|static|noeditable|debug)\]$/i.test(trimmed) ||
      /^\[move\s*:\s*\d+\]$/i.test(trimmed) ||
      /^\[arrow\s*:\s*[^\]]+\]$/i.test(trimmed) ||
      /^\[highlight\s*:\s*[^\]]+\]$/i.test(trimmed) ||
      /^\[circle\s*:\s*[^\]]+\]$/i.test(trimmed);

    if (!inChessData && isMarker) {
      markerLines.push(trimmed);
    } else {
      inChessData = true;
      chessLines.push(line);
    }
  }

  for (const marker of markerLines) {
    parseMarkerLine(marker, result);
  }

  const chessData = chessLines.join('\n').trim();

  const hasPgnHeaders = /\[\w+\s+"[^"]*"\]/.test(chessData);
  const cleanedForDetection = chessData
    .replace(/\[[^\]]*"[^\]]*\]/g, '')
    .trim();
  const firstToken = cleanedForDetection.split(/\s+/)[0] || '';
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
    result.type = 'game';
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

    result.moves = parseMovesFromPgn(chessData, result.fen, result.warnings);
  }

  return result;
}

// =========================================================================
// SHARED UTILITIES
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
    case 'move':
      result.startMove = parseInt(value) || 0;
      break;
    }
  }

  if (/^\[(?:black|flip)\]$/i.test(line)) {
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

function parseAnnotationMarker(marker: string, result: ParsedChessData): void {
  const arrowMatch = marker.match(
    /^\[arrow\s*:\s*([a-h][1-8])[-]?([a-h][1-8])(?:\s+(\w+))?\]$/i
  );
  if (arrowMatch) {
    result.arrows.push({
      from: arrowMatch[1].toLowerCase(),
      to: arrowMatch[2].toLowerCase(),
      color: arrowMatch[3]
        ? ANNOTATION_COLORS[arrowMatch[3]] || arrowMatch[3]
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
        ? ANNOTATION_COLORS[circleMatch[2]] || circleMatch[2]
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
        ? ANNOTATION_COLORS[highlightMatch[2]] || highlightMatch[2]
        : undefined
    });
  }
}

export function parseMovesFromPgn(
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
      const nagInfo = NAG_SYMBOLS[token];
      if (nagInfo) {
        if (moves.length > 0) {
          moves[moves.length - 1].nag = nagInfo.symbol;
        } else {
          pendingNag = nagInfo.symbol;
        }
      }
    } else {
      let moveStr = token;
      let inlineNag: string | undefined;

      const nagSuffix = moveStr.match(/([!?]{1,2})$/);
      if (nagSuffix) {
        inlineNag = nagSuffix[1];
        moveStr = moveStr.replace(/[!?]+$/, '');
      }

      try {
        const result = chess.move(moveStr, { sloppy: true });
        if (!result) continue;  // change from if (result) { ... } to guard clause
  
        const moveData: MoveData = {
          san: result.san,
          from: result.from,
          to: result.to,
          fen: chess.fen(),
          comment: pendingComment,
          nag: pendingNag,
          annotations: pendingAnnotation
        };

        if (inlineNag && NAG_SYMBOLS[inlineNag]) {
          moveData.nag = NAG_SYMBOLS[inlineNag].symbol;
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
            ? ANNOTATION_COLORS[m[1].toUpperCase()] || 'green'
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
            ? ANNOTATION_COLORS[m[1].toUpperCase()] || 'green'
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

export function normalizeFen(fen: string): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length === 0 || parts[0].split('/').length !== 8) return fen;

  const position = parts[0];
  const turn = parts[1] || 'w';
  const castling = parts[2] || '-';
  const enPassant = parts[3] || '-';
  const halfMove = parts[4] || '0';
  const fullMove = parts[5] || '1';

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
    const movesSan =
      data.moves.length > 0
        ? data.moves.map((m) => m.san).join(' ')
        : data.solutionMoves.map((m) => m.san).join(' ');
    const pgnForUrl = data.fen
      ? `[SetUp "1"][FEN "${data.fen}"] ${movesSan}`
      : movesSan;

    lichessUrl = `https://lichess.org/analysis/pgn/${encodeURIComponent(pgnForUrl)}${colorParam}`;
    chessComUrl = `https://www.chess.com/analysis?pgn=${encodeURIComponent(pgnForUrl)}${flipParam}`;
  }

  return { lichess: lichessUrl, chessCom: chessComUrl };
}
