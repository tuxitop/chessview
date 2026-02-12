// src/board-manager.ts
import { Chess } from 'chess.js';
import { Chessground } from 'chessground';
import { Api } from 'chessground/api';
import { Config } from 'chessground/config';
import { Color, Key } from 'chessground/types';

import {
  ChessViewSettings,
  ParsedChessData,
  MoveData,
  Arrow,
  Circle,
  BOARD_THEMES,
  NAG_CLASSES
} from './types';
import {
  isValidSquare,
  getValidMoves,
  isInCheck,
  squareToPosition
} from './utils';

export class BoardManager {
  private ground: Api | null = null;
  private boardEl: HTMLElement | null = null;
  private boardWrapperEl: HTMLElement | null = null;
  private nagOverlayEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;

  private isFlipped: boolean;
  private settings: ChessViewSettings;
  private data: ParsedChessData;
  private container: HTMLElement;

  // Style tracking for cleanup
  private _appliedStyleProps: string[] = [];

  constructor(
    container: HTMLElement,
    settings: ChessViewSettings,
    data: ParsedChessData,
    isFlipped: boolean
  ) {
    this.container = container;
    this.settings = settings;
    this.data = data;
    this.isFlipped = isFlipped;
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  createBoard(boardSection: HTMLElement): void {
    this.boardWrapperEl = boardSection;
    this.boardEl = boardSection.createDiv({ cls: 'cv-board cg-wrap' });
    this.applyBoardSize();
    this.createNagOverlay(boardSection);
    this.setupResizeObserver();
  }

  initChessground(
    chess: Chess,
    onUserMove?: (orig: Key, dest: Key) => void
  ): void {
    if (!this.boardEl) return;

    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    const isEditable =
      this.data.isEditable && !this.data.isStatic && !this.data.isPuzzle;

    const config: Config = {
      fen: chess.fen(),
      orientation: this.isFlipped ? 'black' : 'white',
      viewOnly: this.data.isStatic,
      coordinates: this.settings.showCoordinates,
      highlight: { lastMove: true, check: true },
      animation: {
        enabled: this.settings.animationSpeed > 0,
        duration: this.settings.animationSpeed
      },
      movable:
        isEditable && onUserMove
          ? {
              free: false,
              color: 'both' as Color,
              dests: getValidMoves(chess),
              showDests: true,
              events: { after: onUserMove }
            }
          : { free: false, color: undefined },
      premovable: { enabled: false },
      drawable: {
        enabled: true,
        visible: true,
        autoShapes: this.getAutoShapes(null, 0, [])
      }
    };

    this.ground = Chessground(this.boardEl, config);
  }

  // ===========================================================================
  // BOARD STATE UPDATES
  // ===========================================================================

  syncBoard(
    chess: Chess,
    lastMove: MoveData | null,
    options?: {
      movable?: Config['movable'];
      moves?: MoveData[];
      currentMoveIndex?: number;
    }
  ): void {
    if (!this.ground) return;

    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    const inCheck = isInCheck(chess);

    this.ground.set({
      fen: chess.fen(),
      turnColor: turn,
      check: inCheck,
      lastMove: lastMove
        ? [lastMove.from as Key, lastMove.to as Key]
        : undefined,
      movable: options?.movable,
      drawable: {
        autoShapes: this.getAutoShapes(
          options?.moves ?? null,
          options?.currentMoveIndex ?? 0,
          []
        )
      }
    });
  }

  /**
   * Full board sync after a user/game move with editable movable config.
   */
  syncAfterMove(
    chess: Chess,
    move: { from: string; to: string },
    moves: MoveData[],
    currentMoveIndex: number
  ): void {
    if (!this.ground) return;

    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    const inCheck = isInCheck(chess);

    this.ground.set({
      fen: chess.fen(),
      turnColor: turn,
      check: inCheck,
      lastMove: [move.from as Key, move.to as Key],
      movable: {
        color: 'both' as Color,
        dests: getValidMoves(chess)
      },
      drawable: {
        autoShapes: this.getAutoShapes(moves, currentMoveIndex, [])
      }
    });
  }

  /**
   * Sync for puzzle mode — no last move display for wrong attempts.
   */
  syncPuzzleBoard(chess: Chess, playedMoves: MoveData[]): void {
    if (!this.ground) return;

    const turn: Color = chess.turn() === 'w' ? 'white' : 'black';
    const inCheck = isInCheck(chess);

    const lastPlayed =
      playedMoves.length > 0 ? playedMoves[playedMoves.length - 1] : null;

    const showLastMove =
      lastPlayed && lastPlayed.comment !== 'wrong'
        ? [lastPlayed.from as Key, lastPlayed.to as Key]
        : undefined;

    this.ground.set({
      fen: chess.fen(),
      turnColor: turn,
      check: inCheck,
      lastMove: showLastMove as [Key, Key] | undefined,
      drawable: { autoShapes: this.getAutoShapes(null, 0, []) }
    });
  }

  // ===========================================================================
  // MOVABLE CONFIG (for puzzle & editable)
  // ===========================================================================

  enablePuzzleInput(
    chess: Chess,
    playerColor: Color,
    handler: (orig: Key, dest: Key) => void
  ): void {
    if (!this.ground) return;
    this.ground.set({
      movable: {
        free: false,
        color: playerColor,
        dests: getValidMoves(chess),
        showDests: true,
        events: { after: handler }
      }
    });
  }

  disableInput(): void {
    if (!this.ground) return;
    this.ground.set({
      movable: { color: undefined, dests: new Map() }
    });
  }

  setEditableMovable(
    chess: Chess,
    handler: (orig: Key, dest: Key) => void
  ): void {
    if (!this.ground) return;
    this.ground.set({
      movable: {
        free: false,
        color: 'both' as Color,
        dests: getValidMoves(chess),
        showDests: true,
        events: { after: handler }
      }
    });
  }

  // ===========================================================================
  // ORIENTATION
  // ===========================================================================

  get flipped(): boolean {
    return this.isFlipped;
  }

  flipBoard(): void {
    this.isFlipped = !this.isFlipped;
    this.ground?.toggleOrientation();
  }

  // ===========================================================================
  // SHAPES (arrows, circles)
  // ===========================================================================

  getAutoShapes(
    moves: MoveData[] | null,
    currentMoveIndex: number,
    _extra: any[]
  ): any[] {
    const shapes: any[] = [];
    const defaultArrowColor = this.settings.arrowColor || 'green';
    const defaultCircleColor = this.settings.circleColor || 'green';

    for (const arrow of this.data.arrows) {
      if (isValidSquare(arrow.from) && isValidSquare(arrow.to)) {
        shapes.push({
          orig: arrow.from as Key,
          dest: arrow.to as Key,
          brush: arrow.color || defaultArrowColor
        });
      }
    }

    for (const circle of this.data.circles) {
      if (isValidSquare(circle.square)) {
        shapes.push({
          orig: circle.square as Key,
          brush: circle.color || defaultCircleColor
        });
      }
    }

    // Move-specific annotations (non-puzzle)
    if (
      !this.data.isPuzzle &&
      moves &&
      currentMoveIndex > 0 &&
      moves[currentMoveIndex - 1]?.annotations
    ) {
      const ann = moves[currentMoveIndex - 1].annotations!;
      for (const arrow of ann.arrows) {
        if (isValidSquare(arrow.from) && isValidSquare(arrow.to)) {
          shapes.push({
            orig: arrow.from as Key,
            dest: arrow.to as Key,
            brush: arrow.color || defaultArrowColor
          });
        }
      }
      for (const circle of ann.circles) {
        if (isValidSquare(circle.square)) {
          shapes.push({
            orig: circle.square as Key,
            brush: circle.color || defaultCircleColor
          });
        }
      }
    }

    return shapes;
  }

  setAutoShapes(shapes: any[]): void {
    this.ground?.setAutoShapes(shapes);
  }

  // ===========================================================================
  // HINT HIGHLIGHT (puzzle)
  // ===========================================================================

  showHintHighlight(
    square: string,
    moves: MoveData[] | null,
    currentMoveIndex: number,
    durationMs: number
  ): void {
    if (!this.ground) return;
    const baseShapes = this.getAutoShapes(moves, currentMoveIndex, []);
    this.ground.setAutoShapes([
      ...baseShapes,
      { orig: square as Key, brush: 'yellow' }
    ]);

    setTimeout(() => {
      if (this.ground) {
        this.ground.setAutoShapes(
          this.getAutoShapes(moves, currentMoveIndex, [])
        );
      }
    }, durationMs);
  }

  // ===========================================================================
  // NAG OVERLAY
  // ===========================================================================

  private createNagOverlay(boardSection: HTMLElement): void {
    this.nagOverlayEl = boardSection.createDiv({ cls: 'cv-nag-overlay' });
  }

  updateNagOverlay(moves: MoveData[], currentMoveIndex: number): void {
    if (!this.nagOverlayEl) return;
    this.nagOverlayEl.empty();

    if (currentMoveIndex <= 0) return;

    const move = moves[currentMoveIndex - 1];
    if (!move?.nag) return;

    const nagClass = NAG_CLASSES[move.nag];
    if (!nagClass) return;

    const square = move.to;
    const pos = squareToPosition(square, this.isFlipped);
    if (!pos) return;

    const glyph = this.nagOverlayEl.createDiv({
      cls: `cv-nag-glyph ${nagClass}`
    });
    glyph.style.left = `${pos.x}%`;
    glyph.style.top = `${pos.y}%`;

    glyph.createSpan({
      cls: 'cv-nag-glyph-inner',
      text: move.nag
    });
  }

  updateNagHighlight(moves: MoveData[], currentMoveIndex: number): void {
    // Clear previous highlight
    delete this.container.dataset.nagHighlight;

    if (currentMoveIndex <= 0) return;

    const move = moves[currentMoveIndex - 1];
    if (!move?.nag) return;

    const nagClass = NAG_CLASSES[move.nag];
    if (!nagClass) return;

    const highlightName = nagClass.replace('nag-', '');
    this.container.dataset.nagHighlight = highlightName;
  }

  // ===========================================================================
  // BOARD SIZE
  // ===========================================================================

  private applyBoardSize(): void {
    if (!this.boardEl) return;
    const size = this.settings.boardSize;
    this.boardEl.addClass(`cv-board-${size}`);
  }

  private setupResizeObserver(): void {
    if (!this.boardEl) return;

    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0 && this.boardEl) {
          this.boardEl.style.height = `${width}px`;
          this.ground?.redrawAll();
          this.container.style.setProperty('--cv-board-height', `${width}px`);
        }
      }
    });

    // Always observe so move list height stays synced
    if (this.boardEl && this.resizeObserver) {
      this.resizeObserver.observe(this.boardEl);
    }
  }

  // ===========================================================================
  // THEME / APPEARANCE
  // ===========================================================================

  applyTheme(): void {
    const theme = this.settings.boardTheme;
    const colors =
      theme === 'custom'
        ? {
            light: this.settings.lightSquareColor,
            dark: this.settings.darkSquareColor
          }
        : BOARD_THEMES[theme];

    this.container.style.setProperty('--cv-light', colors.light);
    this.container.style.setProperty('--cv-dark', colors.dark);
    this._appliedStyleProps.push('--cv-light', '--cv-dark');

    this.container.dataset.theme = theme;

    // Generate board SVG dynamically for ALL themes
    const lightHex = colors.light.replace('#', '%23');
    const darkHex = colors.dark.replace('#', '%23');
    const svg = this.generateBoardSvg(lightHex, darkHex);
    this.container.style.setProperty(
      '--cv-board-svg',
      `url('data:image/svg+xml,${svg}')`
    );
    this._appliedStyleProps.push('--cv-board-svg');
  }

  applyPieceSet(): void {
    this.container.dataset.pieceSet = this.settings.pieceSet;
    // Everything is now handled by CSS
  }

  private generateBoardSvg(light: string, dark: string): string {
    const darkSquares: string[] = [];
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        if ((r + f) % 2 === 1) {
          darkSquares.push(`<rect x="${f}" y="${r}" width="1" height="1"/>`);
        }
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges"><rect width="8" height="8" fill="${light}"/><g fill="${dark}">${darkSquares.join('')}</g></svg>`;
  }

  // ===========================================================================
  // PROMOTION DIALOG
  // ===========================================================================

  /**
   * Check if a move is a promotion and show dialog if so.
   * Returns the chosen promotion piece letter, or 'q' for non-promotions.
   */
  async getPromotion(chess: Chess, orig: Key, dest: Key): Promise<string> {
    const validMoves = chess.moves({ verbose: true }) as Array<{
      from: string;
      to: string;
      flags: string;
      promotion?: string;
    }>;

    const isPromotion = validMoves.some(
      (m) => m.from === orig && m.to === dest && m.flags.includes('p')
    );

    if (!isPromotion) return 'q';

    return this.showPromotionDialog(
      dest,
      chess.turn() === 'w' ? 'white' : 'black'
    );
  }

  private showPromotionDialog(square: Key, color: string): Promise<string> {
    return new Promise((resolve) => {
      if (!this.boardWrapperEl) {
        resolve('q');
        return;
      }

      const overlay = this.boardWrapperEl.createDiv({
        cls: 'cv-promotion-overlay'
      });

      const dialog = overlay.createDiv({ cls: 'cv-promotion-dialog' });

      // Position near the promotion square
      const pos = squareToPosition(square, this.isFlipped);
      if (pos) {
        dialog.style.left = `${pos.x + 6.25}%`;
        dialog.style.top = this.isFlipped
          ? `${pos.y}%`
          : `${Math.max(0, pos.y - 37.5)}%`;
      }

      const pieceNames: Record<string, string> = {
        q: 'queen',
        r: 'rook',
        b: 'bishop',
        n: 'knight'
      };

      for (const piece of ['q', 'r', 'b', 'n']) {
        const btn = dialog.createDiv({
          cls: `cv-promotion-piece piece ${color} ${pieceNames[piece]}`,
          attr: { 'aria-label': pieceNames[piece], title: pieceNames[piece] }
        });
        btn.onclick = (e) => {
          e.stopPropagation();
          overlay.remove();
          resolve(piece);
        };
      }

      // Click outside to cancel (default queen)
      overlay.onclick = () => {
        overlay.remove();
        resolve('q');
      };
    });
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  destroy(): void {
    delete this.container.dataset.nagHighlight;

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    for (const prop of this._appliedStyleProps) {
      this.container.style.removeProperty(prop);
    }
    this._appliedStyleProps = [];

    const pieceStyle = this.container.querySelector('.cv-piece-style');
    if (pieceStyle) pieceStyle.remove();

    delete this.container.dataset.theme;
    delete this.container.dataset.pieceSet;

    if (this.ground) {
      this.ground.destroy();
      this.ground = null;
    }

    this.boardEl = null;
    this.boardWrapperEl = null;
    this.nagOverlayEl = null;
  }
}
