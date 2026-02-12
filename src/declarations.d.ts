// src/declarations.d.ts
declare module '*.css' {
  const content: string;
  export default content;
}

declare module 'chess.js' {
  export interface ChessMove {
    color: 'w' | 'b';
    from: string;
    to: string;
    flags: string;
    piece: string;
    san: string;
    captured?: string;
    promotion?: string;
  }

  export interface BoardSquare {
    type: string;
    color: 'w' | 'b';
  }

  export interface FenValidation {
    valid: boolean;
    error_number: number;
    error: string;
  }

  export class Chess {
    constructor(fen?: string);
    load(fen: string): boolean;
    fen(): string;
    turn(): 'w' | 'b';
    move(
      move: string | { from: string; to: string; promotion?: string },
      options?: { sloppy?: boolean }
    ): ChessMove | null;
    moves(options: { square?: string; verbose: true }): ChessMove[];
    moves(options?: { square?: string; verbose?: false }): string[];
    moves(options?: {
      square?: string;
      verbose?: boolean;
    }): string[] | ChessMove[];
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    game_over(): boolean;
    undo(): ChessMove | null;
    board(): (BoardSquare | null)[][];
    validate_fen(fen: string): FenValidation;
  }
}
