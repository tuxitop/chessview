// src/puzzle-controller.ts
import { Chess } from 'chess.js';
import { Key } from 'chessground/types';

import {
  ParsedChessData,
  MoveData,
  ChessViewSettings,
  FIGURINE_NOTATION,
  PUZZLE_OPPONENT_FIRST_MOVE_DELAY,
  PUZZLE_OPPONENT_RESPONSE_DELAY,
  HINT_HIGHLIGHT_DURATION,
  UI_LABELS
} from './types';
import { BoardManager } from './board-manager';

export type PuzzleState = 'waiting' | 'playing' | 'solved' | 'failed';

export class PuzzleController {
  private chess: Chess;
  private data: ParsedChessData;
  private settings: ChessViewSettings;
  private board: BoardManager;
  private startFen: string;

  private state: PuzzleState = 'waiting';
  private moveIndex: number = 0;
  private playedMoves: MoveData[] = [];
  private solutionRevealed: boolean = false;
  private destroyed: boolean = false;

  // Navigation state for reviewing played moves
  private viewIndex: number = 0;

  private moveListEl: HTMLElement | null = null;
  private headerStatusEl: HTMLElement | null = null;

  // Footer button references for updating
  private hintBtnEl: HTMLElement | null = null;
  private solutionBtnEl: HTMLElement | null = null;
  private retryBtnEl: HTMLElement | null = null;
  private footerRightGroup: HTMLElement | null = null;

  constructor(
    chess: Chess,
    data: ParsedChessData,
    settings: ChessViewSettings,
    board: BoardManager,
    startFen: string
  ) {
    this.chess = chess;
    this.data = data;
    this.settings = settings;
    this.board = board;
    this.startFen = startFen;
  }

  setHeaderStatusEl(el: HTMLElement): void {
    this.headerStatusEl = el;
  }

  createMoveList(movesSection: HTMLElement): void {
    this.moveListEl = movesSection.createDiv({ cls: 'cv-moves' });
  }

  createFooterButtons(rightGroup: HTMLElement): void {
    this.footerRightGroup = rightGroup;
    this.updateFooterButtons();
  }

  start(): void {
    this.state = 'waiting';
    this.moveIndex = 0;
    this.viewIndex = 0;
    this.playedMoves = [];
    this.solutionRevealed = false;
    this.destroyed = false;

    this.chess.load(this.startFen);
    this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    this.updateHeaderStatus();
    this.updateFooterButtons();
    this.renderMoveList();

    const fenTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    const firstMoveIsOpponent = fenTurn !== this.data.playerColor;

    if (firstMoveIsOpponent && this.data.solutionMoves.length > 0) {
      setTimeout(() => {
        if (!this.destroyed) this.playOpponentMove();
      }, PUZZLE_OPPONENT_FIRST_MOVE_DELAY);
    } else {
      this.state = 'playing';
      this.enableInput();
      this.updateHeaderStatus();
      this.updateFooterButtons();
    }
  }

  private playOpponentMove(): void {
    if (this.destroyed) return;
    if (this.moveIndex >= this.data.solutionMoves.length) return;

    const expectedMove = this.data.solutionMoves[this.moveIndex];

    try {
      const move = this.chess.move(expectedMove.san);
      if (move) {
        this.playedMoves.push({
          san: move.san,
          from: move.from,
          to: move.to,
          fen: this.chess.fen()
        });
        this.moveIndex++;
        this.viewIndex = this.playedMoves.length;
      }
    } catch (err) {
      console.warn(
        'Puzzle: could not play opponent move:',
        expectedMove.san,
        err
      );
    }

    this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    this.renderMoveList();

    if (this.moveIndex < this.data.solutionMoves.length) {
      this.state = 'playing';
      this.enableInput();
      this.updateHeaderStatus();
      this.updateFooterButtons();
    } else {
      this.state = 'solved';
      this.board.disableInput();
      this.updateHeaderStatus();
      this.updateFooterButtons();
    }
  }

  async handleMove(orig: Key, dest: Key): Promise<void> {
    if (this.state !== 'playing') return;
    if (this.moveIndex >= this.data.solutionMoves.length) return;

    const expected = this.data.solutionMoves[this.moveIndex];

    const promotion = await this.board.getPromotion(this.chess, orig, dest);

    try {
      const move = this.chess.move({ from: orig, to: dest, promotion });

      if (!move) {
        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        return;
      }

      if (move.san === expected.san) {
        this.playedMoves.push({
          san: move.san,
          from: move.from,
          to: move.to,
          fen: this.chess.fen()
        });
        this.moveIndex++;
        this.viewIndex = this.playedMoves.length;

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.renderMoveList();

        if (this.moveIndex >= this.data.solutionMoves.length) {
          this.state = 'solved';
          this.board.disableInput();
          this.updateHeaderStatus();
          this.updateFooterButtons();
        } else {
          this.state = 'waiting';
          this.board.disableInput();
          this.updateHeaderStatus();

          setTimeout(() => {
            if (!this.destroyed) this.playOpponentMove();
          }, PUZZLE_OPPONENT_RESPONSE_DELAY);
        }
      } else {
        this.chess.undo();
        this.state = 'failed';

        this.playedMoves.push({
          san: move.san,
          from: move.from,
          to: move.to,
          fen: '',
          comment: 'wrong'
        });
        this.viewIndex = this.playedMoves.length;

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.board.disableInput();
        this.updateHeaderStatus();
        this.updateFooterButtons();
        this.renderMoveList();
      }
    } catch {
      this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    }
  }

