// src/settings.ts
import { App, PluginSettingTab, Setting, Notice, Plugin } from 'obsidian';
import {
  ChessViewSettings,
  DEFAULT_SETTINGS,
  BoardTheme,
  BoardSize,
  PieceSet,
  BOARD_THEMES,
  BOARD_SIZES
} from './types';

interface ChessViewPluginInterface extends Plugin {
  settings: ChessViewSettings;
  saveSettings(): Promise<void>;
}

export class ChessViewSettingTab extends PluginSettingTab {
  plugin: ChessViewPluginInterface;

  constructor(app: App, plugin: ChessViewPluginInterface) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ====================================================================
    // BOARD APPEARANCE
    // ====================================================================
    new Setting(containerEl).setName('Board appearance').setHeading();

    new Setting(containerEl)
      .setName('Board theme')
      .setDesc('Choose the color scheme for the board squares')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            brown: 'Brown (Classic)',
            blue: 'Blue',
            green: 'Green',
            purple: 'Purple',
            gray: 'Gray',
            wood: 'Wood',
            marble: 'Marble',
            custom: 'Custom colors'
          })
          .setValue(this.plugin.settings.boardTheme)
          .onChange((value: string) => {
            this.plugin.settings.boardTheme = value as BoardTheme;
            if (value !== 'custom') {
              const theme = BOARD_THEMES[value as BoardTheme];
              if (theme) {
                this.plugin.settings.lightSquareColor = theme.light;
                this.plugin.settings.darkSquareColor = theme.dark;
              }
            }
            void this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.boardTheme === 'custom') {
      new Setting(containerEl)
        .setName('Light square color')
        .setDesc('Color for light squares')
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.lightSquareColor)
            .onChange((value) => {
              this.plugin.settings.lightSquareColor = value;
              void this.plugin.saveSettings();
            })
        );

      new Setting(containerEl)
        .setName('Dark square color')
        .setDesc('Color for dark squares')
        .addColorPicker((picker) =>
          picker
            .setValue(this.plugin.settings.darkSquareColor)
            .onChange((value) => {
              this.plugin.settings.darkSquareColor = value;
              void this.plugin.saveSettings();
            })
        );
    }

    new Setting(containerEl)
      .setName('Board size')
      .setDesc('Size of the chess board')
      .addDropdown((dropdown) => {
        const options: Record<string, string> = {};
        for (const [key, val] of Object.entries(BOARD_SIZES)) {
          options[key] = val.label;
        }
        return dropdown
          .addOptions(options)
          .setValue(this.plugin.settings.boardSize)
          .onChange((value: string) => {
            this.plugin.settings.boardSize = value as BoardSize;
            void this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Piece set')
      .setDesc('Choose the style of chess pieces')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            cburnett: 'Cburnett (default)',
            merida: 'Merida',
            alpha: 'Alpha',
            pirouetti: 'Pirouetti',
            spatial: 'Spatial',
            california: 'California',
            cardinal: 'Cardinal',
            dubrovny: 'Dubrovny',
            fantasy: 'Fantasy',
            gioco: 'Gioco',
            governor: 'Governor',
            horsey: 'Horsey',
            icpieces: 'IC pieces',
            kosal: 'Kosal',
            leipzig: 'Leipzig',
            maestro: 'Maestro',
            monarchy: 'Monarchy',
            staunty: 'Staunty',
            tatiana: 'Tatiana',
            chess7: 'Chess7'
          })
          .setValue(this.plugin.settings.pieceSet)
          .onChange((value: string) => {
            this.plugin.settings.pieceSet = value as PieceSet;
            void this.plugin.saveSettings();
          })
      );

    // ====================================================================
    // NOTATION
    // ====================================================================
    new Setting(containerEl).setName('Notation').setHeading();

    new Setting(containerEl)
      .setName('Move notation style')
      .setDesc('How pieces are displayed in the move list')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            figurine: 'Figurine (♘f3, ♗c4)',
            letter: 'Letters (Nf3, Bc4)'
          })
          .setValue(this.plugin.settings.notationType)
          .onChange((value: string) => {
            this.plugin.settings.notationType = value as 'figurine' | 'letter';
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show coordinates')
      .setDesc('Display rank and file labels on the board')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showCoordinates)
          .onChange((value) => {
            this.plugin.settings.showCoordinates = value;
            void this.plugin.saveSettings();
          })
      );

    // ====================================================================
    // HIGHLIGHTS & COLORS
    // ====================================================================
    new Setting(containerEl).setName('Colors & highlights').setHeading();

    new Setting(containerEl)
      .setName('Last move highlight')
      .setDesc('Color for highlighting the last move')
      .addColorPicker((picker) =>
        picker
          .setValue(this.rgbaToHex(this.plugin.settings.lastMoveHighlightColor))
          .onChange((value) => {
            this.plugin.settings.lastMoveHighlightColor = this.hexToRgba(
              value,
              0.41
            );
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Check highlight')
      .setDesc('Color for highlighting the king in check')
      .addColorPicker((picker) =>
        picker
          .setValue(this.rgbaToHex(this.plugin.settings.checkHighlightColor))
          .onChange((value) => {
            this.plugin.settings.checkHighlightColor = this.hexToRgba(
              value,
              0.5
            );
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default arrow color')
      .setDesc('Default color for arrows when no color is specified')
      .addColorPicker((picker) =>
        picker
          .setValue(this.rgbaToHex(this.plugin.settings.arrowColor))
          .onChange((value) => {
            this.plugin.settings.arrowColor = this.hexToRgba(value, 0.8);
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default circle color')
      .setDesc('Default color for circles when no color is specified')
      .addColorPicker((picker) =>
        picker
          .setValue(this.rgbaToHex(this.plugin.settings.circleColor))
          .onChange((value) => {
            this.plugin.settings.circleColor = this.hexToRgba(value, 0.8);
            void this.plugin.saveSettings();
          })
      );

    // ====================================================================
    // BEHAVIOR
    // ====================================================================
    new Setting(containerEl).setName('Behavior').setHeading();

    new Setting(containerEl)
      .setName('Animation speed')
      .setDesc('Speed of piece movement animation (ms). 0 to disable.')
      .addSlider((slider) =>
        slider
          .setLimits(0, 500, 50)
          .setValue(this.plugin.settings.animationSpeed)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.animationSpeed = value;
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Autoplay speed')
      .setDesc('Delay between moves during autoplay (ms)')
      .addSlider((slider) =>
        slider
          .setLimits(200, 3000, 100)
          .setValue(this.plugin.settings.autoPlaySpeed)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.autoPlaySpeed = value;
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show move list')
      .setDesc('Display the list of moves alongside the board')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showMoveList).onChange((value) => {
          this.plugin.settings.showMoveList = value;
          void this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Move list position')
      .setDesc('Where to display the move list')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            right: 'Right of board',
            bottom: 'Below board'
          })
          .setValue(this.plugin.settings.moveListPosition)
          .onChange((value: string) => {
            this.plugin.settings.moveListPosition = value as 'right' | 'bottom';
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Show analysis links')
      .setDesc('Display links to Lichess and Chess.com analysis')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showAnalysisLinks)
          .onChange((value) => {
            this.plugin.settings.showAnalysisLinks = value;
            void this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default board orientation')
      .setDesc('Which side to show at the bottom by default')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            white: 'White',
            black: 'Black',
            auto: 'Auto (based on side to move)'
          })
          .setValue(this.plugin.settings.defaultOrientation)
          .onChange((value: string) => {
            this.plugin.settings.defaultOrientation = value as
              | 'white'
              | 'black'
              | 'auto';
            void this.plugin.saveSettings();
          })
      );

    // ====================================================================
    // PUZZLE SETTINGS
    // ====================================================================
    new Setting(containerEl).setName('Puzzle mode').setHeading();

    new Setting(containerEl)
      .setName('Show hints')
      .setDesc('Allow hints in puzzle mode')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.puzzleShowHints)
          .onChange((value) => {
            this.plugin.settings.puzzleShowHints = value;
            void this.plugin.saveSettings();
          })
      );

    // ====================================================================
    // RESET
    // ====================================================================
    new Setting(containerEl).setName('Reset').setHeading();

    new Setting(containerEl)
      .setName('Reset to defaults')
      .setDesc('Restore all settings to their default values')
      .addButton((button) =>
        button
          .setButtonText('Reset')
          .setWarning()
          .onClick(() => {
            Object.assign(this.plugin.settings, DEFAULT_SETTINGS);
            void this.plugin.saveSettings();
            this.display();
            new Notice('ChessView settings reset to defaults');
          })
      );
  }

  private rgbaToHex(rgba: string): string {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const r = parseInt(match[1]).toString(16).padStart(2, '0');
      const g = parseInt(match[2]).toString(16).padStart(2, '0');
      const b = parseInt(match[3]).toString(16).padStart(2, '0');
      return `#${r}${g}${b}`;
    }
    return rgba.startsWith('#') ? rgba : '#000000';
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
