// src/types.ts
// ============================================================================
// SETTINGS TYPES
// ============================================================================

export interface ChessViewSettings {
  boardTheme: BoardTheme;
  boardSize: BoardSize;
  pieceSet: PieceSet;
  notationType: NotationType;
  showCoordinates: boolean;
  coordinatePosition: 'inside' | 'outside';
  lightSquareColor: string;
  darkSquareColor: string;
  lastMoveHighlightColor: string;
  checkHighlightColor: string;
  selectedSquareColor: string;
  arrowColor: string;
  circleColor: string;
  animationSpeed: number;
  autoPlaySpeed: number;
  showMoveList: boolean;
  moveListPosition: 'right' | 'bottom';
  showAnalysisLinks: boolean;
  defaultOrientation: 'white' | 'black' | 'auto';
  puzzleShowHints: boolean;
  puzzleSuccessColor: string;
  puzzleFailColor: string;
}

export type BoardTheme =
  | 'brown'
  | 'blue'
  | 'green'
  | 'purple'
  | 'gray'
  | 'wood'
  | 'marble'
  | 'custom';

export type BoardSize = 'small' | 'medium' | 'large' | 'auto';

export type PieceSet =
  | 'cburnett'
  | 'merida'
  | 'alpha'
  | 'pirouetti'
  | 'spatial'
  | 'california'
  | 'cardinal'
  | 'dubrovny'
  | 'fantasy'
  | 'gioco'
  | 'governor'
  | 'horsey'
  | 'icpieces'
  | 'kosal'
  | 'leipzig'
  | 'maestro'
  | 'staunty'
  | 'tatiana'
  | 'chess7';

export type NotationType = 'figurine' | 'letter';

export const DEFAULT_SETTINGS: ChessViewSettings = {
  boardTheme: 'brown',
  boardSize: 'medium',
  pieceSet: 'cburnett',
  notationType: 'figurine',
  showCoordinates: true,
  coordinatePosition: 'outside',
  lightSquareColor: '#f0d9b5',
  darkSquareColor: '#b58863',
  lastMoveHighlightColor: 'rgba(155, 199, 0, 0.41)',
  checkHighlightColor: 'rgba(255, 0, 0, 0.5)',
  selectedSquareColor: 'rgba(20, 85, 30, 0.5)',
  arrowColor: 'rgba(0, 128, 0, 0.8)',
  circleColor: 'rgba(0, 128, 0, 0.8)',
  animationSpeed: 200,
  autoPlaySpeed: 1000,
  showMoveList: true,
  moveListPosition: 'right',
  showAnalysisLinks: true,
  defaultOrientation: 'auto',
  puzzleShowHints: true,
  puzzleSuccessColor: '#4CAF50',
  puzzleFailColor: '#f44336'
};

export const BOARD_THEMES: Record<BoardTheme, { light: string; dark: string }> =
  {
    brown: { light: '#f0d9b5', dark: '#b58863' },
    blue: { light: '#dee3e6', dark: '#8ca2ad' },
    green: { light: '#ffffdd', dark: '#86a666' },
    purple: { light: '#e8e0f0', dark: '#9070a0' },
    gray: { light: '#cccccc', dark: '#888888' },
    wood: { light: '#e8c99b', dark: '#a67d4b' },
    marble: { light: '#f5f5f5', dark: '#a0a0a0' },
    custom: { light: '#f0d9b5', dark: '#b58863' }
  };

export const BOARD_SIZES: Record<BoardSize, { base: number; label: string }> = {
  small: { base: 280, label: 'Small (280px)' },
  medium: { base: 360, label: 'Medium (360px)' },
  large: { base: 480, label: 'Large (480px)' },
  auto: { base: 0, label: 'Auto (fit container)' }
};

export interface ParsedChessData {
  type: 'game' | 'puzzle' | 'fen';
  fen: string | null;
  pgn: string | null;
  moves: MoveNode[];
  orientation: 'white' | 'black';
  isStatic: boolean;
  isEditable: boolean;
  isPuzzle: boolean;
  playerColor: 'white' | 'black';
  solutionMoves: MoveData[];
  puzzleRating: number | null;
  puzzleThemes: string[];
  puzzleTitle: string | null;
  headers: Record<string, string>;
  arrows: Arrow[];
  circles: Circle[];
  highlights: Highlight[];
  startMove: number;
  error: string | null;
  warnings: string[];
}

