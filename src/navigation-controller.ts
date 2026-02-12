// src/navigation-controller.ts
import { Chess } from 'chess.js';
import { Color, Key } from 'chessground/types';

import {
  ChessViewSettings,
  ParsedChessData,
  MoveData,
  FIGURINE_NOTATION,
  NAG_SYMBOLS,
  NAG_CLASSES
} from './types';
import { BoardManager } from './board-manager';
import { getValidMoves } from './utils';

interface BranchPoint {
  moveIndex: number;
  fen: string;
  moves: MoveData[];
}

export class NavigationController {
  private chess: Chess;
  private data: ParsedChessData;
  private settings: ChessViewSettings;
  private board: BoardManager;
  private startFen: string;

  // Move state
  private moves: MoveData[] = [];
  private mainLineMoves: MoveData[] = [];
  private currentMoveIndex: number = 0;

  // Branch state
  private branchStack: BranchPoint[] = [];
  private isInBranch: boolean = false;

  // Autoplay state
  private isPlaying: boolean = false;
  private playInterval: ReturnType<typeof setInterval> | null = null;

  // Promotion lock
  private isPromoting: boolean = false;

  // DOM
  private moveListEl: HTMLElement | null = null;
  private commentEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private playBtnEl: HTMLElement | null = null;
  private branchOverlayEl: HTMLElement | null = null;

  private destroyed: boolean = false;

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