  private enableInput(): void {
    this.board.enablePuzzleInput(
      this.chess,
      this.data.playerColor,
      (orig: Key, dest: Key) => {
        void this.handleMove(orig, dest);
      }
    );
  }

  // Navigation methods for reviewing played moves
  goToStart(): void {
    this.goToView(0);
  }

  goToEnd(): void {
    this.goToView(this.playedMoves.length);
  }

  goForward(): void {
    this.goToView(this.viewIndex + 1);
  }

  goBack(): void {
    this.goToView(this.viewIndex - 1);
  }

  private goToView(index: number): void {
    const maxIndex = this.solutionRevealed
      ? this.data.solutionMoves.length
      : this.playedMoves.length;

    index = Math.max(0, Math.min(maxIndex, index));
    this.viewIndex = index;

    // Replay to this position
    this.chess.load(this.startFen);
    const moves = this.solutionRevealed ? this.data.solutionMoves : this.playedMoves;
    for (let i = 0; i < index; i++) {
      if (moves[i].comment === 'wrong') break;
      try {
        this.chess.move(moves[i].san);
      } catch {
        break;
      }
    }

    this.board.syncPuzzleBoard(this.chess, moves.slice(0, index));
    this.updateMoveHighlights();
  }

  private retry(): void {
    this.solutionRevealed = false;
    this.start();
  }

  private showSolution(): void {
    this.solutionRevealed = true;
    this.viewIndex = 0;
    this.renderMoveList();
    this.updateFooterButtons();
  }

  private hideSolution(): void {
    this.solutionRevealed = false;
    this.viewIndex = this.playedMoves.length;
    this.renderMoveList();
    this.updateFooterButtons();
    // Restore board to current played state
    this.goToView(this.viewIndex);
  }

  showHint(): void {
    if (this.state !== 'playing') return;
    if (this.moveIndex >= this.data.solutionMoves.length) return;

    const nextMove = this.data.solutionMoves[this.moveIndex];
    const fromSquare = nextMove.from;

    if (fromSquare) {
      this.board.showHintHighlight(
        fromSquare,
        null,
        0,
        HINT_HIGHLIGHT_DURATION
      );
    }
  }

  private updateHeaderStatus(): void {
    if (!this.headerStatusEl) return;

    const playerLabel = this.data.playerColor === 'white'
      ? UI_LABELS.playerWhite
      : UI_LABELS.playerBlack;

    switch (this.state) {
    case 'waiting':
      this.headerStatusEl.textContent = UI_LABELS.puzzleHeaderWaiting;
      this.headerStatusEl.className = 'cv-header-puzzle-status';
      break;
    case 'playing':
      this.headerStatusEl.textContent = UI_LABELS.puzzleHeaderPlaying(playerLabel);
      this.headerStatusEl.className = 'cv-header-puzzle-status';
      break;
    case 'solved':
      this.headerStatusEl.textContent = UI_LABELS.puzzleHeaderSolved;
      this.headerStatusEl.className = 'cv-header-puzzle-status cv-puzzle-solved';
      break;
    case 'failed':
      this.headerStatusEl.textContent = UI_LABELS.puzzleHeaderFailed;
      this.headerStatusEl.className = 'cv-header-puzzle-status cv-puzzle-failed';
      break;
    }
  }

  updateFooterButtons(): void {
    if (!this.footerRightGroup) return;

    // Remove old puzzle buttons
    if (this.hintBtnEl) { this.hintBtnEl.remove(); this.hintBtnEl = null; }
    if (this.solutionBtnEl) { this.solutionBtnEl.remove(); this.solutionBtnEl = null; }
    if (this.retryBtnEl) { this.retryBtnEl.remove(); this.retryBtnEl = null; }

    // Find the insertion point — before the flip button
    const flipBtn = this.footerRightGroup.querySelector('.cv-btn:not(.cv-puzzle-action)');

    // Hint button
    if (this.state === 'playing' && this.settings.puzzleShowHints) {
      this.hintBtnEl = this.createPuzzleActionBtn(
        UI_LABELS.hintIcon,
        UI_LABELS.hintTooltip,
        () => this.showHint()
      );
      if (flipBtn) {
        this.footerRightGroup.insertBefore(this.hintBtnEl, flipBtn);
      } else {
        this.footerRightGroup.appendChild(this.hintBtnEl);
      }
    }

    // Solution button
    if (this.state !== 'solved') {
      if (this.solutionRevealed) {
        this.solutionBtnEl = this.createPuzzleActionBtn(
          UI_LABELS.hideSolutionIcon,
          UI_LABELS.hideSolutionTooltip,
          () => this.hideSolution()
        );
      } else {
        this.solutionBtnEl = this.createPuzzleActionBtn(
          UI_LABELS.showSolutionIcon,
          UI_LABELS.showSolutionTooltip,
          () => this.showSolution()
        );
      }
      if (flipBtn) {
        this.footerRightGroup.insertBefore(this.solutionBtnEl, flipBtn);
      } else {
        this.footerRightGroup.appendChild(this.solutionBtnEl);
      }
    }

    // Retry button
    if (this.state === 'failed' || this.state === 'solved' || this.solutionRevealed) {
      this.retryBtnEl = this.createPuzzleActionBtn(
        UI_LABELS.retryIcon,
        UI_LABELS.retryTooltip,
        () => this.retry()
      );
      if (flipBtn) {
        this.footerRightGroup.insertBefore(this.retryBtnEl, flipBtn);
      } else {
        this.footerRightGroup.appendChild(this.retryBtnEl);
      }
    }
  }