export interface Arrow {
  from: string;
  to: string;
  color?: string;
}

export interface Circle {
  square: string;
  color?: string;
}

export interface Highlight {
  square: string;
  color?: string;
}

export interface MoveAnnotation {
  arrows: Arrow[];
  circles: Circle[];
  highlights: Highlight[];
}

export interface MoveData {
  san: string;
  from: string;
  to: string;
  fen: string;
  comment?: string;
  nag?: string;
  annotations?: MoveAnnotation;
}

export interface MoveNode {
  san: string;
  from: string;
  to: string;
  fen: string;
  comment?: string;
  nag?: string;
  annotations?: MoveAnnotation;
  variations: MoveNode[][];
}

// ============================================================================
// NAG DEFINITIONS — single source of truth
// ============================================================================

export interface NagDefinition {
  /** PGN numeric code, e.g. '$1' */
  readonly code: string;
  /** Display symbol, e.g. '!' */
  readonly symbol: string;
  /** Valid inline PGN suffix, e.g. '!' — null if only expressible as $N */
  readonly inlinePgn: string | null;
  /** Human-readable label */
  readonly label: string;
  /** CSS class name (without 'nag-' prefix is NOT stripped — full class) */
  readonly cssClass: string;
}

export const NAG_DEFINITIONS: readonly NagDefinition[] = [
  { code: '$1',  symbol: '!',  inlinePgn: '!',  label: 'Great move',              cssClass: 'nag-good' },
  { code: '$2',  symbol: '?',  inlinePgn: '?',  label: 'Mistake',                 cssClass: 'nag-mistake' },
  { code: '$3',  symbol: '!!', inlinePgn: '!!', label: 'Brilliant move',           cssClass: 'nag-brilliant' },
  { code: '$4',  symbol: '??', inlinePgn: '??', label: 'Blunder',                  cssClass: 'nag-blunder' },
  { code: '$5',  symbol: '!?', inlinePgn: '!?', label: 'Interesting move',         cssClass: 'nag-interesting' },
  { code: '$6',  symbol: '?!', inlinePgn: '?!', label: 'Inaccuracy',              cssClass: 'nag-inaccuracy' },
  { code: '$7',  symbol: '□',  inlinePgn: null, label: 'Forced move',             cssClass: 'nag-forced' },
  { code: '$9',  symbol: '✕',  inlinePgn: null, label: 'Miss',                    cssClass: 'nag-miss' },
  { code: '$10', symbol: '=',  inlinePgn: null, label: 'Equal position',          cssClass: 'nag-equal' },
  { code: '$13', symbol: '∞',  inlinePgn: null, label: 'Unclear position',        cssClass: 'nag-unclear' },
  { code: '$14', symbol: '⩲',  inlinePgn: null, label: 'White is slightly better', cssClass: 'nag-white-slight' },
  { code: '$15', symbol: '⩱',  inlinePgn: null, label: 'Black is slightly better', cssClass: 'nag-black-slight' },
  { code: '$16', symbol: '±',  inlinePgn: null, label: 'White is better',          cssClass: 'nag-white-better' },
  { code: '$17', symbol: '∓',  inlinePgn: null, label: 'Black is better',          cssClass: 'nag-black-better' },
  { code: '$18', symbol: '+−', inlinePgn: null, label: 'White is winning',         cssClass: 'nag-white-winning' },
  { code: '$19', symbol: '−+', inlinePgn: null, label: 'Black is winning',         cssClass: 'nag-black-winning' },
];

// Derived lookup maps

/** Look up by PGN code: '$1' → NagDefinition */
export const NAG_BY_CODE: Readonly<Record<string, NagDefinition>> = (() => {
  const map: Record<string, NagDefinition> = {};
  for (const def of NAG_DEFINITIONS) {
    map[def.code] = def;
  }
  return map;
})();

/** Look up by inline PGN suffix: '!' → NagDefinition, '!?' → NagDefinition */
export const NAG_BY_INLINE: Readonly<Record<string, NagDefinition>> = (() => {
  const map: Record<string, NagDefinition> = {};
  for (const def of NAG_DEFINITIONS) {
    if (def.inlinePgn) {
      map[def.inlinePgn] = def;
    }
  }
  return map;
})();