    if (data.moves && data.moves.length > 0 && !data.isPuzzle) {
      this.moves = [...data.moves];
      this.mainLineMoves = [...data.moves];
    }
  }

  // ===========================================================================
  // SETUP
  // ===========================================================================

  createMoveList(movesSection: HTMLElement): void {
    this.moveListEl = movesSection.createDiv({ cls: 'cv-moves' });
    this.renderMoveList();
    this.commentEl = movesSection.createDiv({ cls: 'cv-comment hidden' });
  }

  createBranchOverlay(boardSection: HTMLElement): void {
    this.branchOverlayEl = boardSection.createDiv({ cls: 'cv-branch-overlay' });
    const returnBtn = this.branchOverlayEl.createEl('button', {
      cls: 'cv-branch-return',
      text: '↩ Return to main line'
    });
    returnBtn.onclick = () => this.returnToMainLine();
  }

  setCounterEl(el: HTMLElement): void {
    this.counterEl = el;
    this.updateCounter();
  }

  setPlayBtnEl(el: HTMLElement): void {
    this.playBtnEl = el;
  }

  // ===========================================================================
  // PUBLIC GETTERS
  // ===========================================================================

  get moveCount(): number {
    return this.moves.length;
  }

  get currentIndex(): number {
    return this.currentMoveIndex;
  }

  get currentMoves(): readonly MoveData[] {
    return this.moves;
  }

  // ===========================================================================
  // NAVIGATION
  // ===========================================================================

  goToMove(index: number): void {
    if (this.destroyed) return;

    index = Math.max(0, Math.min(this.moves.length, index));

    this.chess.load(this.startFen);
    for (let i = 0; i < index; i++) {
      try {
        this.chess.move(this.moves[i].san);
      } catch (e) {
        index = i;
        break;
      }
    }

    this.currentMoveIndex = index;
    const last = index > 0 ? this.moves[index - 1] : null;

    const isEditable = this.data.isEditable && !this.data.isStatic;

    this.board.syncBoard(this.chess, last, {
      movable: isEditable
        ? {
          free: false,
          color: 'both' as Color,
          dests: getValidMoves(this.chess),
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => this.handleUserMove(orig, dest)
          }
        }
        : { free: false, color: undefined },
      moves: this.moves,
      currentMoveIndex: this.currentMoveIndex
    });

    this.updateMoveHighlights();
    this.updateCounter();
    this.updateComment();
    this.board.updateNagOverlay(this.moves, this.currentMoveIndex);
    this.board.updateNagHighlight(this.moves, this.currentMoveIndex);
    this.updateBranchIndicator();
  }

  goToStart(): void {
    this.goToMove(0);
  }

  goToEnd(): void {
    this.goToMove(this.moves.length);
  }

  goForward(): void {
    this.goToMove(this.currentMoveIndex + 1);
  }

  goBack(): void {
    this.goToMove(this.currentMoveIndex - 1);
  }

  goToStartMove(): void {
    if (this.data.startMove > 0) {
      this.goToMove(Math.min(this.data.startMove, this.moves.length));
    }
  }

  // ===========================================================================
  // USER MOVES (editable)
  // ===========================================================================

  async handleUserMove(orig: Key, dest: Key): Promise<void> {
    if (this.destroyed || this.isPromoting) return;

    // Lock to prevent concurrent promotion dialogs
    this.isPromoting = true;
    this.stopAutoPlay();

    try {
      const promotion = await this.board.getPromotion(this.chess, orig, dest);

      const move = this.chess.move({ from: orig, to: dest, promotion });
      if (!move) {
        this.board.syncBoard(this.chess, null);
        return;
      }

      if (
        this.currentMoveIndex < this.mainLineMoves.length &&
        this.mainLineMoves[this.currentMoveIndex].san === move.san
      ) {
        // Move matches main line — just advance
        this.currentMoveIndex++;
        this.board.syncAfterMove(
          this.chess,
          move,
          this.moves,
          this.currentMoveIndex
        );
        this.updateMoveHighlights();
        this.updateCounter();
        this.updateComment();
        this.board.updateNagOverlay(this.moves, this.currentMoveIndex);
        this.board.updateNagHighlight(this.moves, this.currentMoveIndex);
        return;
      }

      // Entering a branch
      if (!this.isInBranch) {
        this.branchStack.push({
          moveIndex: this.currentMoveIndex,
          fen: this.startFen,
          moves: [...this.mainLineMoves]
        });
        this.isInBranch = true;
        this.moves = this.moves.slice(0, this.currentMoveIndex);
      } else {
        this.moves = this.moves.slice(0, this.currentMoveIndex);
      }

      const moveData: MoveData = {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: this.chess.fen()
      };

      this.moves.push(moveData);
      this.currentMoveIndex = this.moves.length;

      this.board.syncAfterMove(
        this.chess,
        move,
        this.moves,
        this.currentMoveIndex
      );
      this.renderMoveList();
      this.updateCounter();
      this.updateComment();
      this.board.updateNagOverlay(this.moves, this.currentMoveIndex);
      this.board.updateNagHighlight(this.moves, this.currentMoveIndex);
      this.updateBranchIndicator();
    } catch (e) {
      this.board.syncBoard(this.chess, null);
    } finally {
      this.isPromoting = false;
    }
  }

  private returnToMainLine(): void {
    if (!this.isInBranch || this.branchStack.length === 0) return;

    const branch = this.branchStack.pop()!;
    this.moves = [...branch.moves];
    this.mainLineMoves = [...branch.moves];
    this.isInBranch = this.branchStack.length > 0;

    this.goToMove(branch.moveIndex);
    this.renderMoveList();
    this.updateBranchIndicator();
  }

  // ===========================================================================
  // AUTOPLAY
  // ===========================================================================

  toggleAutoPlay(): void {
    if (this.isPlaying) {
      this.stopAutoPlay();
    } else {
      this.startAutoPlay();
    }
  }

  private startAutoPlay(): void {
    if (this.isPlaying) return;
    this.isPlaying = true;
    if (this.playBtnEl) {
      this.playBtnEl.textContent = '⏸';
      this.playBtnEl.setAttribute('title', 'Pause (Space)');
    }
    this.playInterval = setInterval(() => {
      if (this.currentMoveIndex >= this.moves.length) {
        this.stopAutoPlay();
        return;
      }
      this.goToMove(this.currentMoveIndex + 1);
    }, this.settings.autoPlaySpeed);
  }

  stopAutoPlay(): void {
    this.isPlaying = false;
    if (this.playBtnEl) {
      this.playBtnEl.textContent = '▶';
      this.playBtnEl.setAttribute('title', 'Play (Space)');
    }
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  // ===========================================================================
  // MOVE LIST UI
  // ===========================================================================

  private renderMoveList(): void {
    if (!this.moveListEl) return;
    this.moveListEl.empty();

    const list = this.moveListEl.createDiv({ cls: 'cv-moves-list' });

    for (let i = 0; i < this.moves.length; i += 2) {
      const row = list.createDiv({ cls: 'cv-move-row' });
      row.createSpan({
        cls: 'cv-move-num',
        text: `${Math.floor(i / 2) + 1}.`
      });

      this.createMoveSpan(row, this.moves[i], i);

      if (i + 1 < this.moves.length) {
        this.createMoveSpan(row, this.moves[i + 1], i + 1);
      }
    }
  }

  private createMoveSpan(
    container: HTMLElement,
    move: MoveData,
    index: number
  ): void {
    const classes = ['cv-move'];
    if (move.comment) classes.push('has-comment');
    if (move.annotations) classes.push('has-annotation');
    if (index === this.currentMoveIndex - 1) classes.push('active');

    const span = container.createSpan({
      cls: classes.join(' '),
      attr: move.comment ? { title: move.comment } : {}
    });

    span.createSpan({ text: this.formatMove(move.san) });

    if (move.nag) {
      const nagClass = NAG_CLASSES[move.nag] || '';
      span.createSpan({
        cls: `cv-move-nag ${nagClass}`,
        text: move.nag
      });
    }

    span.onclick = () => this.goToMove(index + 1);
  }

  private formatMove(san: string): string {
    if (this.settings.notationType === 'figurine') {
      return san.replace(/[KQRBN]/g, (m) => FIGURINE_NOTATION[m] || m);
    }
    return san;
  }

  private updateMoveHighlights(): void {
    if (!this.moveListEl) return;
    const moves = this.moveListEl.querySelectorAll('.cv-move');
    moves.forEach((el, i) => {
      el.removeClass('active');
      if (i === this.currentMoveIndex - 1) {
        el.addClass('active');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
  }

  private updateCounter(): void {
    if (this.counterEl) {
      this.counterEl.textContent = `${this.currentMoveIndex}/${this.moves.length}`;
    }
  }

  private updateComment(): void {
    if (!this.commentEl) return;
    this.commentEl.empty();

    if (this.currentMoveIndex <= 0) {
      this.commentEl.addClass('hidden');
      return;
    }

    const move = this.moves[this.currentMoveIndex - 1];
    const hasNag = move?.nag;
    const hasComment = move?.comment;

    if (!hasNag && !hasComment) {
      this.commentEl.addClass('hidden');
      return;
    }

    this.commentEl.removeClass('hidden');

    if (hasNag) {
      const nagClass = NAG_CLASSES[move.nag!] || '';
      const nagInfo = Object.values(NAG_SYMBOLS).find(
        (n) => n.symbol === move.nag
      );
      const label = nagInfo ? nagInfo.label : move.nag!;

      this.commentEl.createSpan({
        cls: `cv-comment-nag ${nagClass}`,
        text: `${move.nag} ${label}`
      });
    }

    if (hasComment) {
      this.commentEl.createSpan({
        cls: 'cv-comment-text',
        text: move.comment!
      });
    }
  }

  private updateBranchIndicator(): void {
    if (!this.branchOverlayEl) return;
    if (this.isInBranch) {
      this.branchOverlayEl.addClass('visible');
    } else {
      this.branchOverlayEl.removeClass('visible');
    }
  }

  // ===========================================================================
  // CLIPBOARD
  // ===========================================================================

  getClipboardText(): string {
    if (this.data.type === 'fen' || this.moves.length === 0) {
      return this.chess.fen();
    }

    const headers = Object.entries(this.data.headers)
      .map(([k, v]) => `[${k} "${v}"]`)
      .join('\n');

    const movesText = this.moves
      .map((m, i) => {
        let str = i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${m.san}` : m.san;
        if (m.comment && m.comment !== 'wrong') str += ` {${m.comment}}`;
        return str;
      })
      .join(' ');

    return headers ? `${headers}\n\n${movesText}` : movesText;
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  destroy(): void {
    this.destroyed = true;
    this.stopAutoPlay();
    this.moveListEl = null;
    this.commentEl = null;
    this.counterEl = null;
    this.playBtnEl = null;
    this.branchOverlayEl = null;
  }
}