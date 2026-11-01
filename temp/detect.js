// temp/detect.js — расчёт значений для правил R1–R3 по всем файлам MVP.
// Выход: JSON-строка по каждому symbol×TF. Запуск: node temp/detect.js
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('./tv-indicators.js');
const { RW } = require('./ta-tools.js');

const BASE = __dirname;
const syms = ['XAUUSD', 'XAGUSD', 'NGAS', 'UKOIL', 'CC1'];
const tfs = ['1h', '4h', '1d'];
const out = {};

for (const sym of syms) {
  out[sym] = {};
  for (const tf of tfs) {
    const file = path.join(BASE, sym + '_' + tf + '.csv');
    if (!fs.existsSync(file)) { out[sym][tf] = { error: 'no data' }; continue; }
    const { o, h, l, c } = T.readOHLC(file);
    const n = c.length;
    const last = n - 1;
    const rsiSeries = T.RSI(c, 14).last ? T.RSI(c, 14).last : null;
    // серия RSI последних 6 закрытых баров (без последнего незакрытого не distinguishing — считаем по всем барам как есть)
    const rsiVals = T.RSI(c, 14).last === undefined ? [] : [];
    const rsiArr = T.RSI(c, 14);
    const rsiLast6 = [];
    // RSI возвращает только last — пересчитаем через доступ к объекту
    const rsiObj = T.RSI(c, 14);
    const rsiNow = rsiObj.last.rsi;
    // EMA20/EMA50 два последних значения
    const emaF = a => (+a[a.length - 1]).toPrecision(8) * 1;
    const ema20 = T.EMA(c, 20), ema50 = T.EMA(c, 50), ema20s = T.SMA(c, 20);
    const e20 = [ema20[n - 2], ema20[n - 1]];
    const e50 = [ema50[n - 2], ema50[n - 1]];
    const s20 = [ema20s[n - 2], ema20s[n - 1]];
    let adx = null;
    try { adx = T.ADX(h, l, c, 14).last; } catch (e) {}
    let atr = null;
    try { atr = T.ATR(h, l, c, 14).last.atr; } catch (e) {}
    let rsiPrev = null;
    try {
      // приблизим серию RSI: пересчёт вручную
      const gains = [0], losses = [0];
      for (let i = 1; i <= n - 1; i++) {
        const d = c[i] - c[i - 1];
        gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
      }
      const ag = T.SMMA(gains, 14), al = T.SMMA(losses, 14);
      for (let i = 0; i < n; i++) {
        if (ag[i] === null || ag[i] === 0) continue;
        const rs = ag[i] / al[i];
        rsiLast6.push({ i, rsi: al[i] === 0 ? 100 : 100 - 100 / (1 + rs) });
      }
    } catch (e) {}
    // уровни R1: экстремум последних 20 баров старших ТФ — здесь просто выводим hi/lo последних 20 для этого ТФ и для 4h
    const hi20 = Math.max(...h.slice(-20)), lo20 = Math.min(...l.slice(-20));
    const range = Math.abs(c[last] - c[last - 1]);
    const bodyHi = Math.max(o[last], c[last]), bodyLo = Math.min(o[last], c[last]);
    out[sym][tf] = {
      n, close: c[last], open: o[last], prevClose: c[last - 1],
      bodyHi, bodyLo,
      changePct: +((c[last] - c[last - 1]) / c[last - 1] * 100).toFixed(3),
      ema20: { prev: +e20[0], now: +e20[1] },
      ema50: { prev: +e50[0], now: +e50[1] },
      ema50TF: +e50[1],
      sma20now: +s20[1],
      rsiNow: +rsiNow,
      rsiLast6: rsiLast6.slice(-6).map(r => +r.rsi.toFixed(1)),
      adx: adx ? { adx: +adx.adx, pdi: +(adx.pdi || 0), mdi: +(adx.mdi || 0) } : null,
      atr: +atr,
      hi20, lo20,
      barRangePctOfAtr: atr ? +(range / atr / 3).toFixed(2) : null
    };
  }
}
console.log(JSON.stringify(out, null, 1));