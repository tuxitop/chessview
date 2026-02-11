import fs from 'fs';
import path from 'path';

const ASSETS_DIR = 'assets/pieces';
const OUTPUT_FILE = 'styles.css';
const MARKER = '/* === AUTO-GENERATED PIECE SETS — do not edit below === */';

const PIECE_MAP = [
  { css: 'piece.white.king', file: 'wK' },
  { css: 'piece.white.queen', file: 'wQ' },
  { css: 'piece.white.rook', file: 'wR' },
  { css: 'piece.white.bishop', file: 'wB' },
  { css: 'piece.white.knight', file: 'wN' },
  { css: 'piece.white.pawn', file: 'wP' },
  { css: 'piece.black.king', file: 'bK' },
  { css: 'piece.black.queen', file: 'bQ' },
  { css: 'piece.black.rook', file: 'bR' },
  { css: 'piece.black.bishop', file: 'bB' },
  { css: 'piece.black.knight', file: 'bN' },
  { css: 'piece.black.pawn', file: 'bP' }
];

function svgToDataUri(svgContent) {
  const encoded = svgContent
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  return `url("data:image/svg+xml,${encoded}")`;
}

// Read existing styles.css
let existingCss = fs.readFileSync(OUTPUT_FILE, 'utf8');

// Remove old generated content
const markerIndex = existingCss.indexOf(MARKER);
if (markerIndex !== -1) {
  existingCss = existingCss.substring(0, markerIndex).trimEnd();
}

// Find all piece set directories
const sets = fs
  .readdirSync(ASSETS_DIR)
  .filter((d) => fs.statSync(path.join(ASSETS_DIR, d)).isDirectory());

// Build new piece CSS
let pieceCss = '\n\n' + MARKER + '\n\n';

for (const set of sets) {
  const setDir = path.join(ASSETS_DIR, set);
  let hasAllPieces = true;

  for (const piece of PIECE_MAP) {
    if (!fs.existsSync(path.join(setDir, `${piece.file}.svg`))) {
      console.warn(`Missing: ${set}/${piece.file}.svg — skipping set`);
      hasAllPieces = false;
      break;
    }
  }

  if (!hasAllPieces) continue;

  pieceCss += `/* ${set} */\n`;
  for (const piece of PIECE_MAP) {
    const svgContent = fs.readFileSync(
      path.join(setDir, `${piece.file}.svg`),
      'utf8'
    );
    const dataUri = svgToDataUri(svgContent);
    pieceCss += `.chessview[data-piece-set='${set}'] .cg-wrap ${piece.css} {\n`;
    pieceCss += `  background-image: ${dataUri} !important;\n`;
    pieceCss += `}\n`;
  }
  pieceCss += '\n';
}

fs.writeFileSync(OUTPUT_FILE, existingCss + pieceCss);
console.log(`Embedded ${sets.length} piece sets into ${OUTPUT_FILE}`);
