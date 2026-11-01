'use strict';
// tv-indicators.js — расчёт 13 индикаторов TradingView на OHLC-данных.
// Источник правил: конспект «Индикаторы» (см. ../references/indicators.md).
// Чистый Node.js, без зависимостей.
//
// CLI: node tv-indicators.js <ohlc.csv> <indicator> [опции]
//   ma | macd | rsi | ao | stoch | cci | adx | bb | sd | fractals | atr | alligator | ichimoku
// CSV: заголовок с колонками open/high/low/close (порядок/имена — без учёта регистра),
// или без заголовка 4 колонки O,H,L,C.
// Опции: --period N, --type sma|ema|wma, --mult 2, --k 3, --d 3, --last 10 (сколько баров на вывод)
// Пример: node tv-indicators.js xau.csv adx --period 14
// Из кода: const T = require('./tv-indicators.js') — все функции экспортированы.

// ---------- МА и сглаживания ----------
function SMA(a, n) {
  const out = new Array(a.length).fill(null);
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
function EMA(a, n) {
  const out = new Array(a.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null;
  for (let i = 0; i < a.length; i++) {
    prev = prev === null ? a[i] : a[i] * k + prev * (1 - k);
    if (i >= n - 1) out[i] = prev;
  }
  return out;
}
function WMA(a, n) {
  const out = new Array(a.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    if (i >= n) s -= a[i - n];
    if (i >= n - 1) {
      let w = 0, acc = 0;
      for (let j = 0; j < n; j++) { const wt = j + 1; acc += wt * a[i - n + 1 + j]; w += wt; }
      out[i] = acc / denom;
      void w; void s;
    }
  }
  return out;
}
// SMMA (сглаженная MA Уайлдера; = EMA с λ = 1/N) — база Alligator, RSI, ATR, ADX
function SMMA(a, n) {
  const out = new Array(a.length).fill(null);
  let prev = null, s = 0;
  for (let i = 0; i < a.length; i++) {
    if (i < n) { s += a[i]; continue; }
    if (prev === null) prev = s / n;
    else prev = (prev * (n - 1) + a[i]) / n;
    out[i] = prev;
  }
  return out;
}
function shift(arr, k) { // k>0: значения «в будущее», k<0: из будущего
  const out = new Array(arr.length).fill(null);
  for (let i = 0; i < arr.length; i++) {
    const j = i - k; // значение из j-го бара рисуем на i-м
    if (j >= 0 && j < arr.length) out[i] = arr[j];
  }
  return out;
}
function crossing(a, b, level) {
  const sig = [];
  for (let i = 1; i < a.length; i++) {
    if (a[i] === null || b === null || a[i - 1] === null || b === null) continue;
    if (a[i - 1] <= b && a[i] > b) sig.push({ i, dir: 'up', to: level });
    if (a[i - 1] >= b && a[i] < b) sig.push({ i, dir: 'down', to: level });
  }
  return sig;
}
function crossesAbove(a, b) { // a пересекает b (массив или число) снизу вверх
  const sig = [];
  for (let i = 1; i < a.length; i++) {
    const bj = Array.isArray(b) ? b[i] : b, bj1 = Array.isArray(b) ? b[i - 1] : b;
    if (a[i] === null || bj === null || a[i - 1] === null || bj1 === null) continue;
    if (a[i - 1] <= bj1 && a[i] > bj) sig.push({ i, dir: 'up' });
    if (a[i - 1] >= bj1 && a[i] < bj) sig.push({ i, dir: 'down' });
  }
  return sig;
}
function lastVal(a) { for (let i = a.length - 1; i >= 0; i--) if (a[i] !== null && !isNaN(a[i])) return a[i]; return null; }
function tail(a, k) { return a.filter(v => v !== null && !isNaN(v)).slice(-k); }
function rnd(v) { return v === null ? null : +v.toFixed(2); }

// ---------- Данные ----------
function readOHLC(file) {
  const fs = require('fs');
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  let start = 0, oi = 0, hi = 1, lo = 2, ci = 3;
  const head = lines[0].toLowerCase();
  if (/[a-z]/.test(head)) {
    const cols = lines[0].split(/[,;\t]+/).map(c => c.trim().toLowerCase());
    const idx = name => cols.findIndex(c => c.startsWith(name));
    oi = idx('open'); hi = idx('high'); lo = idx('low'); ci = idx('close');
    if (oi < 0 || hi < 0 || lo < 0 || ci < 0) { oi = 0; hi = 1; lo = 2; ci = 3; }
    start = 1;
  }
  const o = [], h = [], l = [], c = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(/[,;\t]+/).filter(Boolean);
    if (cols.length < 4) continue;
    o.push(+cols[oi]); h.push(+cols[hi]); l.push(+cols[lo]); c.push(+cols[ci]);
  }
  return { o, h, l, c };
}

// ---------- Индикаторы ----------
function MA(c, n, type = 'sma') { return type === 'ema' ? EMA(c, n) : type === 'wma' ? WMA(c, n) : SMA(c, n); }

function MACD(c) {
  const line = [];
  const eS = EMA(c, 12), eL = EMA(c, 26);
  for (let i = 0; i < c.length; i++) line.push(eL[i] === null ? null : eS[i] - eL[i]);
  const signal = EMA(line, 9);
  const hist = line.map((v, i) => v === null || signal[i] === null ? null : v - signal[i]);
  return {
    last: { macd: rnd(lastVal(line)), signal: rnd(lastVal(signal)), hist: rnd(lastVal(hist)),
      zeroSide: lastVal(line) > 0 ? 'positive' : 'negative' },
    signals: crossesAbove(line, signal), zeroCross: crossing(line, 0, 'zero'),
  };
}

function RSI(c, n = 14) {
  const gains = [0], losses = [0];
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
  }
  const ag = SMMA(gains, n), al = SMMA(losses, n);
  const out = [];
  for (let i = 0; i < c.length; i++) {
    if (al[i] === null) continue;
    out.push(al[i] === 0 ? 100 : 100 - 100 / (1 + ag[i] / al[i]));
  }
  const rsi = out.map((v, i) => (i < n ? null : v));
  return {
    last: { rsi: rnd(lastVal(rsi)) },
    signals: [...crossesAbove(rsi, 30), ...crossesAbove(rsi, 70), ...crossesAbove(rsi, 50)],
  };
}

