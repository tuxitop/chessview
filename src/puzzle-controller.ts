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

  createMoveList(movesSection: HTMLElement): void {
    this.moveListEl = movesSection.createDiv({ cls: 'cv-moves' });
  }

  createPuzzleUI(container: HTMLElement): void {
    const puzzleUI = container.createDiv({ cls: 'cv-puzzle-ui' });
    this.statusEl = puzzleUI.createDiv({ cls: 'cv-puzzle-status' });
    this.puzzleButtonsEl = puzzleUI.createDiv({ cls: 'cv-puzzle-buttons' });
  }

  start(): void {
    this.state = 'waiting';
    this.moveIndex = 0;
    this.playedMoves = [];
    this.solutionRevealed = false;
    this.destroyed = false;

    this.chess.load(this.startFen);
    this.board.syncPuzzleBoard(this.chess, this.playedMoves);
    this.updateStatus();
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
      this.updateStatus();
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
      this.updateStatus();
    } else {
      this.state = 'solved';
      this.board.disableInput();
      this.updateStatus();
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

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.renderMoveList();

        if (this.moveIndex >= this.data.solutionMoves.length) {
          this.state = 'solved';
          this.board.disableInput();
          this.updateStatus();
        } else {
          this.state = 'waiting';
          this.board.disableInput();
          this.updateStatus();

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

        this.board.syncPuzzleBoard(this.chess, this.playedMoves);
        this.board.disableInput();
        this.updateStatus();
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
      this.board.showHintHighlight(
        fromSquare,
        null,
        0,
        HINT_HIGHLIGHT_DURATION
      );
    }
  }

  private updateStatus(): void {
    if (!this.statusEl) return;
    this.statusEl.empty();
    this.statusEl.removeClass('success', 'failed', 'waiting', 'playing');

    const playerLabel = this.data.playerColor === 'white'
      ? UI_LABELS.playerWhite
      : UI_LABELS.playerBlack;

    switch (this.state) {
    case 'waiting':
      this.statusEl.addClass('waiting');
      this.statusEl.textContent = UI_LABELS.puzzleWaiting;
      break;
    case 'playing':
      this.statusEl.addClass('playing');
      this.statusEl.textContent = UI_LABELS.puzzlePlaying(playerLabel);
      break;
    case 'solved':
      this.statusEl.addClass('success');
      this.statusEl.textContent = UI_LABELS.puzzleSolved;
      break;
    case 'failed':
      this.statusEl.addClass('failed');
      this.statusEl.textContent = UI_LABELS.puzzleFailed;
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
        text: UI_LABELS.retry
      });
      retryBtn.onclick = () => this.retry();
    }

    if (this.state === 'playing' && this.settings.puzzleShowHints) {
      const hintBtn = this.puzzleButtonsEl.createEl('button', {
        cls: 'cv-btn cv-puzzle-btn cv-hint-btn',
        text: UI_LABELS.hint
      });
      hintBtn.onclick = () => this.showHint();
    }

    if (this.state !== 'solved') {
      if (this.solutionRevealed) {
        const hideBtn = this.puzzleButtonsEl.createEl('button', {
          cls: 'cv-btn cv-puzzle-btn',
          text: UI_LABELS.hideSolution
        });
        hideBtn.onclick = () => this.hideSolution();
      } else {
        const solBtn = this.puzzleButtonsEl.createEl('button', {
          cls: 'cv-btn cv-puzzle-btn',
          text: UI_LABELS.showSolution
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
      const row = container.createDiv({ cls: 'cv-move-row' });
      row.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });
      row.createSpan({ cls: 'cv-move cv-move-placeholder', text: UI_LABELS.movePlaceholder });

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
      return san.replace(/[KQRBN]/g, (m) => FIGURINE_NOTATION[m] ?? m);
    }
    return san;
  }

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