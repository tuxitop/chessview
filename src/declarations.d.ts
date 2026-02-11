// src/declarations.d.ts
declare module '*.css' {
  const content: string;
  export default content;
}

declare module 'chess.js' {
  export class Chess {
    constructor(fen?: string);
    load(fen: string): boolean;
    fen(): string;
    turn(): 'w' | 'b';
    move(
      move: string | { from: string; to: string; promotion?: string },
      options?: { sloppy?: boolean }
    ): any;
    moves(options?: { square?: string; verbose?: boolean }): any[];
    in_check(): boolean;
    in_checkmate(): boolean;
    in_stalemate(): boolean;
    in_draw(): boolean;
    game_over(): boolean;
    undo(): any;
    board(): any[][];
    validate_fen(fen: string): {
      valid: boolean;
      error_number: number;
      error: string;
    };
  }
}