function AO(h, l) {
  const tp = h.map((v, i) => (v + l[i]) / 2);
  const s5 = SMA(tp, 5), s34 = SMA(tp, 34);
  const ao = s34.map((v, i) => v === null ? null : s5[i] - v);
  return {
    last: { ao: rnd(lastVal(ao)), zone: lastVal(ao) > 0 ? 'positive' : 'negative' },
    zeroCross: crossing(ao, 0, 'zero'),
  };
}

function StochHLC(h, l, c, n = 14, kS = 3, dS = 3) {
  const raw = [];
  for (let i = 0; i < c.length; i++) {
    if (i < n - 1) { raw.push(null); continue; }
    const hh = Math.max(...h.slice(i - n + 1, i + 1)), ll = Math.min(...l.slice(i - n + 1, i + 1));
    raw.push(hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100);
  }
  // сглаживание быстрой %K, затем %D = SMA от сглаженной %K
  const kSm = SMA(raw.map(v => v === null ? 0 : v), kS).map(v => (typeof v === 'number' && v !== 0) || true ? null : null);
  void kSm;
  const kLine = SMA(raw.map((v, i) => v === null ? null : v), kS);
  const dLine = SMA(kLine.map(v => v === null ? 0 : v), dS).map((v, i) => kLine[i] === null ? null : v);
  return {
    last: { k: rnd(lastVal(kLine)), d: rnd(lastVal(dLine)),
      zone: lastVal(kLine) > 80 ? 'overbought' : lastVal(kLine) < 20 ? 'oversold' : 'mid' },
    signals: crossesAbove(kLine, dLine),
  };
}

function CCI(h, l, c, n = 20) {
  const tp = h.map((v, i) => (v + l[i] + c[i]) / 3);
  const out = [];
  for (let i = 0; i < tp.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    const win = tp.slice(i - n + 1, i + 1);
    const m = win.reduce((s, v) => s + v, 0) / n;
    const mad = win.reduce((s, v) => s + Math.abs(v - m), 0) / n;
    out.push(mad === 0 ? 0 : (tp[i] - m) / (0.015 * mad));
  }
  return {
    last: { cci: rnd(lastVal(out)), zone: lastVal(out) > 100 ? 'overbought' : lastVal(out) < -100 ? 'oversold' : 'norm' },
    signals: crossing(out, 100, '+100').concat(crossing(out, -100, '-100')),
  };
}

