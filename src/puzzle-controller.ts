// src/puzzle-controller.ts
import { Chess } from 'chess.js';
import { Color, Key } from 'chessground/types';

import {
  ParsedChessData,
  MoveData,
  ChessViewSettings,
  FIGURINE_NOTATION
} from './types';
import { BoardManager } from './board-manager';

export type PuzzleState = 'waiting' | 'playing' | 'solved' | 'failed';

/** Delay before auto-playing the opponent's move (ms) */
const OPPONENT_MOVE_DELAY = 600;
/** Delay before playing opponent response after correct player move (ms) */
const RESPONSE_DELAY = 400;

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
  private isPromoting: boolean = false;

  // DOM
  private moveListEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private puzzleButtonsEl: HTMLElement | null = null;

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

  // ===========================================================================
  // SETUP
  // ===========================================================================

  createMoveList(movesSection: HTMLElement): void {
    this.moveListEl = movesSection.createDiv({ cls: 'cv-moves' });
  }

  createPuzzleUI(container: HTMLElement): void {
    const puzzleUI = container.createDiv({ cls: 'cv-puzzle-ui' });
    this.statusEl = puzzleUI.createDiv({ cls: 'cv-puzzle-status' });
    this.puzzleButtonsEl = puzzleUI.createDiv({ cls: 'cv-puzzle-buttons' });
  }

  start(): void {
    this.setState('waiting');
    this.moveIndex = 0;
    this.playedMoves = [];
    this.solutionRevealed = false;
    this.destroyed = false;

    this.chess.load(this.startFen);
    this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    this.updateStatus();
    this.renderMoveList();

    // Determine if first move is opponent's (auto-play it)
    const fenTurn = this.chess.turn() === 'w' ? 'white' : 'black';
    const firstMoveIsOpponent = fenTurn !== this.data.playerColor;

    if (firstMoveIsOpponent && this.data.solutionMoves.length > 0) {
      setTimeout(() => {
        if (!this.destroyed) this.playOpponentMove();
      }, OPPONENT_MOVE_DELAY);
    } else {
      this.setState('playing');
      this.enableInput();
      this.updateStatus();
    }
  }

  // ===========================================================================
  // STATE MANAGEMENT
  // ===========================================================================

  private setState(newState: PuzzleState): void {
    this.state = newState;
  }

  // ===========================================================================
  // MOVE LOGIC
  // ===========================================================================

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
      }
    } catch (e) {
      console.warn('Could not play opponent move:', expectedMove.san);
    }

    this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    this.renderMoveList();

    if (this.moveIndex < this.data.solutionMoves.length) {
      this.setState('playing');
      this.enableInput();
      this.updateStatus();
    } else {
      this.setState('solved');
      this.board.disableInput();
      this.updateStatus();
    }
  }

  async handleMove(orig: Key, dest: Key): Promise<void> {
    if (this.state !== 'playing' || this.isPromoting) return;
    if (this.moveIndex >= this.data.solutionMoves.length) return;

    const expected = this.data.solutionMoves[this.moveIndex];

    // Lock to prevent concurrent promotion dialogs
    this.isPromoting = true;

    try {
      const promotion = await this.board.getPromotion(this.chess, orig, dest);
      const move = this.chess.move({ from: orig, to: dest, promotion });

      if (!move) {
        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        return;
      }

      if (move.san === expected.san) {
        // Correct move
        this.playedMoves.push({
          san: move.san,
          from: move.from,
          to: move.to,
          fen: this.chess.fen()
        });
        this.moveIndex++;

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.renderMoveList();

        if (this.moveIndex >= this.data.solutionMoves.length) {
          this.setState('solved');
          this.board.disableInput();
          this.updateStatus();
        } else {
          this.setState('waiting');
          this.board.disableInput();
          this.updateStatus();

          setTimeout(() => {
            if (!this.destroyed) this.playOpponentMove();
          }, RESPONSE_DELAY);
        }
      } else {
        // Wrong move — undo it
        this.chess.undo();
        this.setState('failed');

        this.playedMoves.push({
          san: move.san,
          from: move.from,
          to: move.to,
          fen: '',
          comment: 'wrong'
        });

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.board.disableInput();
        this.updateStatus();
        this.renderMoveList();
      }
    } catch (e) {
      this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    } finally {
      this.isPromoting = false;
    }
  }

  private enableInput(): void {
    const playerColor: Color = this.data.playerColor as Color;
    this.board.enablePuzzleInput(
      this.chess,
      playerColor,
      (orig: Key, dest: Key) => this.handleMove(orig, dest)
    );
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  private retry(): void {
    this.solutionRevealed = false;
    this.start();
    this.updateButtons();
  }

  private showSolution(): void {
    this.solutionRevealed = true;
    this.renderMoveList();
    this.updateButtons();
  }

  private hideSolution(): void {
    this.solutionRevealed = false;
    this.renderMoveList();
    this.updateButtons();
  }

  showHint(): void {
    if (this.state !== 'playing') return;
    if (this.moveIndex >= this.data.solutionMoves.length) return;

    const nextMove = this.data.solutionMoves[this.moveIndex];
    const fromSquare = nextMove.from;

    if (fromSquare) {
      this.board.showHintHighlight(fromSquare, null, 0, 2000);
    }
  }

  // ===========================================================================
  // UI RENDERING
  // ===========================================================================

  private updateStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();
    this.statusEl.removeClass('success', 'failed', 'waiting', 'playing');

    const playerLabel = this.data.playerColor === 'white' ? 'White' : 'Black';

    switch (this.state) {
    case 'waiting':
      this.statusEl.addClass('waiting');
      this.statusEl.textContent = 'Watch...';
      break;
    case 'playing':
      this.statusEl.addClass('playing');
      this.statusEl.textContent = `${playerLabel} to move — Your turn`;
      break;
    case 'solved':
      this.statusEl.addClass('success');
      this.statusEl.textContent = '✓ Puzzle solved!';
      break;
    case 'failed':
      this.statusEl.addClass('failed');
      this.statusEl.textContent = '✗ Incorrect';
      break;
    }

    this.updateButtons();
  }

  private updateButtons(): void {
    if (!this.puzzleButtonsEl) return;
    this.puzzleButtonsEl.empty();

    if (
      this.state === 'failed' ||
      this.state === 'solved' ||
      this.solutionRevealed
    ) {
      const retryBtn = this.puzzleButtonsEl.createEl('button', {
        cls: 'cv-btn cv-puzzle-btn',
        text: '↺ Retry'
      });
      retryBtn.onclick = () => this.retry();
    }

    if (this.state === 'playing' && this.settings.puzzleShowHints) {
      const hintBtn = this.puzzleButtonsEl.createEl('button', {
        cls: 'cv-btn cv-puzzle-btn cv-hint-btn',
        text: '💡 Hint'
      });
      hintBtn.onclick = () => this.showHint();
    }

    if (this.state !== 'solved') {
      if (this.solutionRevealed) {
        const hideBtn = this.puzzleButtonsEl.createEl('button', {
          cls: 'cv-btn cv-puzzle-btn',
          text: '🙈 Hide Solution'
        });
        hideBtn.onclick = () => this.hideSolution();
      } else {
        const solBtn = this.puzzleButtonsEl.createEl('button', {
          cls: 'cv-btn cv-puzzle-btn',
          text: '👁 Show Solution'
        });
        solBtn.onclick = () => this.showSolution();
      }
    }
  }

  renderMoveList(): void {
    if (!this.moveListEl) return;
    this.moveListEl.empty();

    const list = this.moveListEl.createDiv({ cls: 'cv-moves-list' });

    if (this.solutionRevealed) {
      this.renderMoveRows(list, this.data.solutionMoves, true);
    } else if (this.playedMoves.length === 0) {
      list.createDiv({ cls: 'cv-moves-empty', text: 'Solve the puzzle...' });
    } else {
      this.renderMoveRows(list, this.playedMoves, false);
    }
  }

  private renderMoveRows(
    container: HTMLElement,
    moves: MoveData[],
    isSolution: boolean
  ): void {
    let startMoveNum = 1;
    let startIsBlack = false;

    if (this.data.fen) {
      const parts = this.data.fen.split(/\s+/);
      if (parts[5]) startMoveNum = parseInt(parts[5]) || 1;
      if (parts[1] === 'b') startIsBlack = true;
    }

    let moveNum = startMoveNum;
    let i = 0;

    if (startIsBlack && moves.length > 0) {
      const row = container.createDiv({ cls: 'cv-move-row' });
      row.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });
      row.createSpan({ cls: 'cv-move cv-move-placeholder', text: '...' });

      const move = moves[0];
      const cls = this.getPuzzleMoveClass(move, 0, isSolution);
      const span = row.createSpan({ cls });
      span.createSpan({ text: this.formatMove(move.san) });

      i = 1;
      moveNum++;
    }

    while (i < moves.length) {
      const row = container.createDiv({ cls: 'cv-move-row' });
      row.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });

      const wMove = moves[i];
      const wCls = this.getPuzzleMoveClass(wMove, i, isSolution);
      const wSpan = row.createSpan({ cls: wCls });
      wSpan.createSpan({ text: this.formatMove(wMove.san) });
      i++;

      if (i < moves.length) {
        const bMove = moves[i];
        const bCls = this.getPuzzleMoveClass(bMove, i, isSolution);
        const bSpan = row.createSpan({ cls: bCls });
        bSpan.createSpan({ text: this.formatMove(bMove.san) });
        i++;
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

  private formatMove(san: string): string {
    if (this.settings.notationType === 'figurine') {
      return san.replace(/[KQRBN]/g, (m) => FIGURINE_NOTATION[m] || m);
    }
    return san;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  destroy(): void {
    this.destroyed = true;
    this.moveListEl = null;
    this.statusEl = null;
    this.puzzleButtonsEl = null;
  }

  get currentState(): PuzzleState {
    return this.state;
  }
}
