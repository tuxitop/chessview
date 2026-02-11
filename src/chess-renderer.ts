// src/chess-renderer.ts
import { Chess } from 'chess.js';
import { Key } from 'chessground/types';

import { ChessViewSettings, ParsedChessData, MoveData } from './types';
import { generateAnalysisUrls } from './parser';
import { BoardManager } from './board-manager';
import { PuzzleController } from './puzzle-controller';
import { NavigationController } from './navigation-controller';

export class ChessRenderer {
  private container: HTMLElement;
  private settings: ChessViewSettings;
  private data: ParsedChessData;

  private chess: Chess;
  private startFen: string;
  private isFlipped: boolean = false;

  // Sub-controllers
  private board: BoardManager | null = null;
  private puzzle: PuzzleController | null = null;
  private nav: NavigationController | null = null;

  // Keyboard handler ref
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private destroyed: boolean = false;

  constructor(
    container: HTMLElement,
    data: ParsedChessData,
    settings: ChessViewSettings
  ) {
    this.container = container;
    this.data = data;
    this.settings = settings;
    this.chess = new Chess();

    // Orientation
    if (data.orientation === 'black') {
      this.isFlipped = true;
    } else if (data.orientation === 'white') {
      this.isFlipped = false;
    } else if (settings.defaultOrientation === 'black') {
      this.isFlipped = true;
    }

    // Load starting position
    if (data.fen) {
      try {
        this.chess.load(data.fen);
      } catch (e) {
        if (!data.error) {
          data.error = `Failed to load position: ${e instanceof Error ? e.message : 'Invalid FEN'}`;
        }
      }
    }

    // Auto orientation for non-puzzles
    if (
      settings.defaultOrientation === 'auto' &&
      !data.isPuzzle &&
      data.orientation === 'white'
    ) {
      this.isFlipped = this.chess.turn() === 'b';
    }

    // Puzzle orientation defaults to player's side
    if (data.isPuzzle && data.orientation === data.playerColor) {
      this.isFlipped = data.playerColor === 'black';
    }

    this.startFen = this.chess.fen();
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  render(): void {
    // Clean up any previous render
    this.destroy();
    this.destroyed = false;

    this.container.empty();
    this.container.addClass('chessview');

    if (this.data.error) {
      this.renderError(this.data.error);
      return;
    }

    // Re-initialize chess state
    this.chess = new Chess();
    if (this.data.fen) {
      try {
        this.chess.load(this.data.fen);
      } catch (e) {
        // already validated
      }
    }

    const mainContainer = this.container.createDiv({ cls: 'cv-container' });

    // Header
    this.renderHeader(mainContainer);

    // Content area
    const content = mainContainer.createDiv({ cls: 'cv-content' });
    if (this.settings.moveListPosition === 'bottom') {
      content.addClass('cv-content-vertical');
    }

    // Create board manager
    this.board = new BoardManager(
      this.container,
      this.settings,
      this.data,
      this.isFlipped
    );

    const boardSection = content.createDiv({ cls: 'cv-board-section' });
    this.board.createBoard(boardSection);

    if (this.data.isPuzzle) {
      // PUZZLE MODE
      this.puzzle = new PuzzleController(
        this.chess,
        this.data,
        this.settings,
        this.board,
        this.startFen
      );

      this.board.initChessground(this.chess);

      const movesSection = content.createDiv({ cls: 'cv-moves-section' });
      this.puzzle.createMoveList(movesSection);

      this.renderFooter(mainContainer);
      this.puzzle.createPuzzleUI(mainContainer);

      this.board.applyTheme();
      this.board.applyPieceSet();

      this.puzzle.start();
    } else {
      // GAME MODE
      this.nav = new NavigationController(
        this.chess,
        this.data,
        this.settings,
        this.board,
        this.startFen
      );

      this.board.initChessground(this.chess, (orig: Key, dest: Key) =>
        this.nav!.handleUserMove(orig, dest)
      );

      this.nav.createBranchOverlay(boardSection);

      if (this.settings.showMoveList && this.nav.moveCount > 0) {
        const movesSection = content.createDiv({ cls: 'cv-moves-section' });
        this.nav.createMoveList(movesSection);
      }

      this.renderFooter(mainContainer);

      this.board.applyTheme();
      this.board.applyPieceSet();

      if (this.data.startMove > 0) {
        this.nav.goToStartMove();
      }
    }

    this.setupKeyboardShortcuts();
  }

  // ===========================================================================
  // HEADER
  // ===========================================================================

  private renderError(message: string): void {
    const errorContainer = this.container.createDiv({ cls: 'cv-error' });
    errorContainer.createEl('strong', { text: '⚠️ Error' });
    errorContainer.createEl('p', { text: message });
    const details = errorContainer.createEl('details');
    details.createEl('summary', { text: 'Details' });
    const pre = details.createEl('pre');
    pre.textContent = this.data.fen || this.data.pgn || 'No input';
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'cv-header' });
    const headerText = header.createSpan({ cls: 'cv-header-text' });