function ADX(h, l, c, n = 14) {
  const plusDM = [0], minusDM = [0], tr = [0];
  for (let i = 1; i < h.length; i++) {
    plusDM.push((h[i] - h[i - 1] > l[i - 1] - l[i] && h[i] - h[i - 1] > 0) ? h[i] - h[i - 1] : 0);
    minusDM.push((l[i - 1] - l[i] > h[i] - h[i - 1] && l[i - 1] - l[i] > 0) ? l[i - 1] - l[i] : 0);
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const atr = SMMA(tr, n), pdi = [], mdi = [], pdm = SMMA(plusDM, n), mdm = SMMA(minusDM, n);
  for (let i = 0; i < h.length; i++) {
    if (atr[i] === null || !atr[i]) { pdi.push(null); mdi.push(null); continue; }
    pdi.push(100 * pdm[i] / atr[i]); mdi.push(100 * mdm[i] / atr[i]);
  }
  const dx = pdi.map((v, i) => {
    if (v === null) return null;
    const s = v + mdi[i];
    return s ? 100 * Math.abs(v - mdi[i]) / s : 0;
  });
  const adxLine = SMMA(dx.map(v => v === null ? 0 : v), n).map((v, i) => i < 2 * n - 1 ? null : v);
  const adxV = lastVal(adxLine);
  return {
    last: { adx: rnd(adxV), pdi: rnd(lastVal(pdi)), mdi: rnd(lastVal(mdi)),
      regime: !adxV ? 'n/a' : adxV < 20 ? 'flat/no-trend' : adxV < 25 ? 'forming' : adxV <= 50 ? 'strong-trend' : 'extreme/watch-for-reversal' },
    signals: crossesAbove(pdi, mdi),
  };
}

function BB(c, n = 20, mult = 2) {
  const mid = SMA(c, n);
  const up = [], low = [], bw = [], pctB = [];
  for (let i = 0; i < c.length; i++) {
    if (mid[i] === null) { up.push(null); low.push(null); bw.push(null); pctB.push(null); continue; }
    const win = c.slice(i - n + 1, i + 1);
    const s = win.reduce((s2, v) => s2 + (v - mid[i]) ** 2, 0) / n;
    const sd = Math.sqrt(s);
    up.push(mid[i] + mult * sd); low.push(mid[i] - mult * sd);
    bw.push(4 * mult * sd / mid[i] * 100);
    pctB.push((c[i] - low[i]) / (up[i] - low[i]) * 100);
  }
  const touchUp = c.map((v, i) => up[i] !== null && v > up[i]);
  const touchLow = c.map((v, i) => low[i] !== null && v < low[i]);
  // squeeze: bandwidth в нижних 20% своей истории за 250 баров
  const lastBW = [];
  for (let i = 0; i < bw.length; i++) if (bw[i] !== null) lastBW.push(bw[i]);
  const hist = lastBW.slice(-250);
  const sorted = [...hist].sort((x, y) => x - y);
  const squeeze = sorted.length > 50 && lastBW[lastBW.length - 1] < sorted[Math.floor(sorted.length * 0.2)];
  return {
    last: { mid: rnd(lastVal(mid)), up: rnd(lastVal(up)), low: rnd(lastVal(low)),
      bandwidth: rnd(lastVal(bw)), pctB: rnd(lastVal(pctB)), squeeze },
    touches: { upper: touchUp.lastIndexOf(true), lower: touchLow.lastIndexOf(true) },
  };
}

function SD(c, n = 20) {
  const out = [];
  for (let i = 0; i < c.length; i++) {
    if (i < n - 1) { out.push(null); continue; }
    const win = c.slice(i - n + 1, i + 1);
    const m = win.reduce((s, v) => s + v, 0) / n;
    out.push(Math.sqrt(win.reduce((s2, v) => s2 + (v - m) ** 2, 0) / n));
  }
  const sd = lastVal(out), prev = (() => { const t = out.filter(v => v !== null); return t.length > 1 ? t[t.length - 2] : null; })();
  return { last: { sd: rnd(sd), sdRising: prev !== null ? sd > prev : null } };
}

function Fractals(h, l) {
  const up = [], down = [];
  for (let i = 2; i < h.length - 2; i++) {
    if (h[i] > h[i - 1] && h[i] > h[i - 2] && h[i] > h[i + 1] && h[i] > h[i + 2]) up.push({ i, level: h[i] });
    if (l[i] < l[i - 1] && l[i] < l[i - 2] && l[i] < l[i + 1] && l[i] < l[i + 2]) down.push({ i, level: l[i] });
  }
  return { last: { lastUp: up.length ? { bar: up[up.length - 1].i, price: rnd(up[up.length - 1].level) } : null,
    lastDown: down.length ? { bar: down[down.length - 1].i, price: rnd(down[down.length - 1].level) } : null },
    up, down };
}

function ATR(h, l, c, n = 14) {
  const tr = [null];
  for (let i = 1; i < h.length; i++) {
    tr.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  const filled = tr.map(v => v === null ? 0 : v);
  const atr = SMMA(filled, n).map((v, i) => tr[i] === null ? null : v);
  const a = lastVal(atr);
  return { last: { atr: rnd(a), stop1_5x: rnd(a * 1.5), stop3x: rnd(a * 3) } };
}

function Alligator(h, l) {
  // сдвиг в будущее на k: значение SMMA бара (i-k) отображается на баре i
  const draw = (arr, k) => arr.map((v, i) => i - k >= 0 ? arr[i - k] : null);
  const m = h.map((v, i) => (v + l[i]) / 2);
  return { lips: draw(SMMA(m, 5), 3), teeth: draw(SMMA(m, 8), 5), jaw: draw(SMMA(m, 13), 8) };
}

function alligatorState({ lips, teeth, jaw, c }) {
  const L = lastVal(lips), T = lastVal(teeth), J = lastVal(jaw), P = c[c.length - 1];
  let state;
  if (L > T && T > J) state = 'awake-up (bull)';
  else if (L < T && T < J) state = 'awake-down (bear)';
  else state = 'asleep/mixed (flat)';
  return { last: { lips: rnd(L), teeth: rnd(T), jaw: rnd(J), close: rnd(P), state },
    signals: crossesAbove(lips, teeth) };
}

function Ichimoku(h, l, c) {
  const hh = (n, i) => Math.max(...h.slice(i - n + 1, i + 1));
  const ll = (n, i) => Math.min(...l.slice(i - n + 1, i + 1));
  const tenkan = [], kijun = [], spanA = [], spanB = [];
  for (let i = 0; i < c.length; i++) {
    tenkan.push(i >= 8 ? (hh(9, i) + ll(9, i)) / 2 : null);
    kijun.push(i >= 25 ? (hh(26, i) + ll(26, i)) / 2 : null);
    // Spans строятся от прошлых баров и рисуются со сдвигом +26 вперёд
    spanA.push(i >= 25 ? (tenkan[i] + kijun[i]) / 2 : null);
    spanB.push(i >= 51 ? (hh(52, i) + ll(52, i)) / 2 : null);
  }
  const cloudTopDrawn = draw(spanA.map((a, i) => a === null || spanB[i] === null ? null : Math.max(a, spanB[i])), 26);
  const cloudBotDrawn = draw(spanA.map((a, i) => a === null || spanB[i] === null ? null : Math.min(a, spanB[i])), 26);
  const P = c[c.length - 1], ct = lastVal(cloudTopDrawn), cb = lastVal(cloudBotDrawn);
  const position = ct === null ? 'n/a' : P > ct ? 'above-cloud (bull)' : P < cb ? 'below-cloud (bear)' : 'in-cloud (flat)';
  return {
    last: { price: rnd(P), tenkan: rnd(lastVal(tenkan)), kijun: rnd(lastVal(kijun)),
      cloudAheadTop: rnd(ct === null ? null : ct), cloudAheadBottom: rnd(cb === null ? null : cb), position },
    signals: crossesAbove(tenkan, kijun),
  };
}
// сдвиг в будущее на k: значение бара (i-k) рисуется на баре i
function draw(arr, k) { return arr.map((v, i) => i - k >= 0 ? arr[i - k] : null); }

// ---------- Вычисление точки сигнала в ценах ----------
function withPrice(sig, o, h, l, c, extra = {}) {
  return sig.slice(-8).map(s => ({
    bar: s.i, close: +c[s.i].toFixed(2), dir: s.dir, to: s.to ?? '', ...extra,
  }));
}

// ---------- CLI ----------
if (require.main === module) {
  const [, , file, cmd, ...opts] = process.argv;
  const arg = (name, def) => { const i = opts.indexOf('--' + name); return i >= 0 ? (!isNaN(+opts[i + 1]) ? +opts[i + 1] : opts[i + 1]) : def; };
  const LASTK = arg('last', 6);
  if (!file || !cmd || !['ma','macd','rsi','ao','stoch','cci','adx','bb','sd','fractals','atr','alligator','ichimoku'].includes(cmd)) {
    console.log('usage: node tv-indicators.js <ohlc.csv> <ma|macd|rsi|ao|stoch|cci|adx|bb|sd|fractals|atr|alligator|ichimoku> [--period N] [--type sma|ema|wma] [--mult 2] [--k 3] [--d 3] [--last 6]');
    process.exit(1);
  }
  const { o, h, l, c } = readOHLC(file);
  const n = arg('period', null);
  let out;
  switch (cmd) {
    case 'ma': {
      const type = arg('type', 'sma');
      const p = n ?? 20;
      const v = MA(c, p, type);
      out = { indicator: `MA ${type}(${p})`, values: tail(v, LASTK).map(rnd) };
      break;
    }
    case 'macd': { const r = MACD(c); out = { indicator: 'MACD(12,26,9)', last: r.last,
      signals: withPrice(r.signals, o, h, l, c), zeroCross: withPrice(r.zeroCross, o, h, l, c).slice(-4) }; break; }
    case 'rsi': { const p = n ?? 14; const r = RSI(c, p); out = { indicator: `RSI(${p})`, last: r.last,
      signals: withPrice(r.signals.filter(s => s.to !== '50'), o, h, l, c).filter(s => s.i >= c.length - 60),
      mid50: withPrice(r.signals.filter(s => s.to === '50'), o, h, l, c).slice(-3) }; break; }
    case 'ao': { const r = AO(h, l); out = { indicator: 'AO(5,34,median)', last: r.last,
      zeroCross: withPrice(r.zeroCross, o, h, l, c).slice(-4) }; break; }
    case 'stoch': { const p = n ?? 14; const r = StochHLC(h, l, c, p, arg('k', 3), arg('d', 3));
      out = { indicator: `Stoch(${p},${arg('k',3)},${arg('d',3)})`, last: r.last,
        signals: withPrice(r.signals, o, h, l, c).filter(s => s.i >= c.length - 60) }; break; }
    case 'cci': { const p = n ?? 20; const r = CCI(h, l, c, p); out = { indicator: `CCI(${p})`, last: r.last,
      signals: withPrice(r.signals, o, h, l, c).filter(s => s.i >= c.length - 60) }; break; }
    case 'adx': { const p = n ?? 14; const r = ADX(h, l, c, p); out = { indicator: `ADX(${p})`, last: r.last,
      signals: withPrice(r.signals, o, h, l, c).filter(s => s.i >= c.length - 60) }; break; }
    case 'bb': { const p = n ?? 20; const r = BB(c, p, arg('mult', 2)); out = { indicator: `BB(${p},${arg('mult',2)})`, last: r.last, touches: r.touches }; break; }
    case 'sd': { const p = n ?? 20; out = { indicator: `SD(${p})`, last: SD(c, p).last }; break; }
    case 'fractals': { const r = Fractals(h, l); out = { indicator: 'Fractals(5)', last: r.last,
      recentUp: r.up.slice(-5).map(f => ({ bar: f.i, price: rnd(f.level) })), recentDown: r.down.slice(-5).map(f => ({ bar: f.i, price: rnd(f.level) })) }; break; }
    case 'atr': { const p = n ?? 14; out = { indicator: `ATR(${p})`, last: ATR(h, l, c, p).last }; break; }
    case 'alligator': { const al = Alligator(h, l); const r = alligatorState({ lips: al.lips, teeth: al.teeth, jaw: al.jaw, c });
      out = { indicator: 'Alligator(13,8,5; shifts 8,5,3)', last: r.last,
        signals: withPrice(r.signals, o, h, l, c).filter(s => s.i >= c.length - 60) }; break; }
    case 'ichimoku': { const r = Ichimoku(h, l, c); out = { indicator: 'Ichimoku(9,26,52)', last: r.last,
      signals: withPrice(r.signals, o, h, l, c).filter(s => s.i >= c.length - 60) }; break; }
  }
  console.log(JSON.stringify(out, null, 1));
}

module.exports = { SMA, EMA, WMA, SMMA, shift, MA, MACD, RSI, AO, StochHLC, CCI, ADX, BB, SD, Fractals, ATR, Alligator, alligatorState, Ichimoku, readOHLC };