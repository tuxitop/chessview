// src/chess-renderer.ts
import { Chess } from 'chess.js';
import { Key } from 'chessground/types';

import {
  ChessViewSettings,
  ParsedChessData,
  COPY_FEEDBACK_DURATION,
  COPY_FAILURE_DURATION,
  MOVE_LIST_PANEL_WIDTH,
  UI_LABELS
} from './types';
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

  private board: BoardManager | null = null;
  private puzzle: PuzzleController | null = null;
  private nav: NavigationController | null = null;

  private menuEl: HTMLElement | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private _menuCloseHandler: ((e: MouseEvent) => void) | null = null;
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

    if (data.orientation === 'black') {
      this.isFlipped = true;
    } else if (data.orientation === 'white') {
      this.isFlipped = false;
    } else if (settings.defaultOrientation === 'black') {
      this.isFlipped = true;
    }

    if (data.fen) {
      try {
        this.chess.load(data.fen);
      } catch {
        if (!data.error) {
          data.error = 'Failed to load position';
        }
      }
    }

    if (
      settings.defaultOrientation === 'auto' &&
      !data.isPuzzle &&
      data.orientation === 'white'
    ) {
      this.isFlipped = this.chess.turn() === 'b';
    }

    if (data.isPuzzle && data.orientation === data.playerColor) {
      this.isFlipped = data.playerColor === 'black';
    }

    this.startFen = this.chess.fen();
  }

  render(): void {
    this.destroy();
    this.destroyed = false;

    this.container.empty();
    this.container.addClass('chessview');

    if (this.data.error) {
      this.renderError(this.data.error);
      return;
    }

    this.chess = new Chess();
    if (this.data.fen) {
      try {
        this.chess.load(this.data.fen);
      } catch {
        // FEN already validated during parsing
      }
    }

    const mainContainer = this.container.createDiv({ cls: 'cv-container' });

    this.board = new BoardManager(
      this.container,
      this.settings,
      this.data,
      this.isFlipped
    );

    if (this.data.isPuzzle) {
      this.renderPuzzle(mainContainer);
    } else {
      this.renderGame(mainContainer);
    }

    this.setupKeyboardShortcuts();
  }

  private renderGame(mainContainer: HTMLElement): void {
    this.renderHeader(mainContainer);

    const useRightLayout = this.shouldUseRightLayout();

    const content = mainContainer.createDiv({ cls: 'cv-content' });
    if (!useRightLayout) {
      content.addClass('cv-content-vertical');
    }

    const boardColumn = content.createDiv({ cls: 'cv-board-column' });
    const boardSection = boardColumn.createDiv({ cls: 'cv-board-section' });
    this.board!.createBoard(boardSection);

    this.nav = new NavigationController(
      this.chess,
      this.data,
      this.settings,
      this.board!,
      this.startFen
    );

    const userMoveHandler = (orig: Key, dest: Key): void => {
      void this.nav!.handleUserMove(orig, dest);
    };
    this.board!.initChessground(this.chess, userMoveHandler);

    // No more branch overlay

    if (useRightLayout && this.settings.showMoveList && this.nav.moveCount > 0) {
      const movesSection = content.createDiv({ cls: 'cv-moves-section' });
      this.nav.createMoveList(movesSection);
    }

    if (useRightLayout) {
      this.renderFooter(mainContainer);
    } else {
      this.renderFooter(boardColumn);

      if (this.settings.showMoveList && this.nav.moveCount > 0) {
        const bottomMoves = boardColumn.createDiv({ cls: 'cv-bottom-moves' });
        this.nav.createMoveList(bottomMoves);
      }
    }

    this.board!.applyTheme();
    this.board!.applyPieceSet();

    if (this.data.startMove > 0) {
      this.nav.goToStartMove();
    }
  }

  private renderPuzzle(mainContainer: HTMLElement): void {
    this.puzzle = new PuzzleController(
      this.chess,
      this.data,
      this.settings,
      this.board!,
      this.startFen
    );

    this.renderPuzzleHeader(mainContainer);

    const useRightLayout = this.shouldUseRightLayout();

    const content = mainContainer.createDiv({ cls: 'cv-content' });
    if (!useRightLayout) {
      content.addClass('cv-content-vertical');
    }

    const boardColumn = content.createDiv({ cls: 'cv-board-column' });
    const boardSection = boardColumn.createDiv({ cls: 'cv-board-section' });
    this.board!.createBoard(boardSection);
    this.board!.initChessground(this.chess);

    if (useRightLayout) {
      const movesSection = content.createDiv({ cls: 'cv-moves-section cv-moves-section-puzzle' });
      this.puzzle.createMoveList(movesSection);
      this.renderPuzzleFooter(mainContainer);
    } else {
      this.renderPuzzleFooter(boardColumn);

      const bottomMoves = boardColumn.createDiv({ cls: 'cv-bottom-moves cv-bottom-moves-puzzle' });
      this.puzzle.createMoveList(bottomMoves);
    }

    this.board!.applyTheme();
    this.board!.applyPieceSet();

    this.puzzle.start();
  }

  private shouldUseRightLayout(): boolean {
    if (!this.settings.showMoveList) return false;

    const hasMoves = this.data.isPuzzle
      ? this.data.solutionMoves.length > 0
      : (this.data.moves.length > 0);

    if (!hasMoves) return false;

    if (this.settings.moveListPosition === 'bottom') return false;

    // Never use right layout on narrow screens
    const screenWidth = window.innerWidth;
    if (screenWidth <= 600) return false;

    const boardWidth = this.getBoardPixelWidth();
    const needed = boardWidth + MOVE_LIST_PANEL_WIDTH;

    const leaf = this.container.closest('.workspace-leaf-content');
    const available = leaf ? leaf.clientWidth : screenWidth;

    return available >= needed;
  }

  private getBoardPixelWidth(): number {
    switch (this.settings.boardSize) {
    case 'small': return 280;
    case 'medium': return 360;
    case 'large': return 480;
    case 'auto': return Math.min(480, this.container.parentElement?.clientWidth ?? 480);
    default: return 360;
    }
  }

  private renderError(message: string): void {
    const errorContainer = this.container.createDiv({ cls: 'cv-error' });
    errorContainer.createEl('strong', { text: UI_LABELS.errorTitle });
    errorContainer.createEl('p', { text: message });
    const details = errorContainer.createEl('details');
    details.createEl('summary', { text: UI_LABELS.errorDetails });
    const pre = details.createEl('pre');
    pre.textContent = this.data.fen || this.data.pgn || UI_LABELS.errorNoInput;
  }

  private renderHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'cv-header' });

    const line1 = header.createDiv({ cls: 'cv-header-line1' });
    const line2 = header.createDiv({ cls: 'cv-header-line2' });

    const white = this.data.headers['White'];
    const black = this.data.headers['Black'];
    const whiteElo = this.data.headers['WhiteElo'];
    const blackElo = this.data.headers['BlackElo'];

    if (white || black) {
      const whiteName = white || '?';
      const blackName = black || '?';
      const whiteDisplay = whiteElo && whiteElo !== '?' ? `${whiteName} (${whiteElo})` : whiteName;
      const blackDisplay = blackElo && blackElo !== '?' ? `${blackName} (${blackElo})` : blackName;

      line1.createSpan({
        cls: 'cv-header-players',
        text: `${whiteDisplay} vs ${blackDisplay}`
      });
    }

    const secondaryParts: string[] = [];
    const event = this.data.headers['Event'];
    if (event && event !== '?') secondaryParts.push(event);

    const date = this.data.headers['Date'];
    if (date && date !== '????.??.??') {
      const formatted = date
        .split('.')
        .filter((p) => p !== '??')
        .join('-');
      if (formatted) secondaryParts.push(formatted);
    }

    const result = this.data.headers['Result'];
    if (result && result !== '*') secondaryParts.push(result);

    if (secondaryParts.length > 0) {
      line2.createSpan({
        cls: 'cv-header-secondary',
        text: secondaryParts.join(' • ')
      });
    }

    // If no players, put everything on line1
    if (!white && !black) {
      line1.textContent = secondaryParts.length > 0
        ? secondaryParts.join(' • ')
        : UI_LABELS.defaultHeader;
      line2.remove();
    }

    // If no secondary info, remove line2
    if (secondaryParts.length === 0 && line2.parentElement) {
      line2.remove();
    }
  }

  private renderPuzzleHeader(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'cv-header' });

    const line1 = header.createDiv({ cls: 'cv-header-line1' });
    line1.createSpan({ cls: 'cv-header-label', text: UI_LABELS.puzzleLabel });

    const playerLabel = this.data.playerColor === 'white'
      ? UI_LABELS.playerWhite
      : UI_LABELS.playerBlack;

    const statusSpan = line1.createSpan({
      cls: 'cv-header-puzzle-status',
      text: UI_LABELS.puzzleHeaderPlaying(playerLabel)
    });

    // Store reference for puzzle controller to update
    this.puzzle!.setHeaderStatusEl(statusSpan);

    const secondaryParts: string[] = [];
    if (this.data.puzzleTitle) secondaryParts.push(this.data.puzzleTitle);
    if (this.data.puzzleRating)
      secondaryParts.push(`${UI_LABELS.ratingPrefix}${this.data.puzzleRating}`);
    if (this.data.puzzleThemes.length > 0)
      secondaryParts.push(this.data.puzzleThemes.join(', '));

    const event = this.data.headers['Event'];
    if (event && event !== '?') secondaryParts.push(event);

    if (secondaryParts.length > 0) {
      const line2 = header.createDiv({ cls: 'cv-header-line2' });
      line2.createSpan({
        cls: 'cv-header-secondary',
        text: secondaryParts.join(' • ')
      });
    }
  }

  private renderFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'cv-footer' });

    const leftGroup = footer.createDiv({ cls: 'cv-footer-left' });

    if (this.nav && this.nav.moveCount > 0) {
      const firstBtn = this.createControlBtn(
        leftGroup,
        UI_LABELS.firstMove,
        UI_LABELS.firstMoveTooltip,
        () => this.nav!.goToStart()
      );
      const prevBtn = this.createControlBtn(
        leftGroup,
        UI_LABELS.previousMove,
        UI_LABELS.previousMoveTooltip,
        () => this.nav!.goBack()
      );

      const playBtn = this.createControlBtn(
        leftGroup,
        UI_LABELS.play,
        UI_LABELS.playTooltip,
        () => this.nav!.toggleAutoPlay()
      );
      playBtn.addClass('cv-play-btn');
      this.nav.setPlayBtnEl(playBtn);

      const nextBtn = this.createControlBtn(
        leftGroup,
        UI_LABELS.nextMove,
        UI_LABELS.nextMoveTooltip,
        () => this.nav!.goForward()
      );
      const lastBtn = this.createControlBtn(
        leftGroup,
        UI_LABELS.lastMove,
        UI_LABELS.lastMoveTooltip,
        () => this.nav!.goToEnd()
      );

      this.nav.setNavButtons(firstBtn, prevBtn, nextBtn, lastBtn);

      const counterEl = leftGroup.createSpan({ cls: 'cv-counter' });
      this.nav.setCounterEl(counterEl);
    }

    const rightGroup = footer.createDiv({ cls: 'cv-footer-right' });

    this.createControlBtn(rightGroup, UI_LABELS.flipBoard, UI_LABELS.flipTooltip, () => {
      this.isFlipped = !this.isFlipped;
      this.board?.flipBoard();
      if (this.nav) {
        this.board?.updateNagOverlay(
          this.nav.currentMoves.map((n) => ({
            san: n.san, from: n.from, to: n.to, fen: n.fen,
            comment: n.comment, nag: n.nag, annotations: n.annotations
          })),
          this.nav.currentMoveIndex
        );
      }
    });

    this.createMenuButton(rightGroup);
  }

  private renderPuzzleFooter(container: HTMLElement): void {
    const footer = container.createDiv({ cls: 'cv-footer' });

    const leftGroup = footer.createDiv({ cls: 'cv-footer-left' });

    // Nav buttons for puzzle — work on already played moves
    this.createControlBtn(
      leftGroup,
      UI_LABELS.firstMove,
      UI_LABELS.firstMoveTooltip,
      () => this.puzzle!.goToStart()
    );
    this.createControlBtn(
      leftGroup,
      UI_LABELS.previousMove,
      UI_LABELS.previousMoveTooltip,
      () => this.puzzle!.goBack()
    );
    this.createControlBtn(
      leftGroup,
      UI_LABELS.nextMove,
      UI_LABELS.nextMoveTooltip,
      () => this.puzzle!.goForward()
    );
    this.createControlBtn(
      leftGroup,
      UI_LABELS.lastMove,
      UI_LABELS.lastMoveTooltip,
      () => this.puzzle!.goToEnd()
    );

    const rightGroup = footer.createDiv({ cls: 'cv-footer-right' });

    // Puzzle action buttons — icon only with tooltips
    this.puzzle!.createFooterButtons(rightGroup);

    this.createControlBtn(rightGroup, UI_LABELS.flipBoard, UI_LABELS.flipTooltip, () => {
      this.isFlipped = !this.isFlipped;
      this.board?.flipBoard();
    });

    this.createMenuButton(rightGroup);
  }

  private createMenuButton(container: HTMLElement): void {
    const wrapper = container.createDiv({ cls: 'cv-menu-wrapper' });

    const menuBtn = this.createControlBtn(
      wrapper,
      '☰',
      UI_LABELS.menuTooltip,
      () => this.toggleMenu()
    );
    menuBtn.addClass('cv-menu-btn');

    const dropdown = wrapper.createDiv({ cls: 'cv-menu-dropdown' });
    this.menuEl = dropdown;

    // Copy PGN
    const copyPgnItem = dropdown.createDiv({ cls: 'cv-menu-item' });
    copyPgnItem.textContent = UI_LABELS.menuCopyPgn;
    copyPgnItem.onclick = () => {
      this.closeMenu();
      void this.copyPgnToClipboard();
    };

    // Copy FEN
    const copyFenItem = dropdown.createDiv({ cls: 'cv-menu-item' });
    copyFenItem.textContent = UI_LABELS.menuCopyFen;
    copyFenItem.onclick = () => {
      this.closeMenu();
      void this.copyFenToClipboard();
    };

    // Analysis links
    if (this.settings.showAnalysisLinks) {
      const urls = generateAnalysisUrls(this.data);

      const lichessItem = dropdown.createEl('a', {
        cls: 'cv-menu-item',
        text: UI_LABELS.menuLichess,
        href: urls.lichess,
        attr: { target: '_blank', rel: 'noopener' }
      });
      lichessItem.onclick = () => this.closeMenu();

      const chessComItem = dropdown.createEl('a', {
        cls: 'cv-menu-item',
        text: UI_LABELS.menuChessCom,
        href: urls.chessCom,
        attr: { target: '_blank', rel: 'noopener' }
      });
      chessComItem.onclick = () => this.closeMenu();
    }

    // Close menu when clicking outside
    this._menuCloseHandler = (e: MouseEvent) => {
      if (!wrapper.contains(e.target as Node)) {
        this.closeMenu();
      }
    };
    document.addEventListener('click', this._menuCloseHandler);
  }

  private toggleMenu(): void {
    if (this.menuEl) {
      this.menuEl.toggleClass('visible', !this.menuEl.hasClass('visible'));
    }
  }

  private closeMenu(): void {
    if (this.menuEl) {
      this.menuEl.removeClass('visible');
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
    btn.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      onClick();
    };
    btn.addEventListener('touchstart', (e: TouchEvent) => {
      e.stopPropagation();
    });
    btn.addEventListener('touchend', (e: TouchEvent) => {
      e.stopPropagation();
    });
    return btn;
  }

  private async copyPgnToClipboard(): Promise<void> {
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

    await this.writeClipboard(text);
  }

  private async copyFenToClipboard(): Promise<void> {
    await this.writeClipboard(this.chess.fen());
  }

  private async writeClipboard(text: string): Promise<void> {
    const btn = this.container.querySelector('.cv-menu-btn');

    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        btn.addClass('copied');
        setTimeout(() => btn.removeClass('copied'), COPY_FEEDBACK_DURATION);
      }
    } catch {
      if (btn) {
        btn.addClass('copy-failed');
        setTimeout(() => btn.removeClass('copy-failed'), COPY_FAILURE_DURATION);
      }
    }
  }

  private setupKeyboardShortcuts(): void {
    this.container.setAttribute('tabindex', '0');

    const handler = (e: KeyboardEvent) => {
      if (this.destroyed) return;

      if (this.data.isPuzzle) {
        switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          this.puzzle?.goBack();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.puzzle?.goForward();
          break;
        case 'Home':
          e.preventDefault();
          this.puzzle?.goToStart();
          break;
        case 'End':
          e.preventDefault();
          this.puzzle?.goToEnd();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          this.isFlipped = !this.isFlipped;
          this.board?.flipBoard();
          break;
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
      case 'Escape':
        this.closeMenu();
        break;
      }
    };

    this.container.addEventListener('keydown', handler);
    this._keyHandler = handler;
  }

  destroy(): void {
    this.destroyed = true;

    if (this._keyHandler) {
      this.container.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }

    if (this._menuCloseHandler) {
      document.removeEventListener('click', this._menuCloseHandler);
      this._menuCloseHandler = null;
    }

    this.nav?.destroy();
    this.puzzle?.destroy();
    this.board?.destroy();

    this.nav = null;
    this.puzzle = null;
    this.board = null;
    this.menuEl = null;
  }
}