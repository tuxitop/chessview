// src/main.ts
import {
  Plugin,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
} from 'obsidian';
import { ChessViewSettings, DEFAULT_SETTINGS } from './types';
import { ChessViewSettingTab } from './settings';
import { parseChessInput } from './parser';
import { ChessRenderer } from './chess-renderer';

class ChessRenderChild extends MarkdownRenderChild {
  private renderer: ChessRenderer;

  constructor(containerEl: HTMLElement, renderer: ChessRenderer) {
    super(containerEl);
    this.renderer = renderer;
  }

  onunload(): void {
    this.renderer.destroy();
  }
}

export default class ChessViewPlugin extends Plugin {
  settings!: ChessViewSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor(
      'chessview',
      (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        this.processChessBlock(source, el, ctx);
      }
    );

    this.addSettingTab(new ChessViewSettingTab(this.app, this));

    this.addCommand({
      id: 'insert-game',
      name: 'Insert game',
      editorCallback: (editor) => {
        editor.replaceSelection(
          '```chessview\n[Event "?"]\n[White "?"]\n[Black "?"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5\n```'
        );
      }
    });

    this.addCommand({
      id: 'insert-fen',
      name: 'Insert position (FEN)',
      editorCallback: (editor) => {
        editor.replaceSelection(
          '```chessview\nrnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1\n```'
        );
      }
    });

    this.addCommand({
      id: 'insert-puzzle',
      name: 'Insert puzzle',
      editorCallback: (editor) => {
        editor.replaceSelection(`\`\`\`chessview
[puzzle]
[rating: 1500]
[title: White to move and win]
---
[FEN "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 3"]

1. Qxf7#
\`\`\``);
      }
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private processChessBlock(
    source: string,
    el: HTMLElement,
    ctx: MarkdownPostProcessorContext
  ): void {
    try {
      const container = el.createDiv({ cls: 'chessview-container' });
      const data = parseChessInput(source);
      const renderer = new ChessRenderer(container, data, this.settings);
      renderer.render();
      ctx.addChild(new ChessRenderChild(container, renderer));
    } catch (error) {
      console.error('ChessView Error:', error);
      el.createDiv({
        cls: 'chessview-error',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
}