    if (this.data.isPuzzle) {
      headerText.createSpan({ cls: 'cv-header-label', text: 'Puzzle' });

      const infoParts: string[] = [];
      if (this.data.puzzleTitle) infoParts.push(this.data.puzzleTitle);
      if (this.data.puzzleRating)
        infoParts.push(`Rating: ${this.data.puzzleRating}`);
      if (this.data.puzzleThemes.length > 0)
        infoParts.push(this.data.puzzleThemes.join(', '));

      const event = this.data.headers['Event'];
      if (event && event !== '?') infoParts.push(event);

      headerText.appendText(
        infoParts.length > 0 ? infoParts.join(' • ') : 'Solve the puzzle'
      );
    } else {
      const parts: string[] = [];

      const white = this.data.headers['White'];
      const black = this.data.headers['Black'];
      if (white || black) parts.push(`${white || '?'} vs ${black || '?'}`);

      const event = this.data.headers['Event'];
      if (event && event !== '?') parts.push(event);

      const date = this.data.headers['Date'];
      if (date && date !== '????.??.??') parts.push(date.replace(/\./g, '-'));

      const result = this.data.headers['Result'];
      if (result && result !== '*') parts.push(result);

      headerText.textContent =
        parts.length > 0 ? parts.join(' • ') : 'Chess Position';
    }
  }

  // ===========================================================================
  // FOOTER
  // ===========================================================================

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'cv-footer' });

    // Left side: navigation + counter
    const leftGroup = footer.createDiv({ cls: 'cv-footer-left' });

    if (!this.data.isPuzzle && this.nav && this.nav.moveCount > 0) {
      this.createControlBtn(leftGroup, '⏮', 'First move (Home)', () =>
        this.nav!.goToStart()
      );
      this.createControlBtn(leftGroup, '◀', 'Previous move (←)', () =>
        this.nav!.goBack()
      );

      const playBtn = this.createControlBtn(
        leftGroup,
        '▶',
        'Play (Space)',
        () => this.nav!.toggleAutoPlay()
      );
      playBtn.addClass('cv-play-btn');
      this.nav.setPlayBtnEl(playBtn);

      this.createControlBtn(leftGroup, '▶', 'Next move (→)', () =>
        this.nav!.goForward()
      );
      this.createControlBtn(leftGroup, '⏭', 'Last move (End)', () =>
        this.nav!.goToEnd()
      );

      const counterEl = leftGroup.createSpan({ cls: 'cv-counter' });
      this.nav.setCounterEl(counterEl);
    }

    // Right side: flip, copy, links
    const rightGroup = footer.createDiv({ cls: 'cv-footer-right' });

    this.createControlBtn(rightGroup, '⇅', 'Flip board (F)', () => {
      this.isFlipped = !this.isFlipped;
      this.board?.flipBoard();
      if (this.nav) {
        this.board?.updateNagOverlay([], this.nav.currentIndex);
      }
    });

    const copyBtn = rightGroup.createEl('button', {
      cls: 'cv-action-btn',
      attr: { 'aria-label': 'Copy', title: 'Copy to clipboard' }
    });
    copyBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
    copyBtn.onclick = () => this.copyToClipboard();

    if (this.settings.showAnalysisLinks) {
      const urls = generateAnalysisUrls(this.data);
      rightGroup.createEl('a', {
        cls: 'cv-action-link',
        text: 'Lichess',
        href: urls.lichess,
        attr: { target: '_blank', rel: 'noopener' }
      });
      rightGroup.createEl('a', {
        cls: 'cv-action-link',
        text: 'Chess.com',
        href: urls.chessCom,
        attr: { target: '_blank', rel: 'noopener' }
      });
    }
  }

  private createControlBtn(
    container: HTMLElement,
    icon: string,
    label: string,
    onClick: () => void
  ): HTMLElement {
    const btn = container.createEl('button', {
      cls: 'cv-btn',
      attr: { 'aria-label': label, title: label }
    });
    btn.textContent = icon;
    btn.onclick = onClick;
    return btn;
  }

  // ===========================================================================
  // CLIPBOARD
  // ===========================================================================

  private async copyToClipboard(): Promise<void> {
    let text: string;

    if (this.data.isPuzzle) {
      const movesText = this.data.solutionMoves
        .map((m, i) => {
          const str =
            i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m.san}` : m.san;
          return str;
        })
        .join(' ');

      const headers = Object.entries(this.data.headers)
        .map(([k, v]) => `[${k} "${v}"]`)
        .join('\n');

      text = headers ? `${headers}\n\n${movesText}` : movesText;
    } else if (this.nav) {
      text = this.nav.getClipboardText();
    } else {
      text = this.chess.fen();
    }

    try {
      await navigator.clipboard.writeText(text);
      const btn = this.container.querySelector('.cv-action-btn');
      if (btn) {
        btn.addClass('copied');
        setTimeout(() => btn.removeClass('copied'), 1000);
      }
    } catch (e) {
      console.error('Copy failed:', e);
    }
  }

  // ===========================================================================
  // KEYBOARD
  // ===========================================================================

  private setupKeyboardShortcuts(): void {
    this.container.setAttribute('tabindex', '0');

    const handler = (e: KeyboardEvent) => {
      if (this.destroyed) return;

      if (this.data.isPuzzle) {
        if (e.key === 'f' || e.key === 'F') {
          e.preventDefault();
          this.isFlipped = !this.isFlipped;
          this.board?.flipBoard();
        }
        return;
      }

      if (!this.nav) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.nav.goBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.nav.goForward();
          break;
        case 'Home':
          e.preventDefault();
          this.nav.goToStart();
          break;
        case 'End':
          e.preventDefault();
          this.nav.goToEnd();
          break;
        case ' ':
          e.preventDefault();
          this.nav.toggleAutoPlay();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.isFlipped = !this.isFlipped;
          this.board?.flipBoard();
          break;
      }
    };

    this.container.addEventListener('keydown', handler);
    this._keyHandler = handler;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  destroy(): void {
    this.destroyed = true;

    if (this._keyHandler) {
      this.container.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    this.nav?.destroy();
    this.puzzle?.destroy();
    this.board?.destroy();

    this.nav = null;
    this.puzzle = null;
    this.board = null;
  }
}
