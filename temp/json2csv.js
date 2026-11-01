// temp/json2csv.js — конвертация баров MCP (rows JSON) в CSV для пайплайна.
// Использование: node json2csv.js <in.json> <out.csv>
// in.json: {"bars":[{"t":...,"o":...,"h":...,"l":...,"c":...,"v":...}]} или массив баров.
'use strict';
const fs = require('fs');
const [inPath, outPath] = process.argv.slice(2);
const j = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const bars = Array.isArray(j) ? j : j.bars;
if (!Array.isArray(bars) || !bars.length) { console.error('нет баров'); process.exit(1); }
const lines = ['open,high,low,close,volume'];
for (const b of bars) {
  lines.push([b.o, b.h, b.l, b.c, b.v ?? 0].join(','));
}
fs.writeFileSync(outPath, lines.join('\n') + '\n');
console.log(`${bars.length} баров -> ${outPath}`);