/** Look up by display symbol: '!' → NagDefinition */
export const NAG_BY_SYMBOL: Readonly<Record<string, NagDefinition>> = (() => {
  const map: Record<string, NagDefinition> = {};
  for (const def of NAG_DEFINITIONS) {
    map[def.symbol] = def;
  }
  return map;
})();

/**
 * Resolve a NAG code to its definition.
 * Accepts '$1', '!', '!!', etc.
 */
export function resolveNag(nag: string): NagDefinition | undefined {
  return NAG_BY_CODE[nag] ?? NAG_BY_INLINE[nag] ?? NAG_BY_SYMBOL[nag];
}

export const FIGURINE_NOTATION: Record<string, string> = {
  K: '♔',
  Q: '♕',
  R: '♖',
  B: '♗',
  N: '♘',
  k: '♚',
  q: '♛',
  r: '♜',
  b: '♝',
  n: '♞'
};

export const ANNOTATION_COLORS: Record<string, string> = {
  R: 'red',
  G: 'green',
  B: 'blue',
  Y: 'yellow',
  O: 'orange',
  P: 'purple',
  red: 'red',
  green: 'green',
  blue: 'blue',
  yellow: 'yellow',
  orange: 'orange',
  purple: 'purple'
};

// ============================================================================
// UI LABELS
// ============================================================================

export const UI_LABELS = {
  // Navigation
  firstMove: '⏮',
  previousMove: '◀',
  nextMove: '▶',
  lastMove: '⏭',
  play: '▶',
  pause: '⏸',
  flipBoard: '⇅',

  // Navigation tooltips
  firstMoveTooltip: 'First move (Home)',
  previousMoveTooltip: 'Previous move (←)',
  nextMoveTooltip: 'Next move (→)',
  lastMoveTooltip: 'Last move (End)',
  playTooltip: 'Play (space)',
  pauseTooltip: 'Pause (space)',
  flipTooltip: 'Flip board',

  // Menu
  menuTooltip: 'More actions',
  menuCopy: '📋 Copy PGN/FEN',
  menuLichess: '♞ Analyze on Lichess',
  menuChessCom: '♟ Analyze on Chess.com',

  // Header
  puzzleLabel: 'Puzzle',
  ratingPrefix: 'Rating: ',
  defaultHeader: 'Chess position',

  // Error
  errorTitle: '⚠️ Error',
  errorDetails: 'Details',
  errorNoInput: 'No input',

  // Puzzle header status
  puzzleHeaderPlaying: (color: string) => `${color} to move`,
  puzzleHeaderSolved: '✓ Solved!',
  puzzleHeaderFailed: '✗ Incorrect',
  puzzleHeaderWaiting: 'Watch...',

  // Puzzle footer buttons (icon-only with tooltips)
  hintIcon: '💡',
  hintTooltip: 'Hint',
  showSolutionIcon: '👁',
  showSolutionTooltip: 'Show solution',
  hideSolutionIcon: '🙈',
  hideSolutionTooltip: 'Hide solution',
  retryIcon: '↺',
  retryTooltip: 'Retry',

  // Puzzle move list
  solvePuzzle: 'Solve the puzzle...',
  movePlaceholder: '...',
  playerWhite: 'White',
  playerBlack: 'Black',
} as const;

// ============================================================================
// TIMING CONSTANTS
// ============================================================================

/** Delay before auto-playing opponent's first move in puzzle mode (ms) */
export const PUZZLE_OPPONENT_FIRST_MOVE_DELAY = 600;

/** Delay before auto-playing opponent's response in puzzle mode (ms) */
export const PUZZLE_OPPONENT_RESPONSE_DELAY = 400;

/** Duration of hint highlight on board (ms) */
export const HINT_HIGHLIGHT_DURATION = 2000;

/** Duration of clipboard copy success indicator (ms) */
export const COPY_FEEDBACK_DURATION = 1000;

/** Duration of clipboard copy failure indicator (ms) */
export const COPY_FAILURE_DURATION = 2000;

/** Percentage width of one square on the board */
export const SQUARE_SIZE_PERCENT = 12.5;

/** Minimum width needed for move list panel beside board (px) */
export const MOVE_LIST_PANEL_WIDTH = 200;