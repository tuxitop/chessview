// src/navigation-controller.ts
import { Chess } from 'chess.js';
import { Key } from 'chessground/types';

import {
  ChessViewSettings,
  ParsedChessData,
  MoveNode,
  MoveData,
  FIGURINE_NOTATION,
  UI_LABELS,
  resolveNag,
  NAG_BY_CODE
} from './types';
import { BoardManager } from './board-manager';
import { getValidMoves } from './utils';

export class NavigationController {
  private chess: Chess;
  private data: ParsedChessData;
  private settings: ChessViewSettings;
  private board: BoardManager;
  private startFen: string;

  private moveTree: MoveNode[] = [];
  private currentLine: MoveNode[] = [];
  private currentIndex: number = 0;
  private lineStack: { line: MoveNode[]; index: number }[] = [];

  private isPlaying: boolean = false;
  private playInterval: ReturnType<typeof setInterval> | null = null;

  private moveListEl: HTMLElement | null = null;
  private commentEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private playBtnEl: HTMLElement | null = null;

  private firstBtnEl: HTMLElement | null = null;
  private prevBtnEl: HTMLElement | null = null;
  private nextBtnEl: HTMLElement | null = null;
  private lastBtnEl: HTMLElement | null = null;

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
      this.moveTree = data.moves;
      this.currentLine = this.moveTree;
    }
  }

  createMoveList(movesSection: HTMLElement): void {
    this.moveListEl = movesSection.createDiv({ cls: 'cv-moves' });
    this.renderMoveList();
    this.commentEl = movesSection.createDiv({ cls: 'cv-comment' });
  }

  setCounterEl(el: HTMLElement): void {
    this.counterEl = el;
    this.updateCounter();
  }

  setPlayBtnEl(el: HTMLElement): void {
    this.playBtnEl = el;
  }

  setNavButtons(
    first: HTMLElement,
    prev: HTMLElement,
    next: HTMLElement,
    last: HTMLElement
  ): void {
    this.firstBtnEl = first;
    this.prevBtnEl = prev;
    this.nextBtnEl = next;
    this.lastBtnEl = last;
    this.updateNavButtons();
  }

  get moveCount(): number {
    return this.moveTree.length;
  }

  get currentMoveIndex(): number {
    return this.currentIndex;
  }

  get currentMoves(): readonly MoveNode[] {
    return this.currentLine;
  }

  private get inVariation(): boolean {
    return this.lineStack.length > 0;
  }

  private get isAtStart(): boolean {
    return this.currentIndex === 0 && !this.inVariation;
  }

  private get isAtEnd(): boolean {
    return this.currentIndex >= this.currentLine.length;
  }

  private get canGoBack(): boolean {
    if (this.inVariation) return true;
    return this.currentIndex > 0;
  }

  private get canGoForward(): boolean {
    return this.currentIndex < this.currentLine.length;
  }

  // =====================================================================
  // NAVIGATION
  // =====================================================================

  goToMove(index: number): void {
    if (this.destroyed) return;

    index = Math.max(0, Math.min(this.currentLine.length, index));

    this.replayToPosition(this.currentLine, index);
    this.currentIndex = index;

    const last = index > 0 ? this.currentLine[index - 1] : null;
    const lastMoveData = last
      ? { san: last.san, from: last.from, to: last.to, fen: last.fen }
      : null;

    const isEditable = this.data.isEditable && !this.data.isStatic;

    this.board.syncBoard(this.chess, lastMoveData, {
      movable: isEditable
        ? {
          free: false,
          color: 'both',
          dests: getValidMoves(this.chess),
          showDests: true,
          events: {
            after: (orig: Key, dest: Key) => {
              void this.handleUserMove(orig, dest);
            }
          }
        }
        : { free: false, color: undefined },
      moves: this.currentLine.map(nodeToMoveData),
      currentMoveIndex: this.currentIndex
    });

    this.renderMoveList();
    this.updateCounter();
    this.updateComment();
    this.updateNavButtons();
    this.board.updateNagOverlay(
      this.currentLine.map(nodeToMoveData),
      this.currentIndex
    );
    this.board.updateNagHighlight(
      this.currentLine.map(nodeToMoveData),
      this.currentIndex
    );
  }

  goToVariation(parentLine: MoveNode[], moveIndex: number, varIndex: number): void {
    if (this.destroyed) return;

    const parentMove = parentLine[moveIndex];
    if (!parentMove || !parentMove.variations[varIndex]) return;

    this.lineStack.push({
      line: this.currentLine,
      index: moveIndex + 1
    });

    this.currentLine = parentMove.variations[varIndex];
    this.currentIndex = 0;

    this.goToMove(0);
  }

  goToMoveInLine(line: MoveNode[], index: number): void {
    if (this.destroyed) return;

    if (line === this.currentLine) {
      this.goToMove(index);
      return;
    }

    const path = this.findLinePath(this.moveTree, line);
    if (!path) return;

    this.lineStack = [];
    this.currentLine = this.moveTree;

    for (const segment of path) {
      this.lineStack.push({
        line: this.currentLine,
        index: segment.parentMoveIndex + 1
      });
      this.currentLine = segment.line;
    }

    this.goToMove(index);
  }

  private findLinePath(
    searchIn: MoveNode[],
    target: MoveNode[]
  ): { parentMoveIndex: number; line: MoveNode[] }[] | null {
    if (searchIn === target) return [];

    for (let i = 0; i < searchIn.length; i++) {
      const move = searchIn[i];
      for (let v = 0; v < move.variations.length; v++) {
        const varLine = move.variations[v];
        if (varLine === target) {
          return [{ parentMoveIndex: i, line: varLine }];
        }
        const subPath = this.findLinePath(varLine, target);
        if (subPath) {
          return [{ parentMoveIndex: i, line: varLine }, ...subPath];
        }
      }
    }
    return null;
  }

  goToStart(): void {
    if (this.destroyed) return;

    if (!this.inVariation) {
      if (this.currentIndex === 0) return;
      this.goToMove(0);
      return;
    }

    if (this.currentIndex <= 1) {
      // At first move (or before) in a variation — pop up one level
      const parent = this.lineStack.pop()!;
      this.currentLine = parent.line;

      if (this.lineStack.length === 0) {
        // Landed in main line — go to starting position
        this.goToMove(0);
      } else {
        // Landed in another variation — go to its first move
        this.goToMove(1);
      }
    } else {
      // Deeper in a variation — jump to first move of current variation
      this.goToMove(1);
    }
  }

  goToEnd(): void {
    this.goToMove(this.currentLine.length);
  }

  goForward(): void {
    if (this.canGoForward) {
      this.goToMove(this.currentIndex + 1);
    }
  }

  goBack(): void {
    if (this.destroyed) return;

    if (this.inVariation && this.currentIndex <= 1) {
      // At first move (or before) in a variation — pop out to parent
      const parent = this.lineStack.pop()!;
      this.currentLine = parent.line;
      this.goToMove(parent.index - 1);
    } else if (this.currentIndex > 0) {
      this.goToMove(this.currentIndex - 1);
    }
  }

  goToStartMove(): void {
    if (this.data.startMove <= 0) return;

    const target = this.data.startMove;

    let startFullMove = 1;
    let startIsBlack = false;
    if (this.data.fen) {
      const parts = this.data.fen.split(/\s+/);
      startFullMove = parseInt(parts[5] ?? '1') || 1;
      startIsBlack = parts[1] === 'b';
    }

    let plyIndex: number;
    if (target < startFullMove) {
      plyIndex = 0;
    } else if (startIsBlack) {
      if (target === startFullMove) {
        plyIndex = 1;
      } else {
        plyIndex = 1 + (target - startFullMove) * 2;
      }
    } else {
      plyIndex = (target - startFullMove + 1) * 2;
    }

    this.goToMove(Math.min(plyIndex, this.currentLine.length));
  }

  // =====================================================================
  // USER MOVES
  // =====================================================================

  async handleUserMove(orig: Key, dest: Key): Promise<void> {
    if (this.destroyed) return;

    const promotion = await this.board.getPromotion(this.chess, orig, dest);

    try {
      const move = this.chess.move({ from: orig, to: dest, promotion });
      if (!move) return;

      if (
        this.currentIndex < this.currentLine.length &&
        this.currentLine[this.currentIndex].san === move.san
      ) {
        this.currentIndex++;
        this.board.syncAfterMove(
          this.chess,
          move,
          this.currentLine.map(nodeToMoveData),
          this.currentIndex
        );
        this.renderMoveList();
        this.updateCounter();
        this.updateComment();
        this.updateNavButtons();
        this.board.updateNagOverlay(
          this.currentLine.map(nodeToMoveData),
          this.currentIndex
        );
        this.board.updateNagHighlight(
          this.currentLine.map(nodeToMoveData),
          this.currentIndex
        );
        return;
      }

      if (this.currentIndex < this.currentLine.length) {
        const currentMove = this.currentLine[this.currentIndex];
        for (let v = 0; v < currentMove.variations.length; v++) {
          if (
            currentMove.variations[v].length > 0 &&
            currentMove.variations[v][0].san === move.san
          ) {
            this.chess.undo();
            this.goToVariation(this.currentLine, this.currentIndex, v);
            this.goToMove(1);
            return;
          }
        }
      }

      const newNode: MoveNode = {
        san: move.san,
        from: move.from,
        to: move.to,
        fen: this.chess.fen(),
        variations: []
      };

      if (this.currentIndex < this.currentLine.length) {
        this.currentLine[this.currentIndex].variations.push([newNode]);
        this.chess.undo();
        this.goToVariation(
          this.currentLine,
          this.currentIndex,
          this.currentLine[this.currentIndex].variations.length - 1
        );
        this.goToMove(1);
      } else {
        this.currentLine.push(newNode);
        this.currentIndex = this.currentLine.length;
        this.board.syncAfterMove(
          this.chess,
          move,
          this.currentLine.map(nodeToMoveData),
          this.currentIndex
        );
        this.renderMoveList();
        this.updateCounter();
        this.updateComment();
        this.updateNavButtons();
      }
    } catch {
      this.board.syncBoard(this.chess, null);
    }
  }

  // =====================================================================
  // AUTOPLAY
  // =====================================================================

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
      this.playBtnEl.textContent = UI_LABELS.pause;
      this.playBtnEl.setAttribute('title', UI_LABELS.pauseTooltip);
    }
    this.playInterval = setInterval(() => {
      if (this.currentIndex >= this.currentLine.length) {
        this.stopAutoPlay();
        return;
      }
      this.goToMove(this.currentIndex + 1);
    }, this.settings.autoPlaySpeed);
  }

  stopAutoPlay(): void {
    this.isPlaying = false;
    if (this.playBtnEl) {
      this.playBtnEl.textContent = UI_LABELS.play;
      this.playBtnEl.setAttribute('title', UI_LABELS.playTooltip);
    }
    if (this.playInterval) {
      clearInterval(this.playInterval);
      this.playInterval = null;
    }
  }

  // =====================================================================
  // MOVE LIST RENDERING
  // =====================================================================

  private renderMoveList(): void {
    if (!this.moveListEl) return;
    this.moveListEl.empty();

    const container = this.moveListEl.createDiv({ cls: 'cv-moves-tree' });

    let baseMoveNum = 1;
    let baseIsBlack = false;
    if (this.data.fen) {
      const parts = this.data.fen.split(/\s+/);
      baseMoveNum = parseInt(parts[5] ?? '1') || 1;
      baseIsBlack = parts[1] === 'b';
    }

    this.renderLine(container, this.moveTree, 0, baseMoveNum, baseIsBlack);
  }

  private renderLine(
    container: HTMLElement,
    line: MoveNode[],
    depth: number,
    startMoveNum: number,
    startsOnBlack: boolean
  ): void {
    let moveNum = startMoveNum;
    let isBlack = startsOnBlack;
    let i = 0;

    if (isBlack && line.length > 0) {
      const row = container.createDiv({
        cls: depth === 0 ? 'cv-moves-row' : 'cv-moves-row cv-variation-row'
      });
      row.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });
      row.createSpan({ cls: 'cv-move-placeholder', text: UI_LABELS.movePlaceholder });
      this.createMoveSpan(row, line[0], line, 0, depth);

      this.renderVariationsForMove(container, line[0], depth, moveNum, true);

      i = 1;
      moveNum++;
      isBlack = false;
    }

    while (i < line.length) {
      const row = container.createDiv({
        cls: depth === 0 ? 'cv-moves-row' : 'cv-moves-row cv-variation-row'
      });

      row.createSpan({ cls: 'cv-move-num', text: `${moveNum}.` });

      this.createMoveSpan(row, line[i], line, i, depth);
      const whiteMove = line[i];
      i++;

      if (i < line.length) {
        this.createMoveSpan(row, line[i], line, i, depth);
        const blackMove = line[i];
        i++;

        this.renderVariationsForMove(container, whiteMove, depth, moveNum, false);
        this.renderVariationsForMove(container, blackMove, depth, moveNum, true);
      } else {
        row.createSpan({ cls: 'cv-move-empty' });
        this.renderVariationsForMove(container, whiteMove, depth, moveNum, false);
      }

      moveNum++;
    }
  }

  private renderVariationsForMove(
    container: HTMLElement,
    move: MoveNode,
    depth: number,
    moveNum: number,
    parentIsBlack: boolean
  ): void {
    if (move.variations.length === 0) return;

    for (const variation of move.variations) {
      if (variation.length === 0) continue;

      const varContainer = container.createDiv({ cls: 'cv-variation' });
      if (depth >= 2) {
        varContainer.addClass('cv-variation-deep');
      }

      this.renderLine(varContainer, variation, depth + 1, moveNum, parentIsBlack);
    }
  }

  private createMoveSpan(
    container: HTMLElement,
    move: MoveNode,
    line: MoveNode[],
    index: number,
    _depth: number
  ): void {
    const isActive = line === this.currentLine && index === this.currentIndex - 1;

    const classes = ['cv-move'];
    if (move.comment) classes.push('has-comment');
    if (move.annotations) classes.push('has-annotation');
    if (isActive) classes.push('active');

    const span = container.createSpan({
      cls: classes.join(' '),
      attr: move.comment ? { title: move.comment } : {}
    });

    span.createSpan({ text: this.formatMove(move.san) });

    if (move.nag) {
      const def = resolveNag(move.nag);
      if (def) {
        span.createSpan({
          cls: `cv-move-nag ${def.cssClass}`,
          text: def.symbol
        });
      }
    }

    span.onclick = () => {
      this.goToMoveInLine(line, index + 1);
    };

    if (isActive) {
      setTimeout(() => {
        span.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }, 0);
    }
  }

  private formatMove(san: string): string {
    if (this.settings.notationType === 'figurine') {
      return san.replace(/[KQRBN]/g, (m) => FIGURINE_NOTATION[m] ?? m);
    }
    return san;
  }

  // =====================================================================
  // UI UPDATES
  // =====================================================================

  private updateCounter(): void {
    if (this.counterEl) {
      const prefix = this.inVariation ? '⑂ ' : '';
      this.counterEl.textContent = `${prefix}${this.currentIndex}/${this.currentLine.length}`;
    }
  }

  private updateComment(): void {
    if (!this.commentEl) return;
    this.commentEl.empty();

    if (this.currentIndex <= 0) return;

    const move = this.currentLine[this.currentIndex - 1];
    if (!move) return;

    const hasNag = !!move.nag;
    const hasComment = !!move.comment;

    if (!hasNag && !hasComment) return;

    if (hasNag && move.nag) {
      const def = resolveNag(move.nag);
      if (def) {
        this.commentEl.createSpan({
          cls: `cv-comment-nag ${def.cssClass}`,
          text: `${def.symbol} ${def.label}`
        });
      }
    }

    if (hasComment && move.comment) {
      this.commentEl.createSpan({
        cls: 'cv-comment-text',
        text: move.comment
      });
    }
  }

  private updateNavButtons(): void {
    if (this.firstBtnEl) {
      if (this.isAtStart) {
        this.firstBtnEl.setAttribute('disabled', '');
        this.firstBtnEl.addClass('cv-btn-disabled');
      } else {
        this.firstBtnEl.removeAttribute('disabled');
        this.firstBtnEl.removeClass('cv-btn-disabled');
      }
    }

    if (this.prevBtnEl) {
      if (!this.canGoBack) {
        this.prevBtnEl.setAttribute('disabled', '');
        this.prevBtnEl.addClass('cv-btn-disabled');
      } else {
        this.prevBtnEl.removeAttribute('disabled');
        this.prevBtnEl.removeClass('cv-btn-disabled');
      }
    }

    if (this.nextBtnEl) {
      if (!this.canGoForward) {
        this.nextBtnEl.setAttribute('disabled', '');
        this.nextBtnEl.addClass('cv-btn-disabled');
      } else {
        this.nextBtnEl.removeAttribute('disabled');
        this.nextBtnEl.removeClass('cv-btn-disabled');
      }
    }

    if (this.lastBtnEl) {
      if (this.isAtEnd) {
        this.lastBtnEl.setAttribute('disabled', '');
        this.lastBtnEl.addClass('cv-btn-disabled');
      } else {
        this.lastBtnEl.removeAttribute('disabled');
        this.lastBtnEl.removeClass('cv-btn-disabled');
      }
    }
  }

  // =====================================================================
  // REPLAY
  // =====================================================================

  private replayToPosition(line: MoveNode[], index: number): void {
    this.chess.load(this.startFen);

    for (const frame of this.lineStack) {
      for (let i = 0; i < frame.index - 1; i++) {
        if (i < frame.line.length) {
          try {
            this.chess.move(frame.line[i].san);
          } catch {
            return;
          }
        }
      }
    }

    for (let i = 0; i < index; i++) {
      if (i < line.length) {
        try {
          this.chess.move(line[i].san);
        } catch {
          return;
        }
      }
    }
  }

  // =====================================================================
  // CLIPBOARD
  // =====================================================================

  getClipboardText(): string {
    if (this.data.type === 'fen' || this.moveTree.length === 0) {
      return this.chess.fen();
    }

    const headers = Object.entries(this.data.headers)
      .map(([k, v]) => `[${k} "${v}"]`)
      .join('\n');

    let startMoveNum = 1;
    let startIsBlack = false;
    if (this.data.fen) {
      const parts = this.data.fen.split(/\s+/);
      startMoveNum = parseInt(parts[5] ?? '1') || 1;
      startIsBlack = parts[1] === 'b';
    }

    const movesText = this.serializeLine(this.moveTree, startMoveNum, startIsBlack);

    return headers ? `${headers}\n\n${movesText}` : movesText;
  }

  private serializeLine(
    line: readonly MoveNode[],
    startMoveNum: number,
    startsOnBlack: boolean
  ): string {
    const parts: string[] = [];
    let moveNum = startMoveNum;
    let isBlack = startsOnBlack;

    for (let i = 0; i < line.length; i++) {
      const move = line[i];

      if (!isBlack) {
        parts.push(`${moveNum}.`);
      } else if (i === 0) {
        parts.push(`${moveNum}...`);
      }

      parts.push(move.san);

      if (move.nag) {
        const def = NAG_BY_CODE[move.nag];
        if (def) {
          // Use inline PGN form if available (e.g. '!'), otherwise $N code
          parts.push(def.inlinePgn ?? def.code);
        }
      }

      if (move.comment && move.comment !== 'wrong') {
        parts.push(`{${move.comment}}`);
      }

      for (const variation of move.variations) {
        const varText = this.serializeLine(
          variation,
          moveNum,
          !isBlack
        );
        parts.push(`(${varText})`);
      }

      if (isBlack) moveNum++;
      isBlack = !isBlack;
    }

    return parts.join(' ');
  }

  // =====================================================================
  // CLEANUP
  // =====================================================================

  destroy(): void {
    this.destroyed = true;
    this.stopAutoPlay();
    this.moveListEl = null;
    this.commentEl = null;
    this.counterEl = null;
    this.playBtnEl = null;
    this.firstBtnEl = null;
    this.prevBtnEl = null;
    this.nextBtnEl = null;
    this.lastBtnEl = null;
  }
}

// =====================================================================
// HELPERS
// =====================================================================

function nodeToMoveData(node: MoveNode): MoveData {
  return {
    san: node.san,
    from: node.from,
    to: node.to,
    fen: node.fen,
    comment: node.comment,
    nag: node.nag,
    annotations: node.annotations
  };
}