  private createPuzzleActionBtn(
    icon: string,
    tooltip: string,
    onClick: () => void
  ): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'cv-btn cv-puzzle-action';
    btn.setAttribute('aria-label', tooltip);
    btn.setAttribute('title', tooltip);
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

  renderMoveList(): void {
    if (!this.moveListEl) return;
    this.moveListEl.empty();

    const list = this.moveListEl.createDiv({ cls: 'cv-moves-grid' });

    if (this.solutionRevealed) {
      this.renderMoveRows(list, this.data.solutionMoves, true);
    } else if (this.playedMoves.length === 0) {
      list.createDiv({ cls: 'cv-moves-empty', text: UI_LABELS.solvePuzzle });
    } else {
      this.renderMoveRows(list, this.playedMoves, false);
    }
  }

  private renderMoveRows(
    container: HTMLElement,
    moves: readonly MoveData[],
    isSolution: boolean
  ): void {
    let startMoveNum = 1;
    let startIsBlack = false;

    if (this.data.fen) {
      const parts = this.data.fen.split(/\s+/);
      startMoveNum = parseInt(parts[5] ?? '1') || 1;
      startIsBlack = parts[1] === 'b';
    }

    let moveNum = startMoveNum;
    let i = 0;

    if (startIsBlack && moves.length > 0) {
      container.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });
      container.createSpan({ cls: 'cv-move-placeholder', text: UI_LABELS.movePlaceholder });

      const move = moves[0];
      const cls = this.getPuzzleMoveClass(move, 0, isSolution);
      const span = container.createSpan({ cls });
      span.createSpan({ text: this.formatMove(move.san) });
      span.onclick = () => this.goToView(1);

      i = 1;
      moveNum++;
    }

    while (i < moves.length) {
      container.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });

      const wMove = moves[i];
      const wCls = this.getPuzzleMoveClass(wMove, i, isSolution);
      const wSpan = container.createSpan({ cls: wCls });
      wSpan.createSpan({ text: this.formatMove(wMove.san) });
      const wIdx = i + 1;
      wSpan.onclick = () => this.goToView(wIdx);
      i++;

      if (i < moves.length) {
        const bMove = moves[i];
        const bCls = this.getPuzzleMoveClass(bMove, i, isSolution);
        const bSpan = container.createSpan({ cls: bCls });
        bSpan.createSpan({ text: this.formatMove(bMove.san) });
        const bIdx = i + 1;
        bSpan.onclick = () => this.goToView(bIdx);
        i++;
      } else {
        container.createSpan({ cls: 'cv-move-empty' });
      }

      moveNum++;
    }
  }

  private getPuzzleMoveClass(
    move: MoveData,
    index: number,
    isSolution: boolean
  ): string {
    const classes = ['cv-move'];

    if (index === this.viewIndex - 1) classes.push('active');

    if (move.comment === 'wrong') {
      classes.push('cv-move-wrong');
    } else if (isSolution) {
      if (index < this.playedMoves.length) {
        classes.push('cv-move-played');
      } else {
        classes.push('cv-move-unplayed');
      }
    }
    return classes.join(' ');
  }

  private updateMoveHighlights(): void {
    if (!this.moveListEl) return;
    const moves = this.moveListEl.querySelectorAll('.cv-move');
    moves.forEach((el, i) => {
      el.removeClass('active');
      if (i === this.viewIndex - 1) {
        el.addClass('active');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  private formatMove(san: string): string {
    if (this.settings.notationType === 'figurine') {
      return san.replace(/[KQRBN]/g, (m) => FIGURINE_NOTATION[m] ?? m);
    }
    return san;
  }

  destroy(): void {
    this.destroyed = true;
    this.moveListEl = null;
    this.headerStatusEl = null;
    this.hintBtnEl = null;
    this.solutionBtnEl = null;
    this.retryBtnEl = null;
    this.footerRightGroup = null;
  }

  get currentState(): PuzzleState {
    return this.state;
  }
}