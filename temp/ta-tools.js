'use strict';
// ta-tools.js — числовая реализация алгоритмов из книги
// Tsinaslanidis & Zapranis "Technical Analysis for Algorithmic Pattern Recognition" (Springer, 2016).
// Реализовано: RW (regional locals), PIPs, HSAR, RB/RT (критические точки + оценка «чаши»),
// subsequence DDTW (сглаживание Савицкого-Голая + производные).
// Только встроенные модули Node.js, без зависимостей.
//
// CLI:  node ta-tools.js <command> <json|csv файл> [опции]
//   commands: rw | pips | hsar | circle | dtw
// Данные: массив цен (column vector). CSV: один столбец или столбец с заголовком close.
// Примеры:
//   node ta-tools.js rw prices.csv --w 15
//   node ta-tools.js pips prices.csv --n 10 --dist 3
//   node ta-tools.js hsar prices.csv --w 50 --x 0.05
//   node ta-tools.js circle prices.csv --w 10 --bounds 0.3 --twidth 15 --tfit 0.9
//   node ta-tools.js dtw prices.csv --query 60 --wins 21 --tau 15
// Или из кода: const { RW, PIPs, HSAR, findCircles, findUPatterns, DDTW } = require('./ta-tools.js');

// ---------- RW: regional locals (гл. 2, разд. 2.3.1) ----------
// Локальная вершина/дно: экстремум в окне 2w+1, центрированном на наблюдении.
function RW(ys, w) {
  const l = ys.length;
  const peaks = [], bottoms = [];
  for (let t = w; t < l - w; t++) { // индекс с нуля: t — центр, окно [t-w, t+w]
    let leftMax = -Infinity, rightMax = -Infinity;
    let leftMin = Infinity, rightMin = Infinity;
    for (let i = t - w; i < t; i++) {
      if (ys[i] > leftMax) leftMax = ys[i];
      if (ys[i] < leftMin) leftMin = ys[i];
    }
    for (let i = t + 1; i <= t + w; i++) {
      if (ys[i] > rightMax) rightMax = ys[i];
      if (ys[i] < rightMin) rightMin = ys[i];
    }
    if (ys[t] > leftMax && ys[t] > rightMax) peaks.push({ t: t + 1, p: ys[t] }); // t (в терминологии книги, с 1)
    if (ys[t] < leftMin && ys[t] < rightMin) bottoms.push({ t: t + 1, p: ys[t] });
  }
  return { peaks, bottoms };
}

// ---------- PIPs: Perceptually Important Points (гл. 2, разд. 2.3.2) ----------
// dist: 1=ED (евклидово), 2=PD (перпендикулярное), 3=VD (вертикальное).
// Первые два PIP — первое и последнее наблюдения; далее точка с максимальным
// расстоянием до пары смежных PIP, пока не наберём nOfPIPs.
function PIPs(ys, nOfPIPs, dist = 3) {
  const l = ys.length;
  const pips = [0, l - 1];
  while (pips.length < nOfPIPs) {
    pips.sort((a, b) => a - b);
    let bestIdx = -1, bestD = -Infinity;
    for (let i = 0; i < l; i++) {
      if (pips.includes(i)) continue;
      // смежные PIP: ближайший слева и ближайший справа
      let left = -1, right = -1;
      for (const p of pips) {
        if (p < i && (left === -1 || p > left)) left = p;
        if (p > i && (right === -1 || p < right)) right = p;
      }
      if (left === -1 && right === -1) continue;
      const a = left === -1 ? right : left;
      const b = right === -1 ? left : right;
      const d = pipDistance(ys, i, a, b, dist);
      if (d > bestD) { bestD = d; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    pips.push(bestIdx);
  }
  pips.sort((a, b) => a - b);
  return pips.map(t => ({ t: t + 1, p: ys[t] }));
}

function pipDistance(ys, i, t, t2, dist) {
  const pi = ys[i], pt = ys[t], pt2 = ys[t2];
  const T = t2 - t;
  const s = T === 0 ? 0 : (pt2 - pt) / T;
  const c = pt - t * s;
  if (dist === 1) { // ED: сумма расстояний до обоих PIP
    return Math.sqrt((t - i) ** 2 + (pt - pi) ** 2) + Math.sqrt((t2 - i) ** 2 + (pt2 - pi) ** 2);
  }
  if (dist === 2) { // PD: перпендикулярное расстояние до прямой через PIPы
    return Math.abs(s * i + c - pi) / Math.sqrt(s * s + 1);
  }
  return Math.abs(s * i + c - pi); // VD
}

// ---------- HSAR: горизонтальные поддержки/сопротивления (гл. 4, разд. 4.3) ----------
// Локали по RW сортируются в бины равной ПРОЦЕНТНОЙ ширины x (напр. 0.05 = 5%);
// бины с частотой >= freqMin — HSARz (уровень = середина бина).
function HSAR(ys, w, x = 0.05, freqMin = 2) {
  const { peaks, bottoms } = RW(ys, w);
  const L = [...peaks.map(p => p.p), ...bottoms.map(b => b.p)];
  if (L.length < freqMin) return { sars: [], freq: [], bounds: [] };
  const L1 = Math.min(...L) / (1 + x / 2);
  const Ln = Math.max(...L) * (1 + x / 2);
  const n = Math.round(Math.log(Ln / L1) / Math.log(1 + x));
  const xAct = Math.pow(Ln / L1, 1 / n) - 1;
  const bounds = [];
  for (let k = 0; k <= n; k++) bounds.push(L1 * Math.pow(1 + xAct, k));
  const freq = [];
  for (let b = 0; b < n; b++) {
    freq.push(L.filter(p => p >= bounds[b] && p < bounds[b + 1]).length);
  }
  const sars = [];
  for (let b = 0; b < n; b++) {
    if (freq[b] >= freqMin) sars.push({ level: (bounds[b] + bounds[b + 1]) / 2, freq: freq[b], low: bounds[b], high: bounds[b + 1] });
  }
  return { sars, freq, bounds, xAct };
}

// ---------- RB/RT: чаши (гл. 6, разд. 6.2) ----------
// 1) критические точки: локальная вершина P1 (RW), первое последующее закрытие >= P1 (P2), минимум между ними (T1);
// 2) масштабирование depth/width = 1/2 (mapminmax на подвыборке в [1, width/2]);
// 3) три гомоцентрические окружности R, R2=R(1-bounds), R3=R(1+bounds);
// 4) fit = доля наблюдений между дугами окружностей 2 (верх) и 3 (низ), fit >= tFit.
function findCircles(ys, P1, P2, T1, boundsRate = 0.3) {
  const w1 = P2.t - P1.t + 1;
  const seg = ys.slice(P1.t - 1, P2.t);
  const yMin = Math.min(...seg), yMax = Math.max(...seg);
  const scale = v => 1 + (v - yMin) / (yMax - yMin) * (w1 / 2 - 1); // mapminmax -> [1, w1/2]
  const sP1 = { t: P1.t, p: scale(P1.p) };
  const sP2 = { t: P2.t, p: scale(P2.p) };
  const sT1 = { t: T1.t, p: 1 }; // у T1 (дна чаши) масштабированная y всегда 1
  // вершины равнобедренного треугольника A, B, C
  const Ay = (sP1.p + sP2.p) / 2;
  const A = { x: sP1.t, y: Ay }, C = { x: sP2.t, y: Ay };
  const B = { x: (sP1.t + sP2.t) / 2, y: sT1.p };
  const a = Math.sqrt((B.x - C.x) ** 2 + (B.y - C.y) ** 2);
  const sinA = (A.y - B.y) / Math.sqrt((A.x - B.x) ** 2 + (A.y - B.y) ** 2);
  const R = a / (2 * sinA);
  const K = { x: B.x, y: B.y + R };
  const radii = [R, R * (1 - boundsRate), R * (1 + boundsRate)]; // окружности 1, 2, 3
  const crclY = [];
  for (let xi = A.x; xi <= C.x; xi++) {
    const row = { x: xi };
    radii.forEach((Rj, j) => {
      const disc = 4 * (K.y ** 2 - (K.y ** 2 - Rj ** 2 + (xi - K.x) ** 2));
      row['y' + (j + 1)] = disc >= 0 ? K.y - Math.sqrt(disc) / 2 : null; // нижняя дуга; null = арки нет
    });
    crclY.push(row);
  }
  return { K, R, radii, crclY, scale, sP1, sP2, sT1 };
}

// Поиск всех RB (rounding bottoms, «чаши») в серии. По умолчанию как в табл. 6.2/6.3:
// bounds=0.3, tWidth=15, tFit=0.9, w=10. Для RT (rounding tops) — mirror=true.
function findUPatterns(ys, w = 10, boundsRate = 0.3, tWidth = 15, tFit = 0.9, mirror = false) {
  if (mirror) {
    // RT = зеркальный процесс RB: работаем в перевёрнутой серии, потом переводим координаты назад
    const inv = ys.map(v => -v);
    const res = findUPatterns(inv, w, boundsRate, tWidth, tFit, false).map(u => ({
      P1: { t: u.P1.t, p: -u.P1.p },
      P2: { t: u.P2.t, p: -u.P2.p },
      T1: { t: u.T1.t, p: -u.T1.p },
      fit: u.fit, width: u.width, depth: Math.abs(u.depth), circles: u.circles,
    }));
    return res;
  }
  const { peaks } = RW(ys, w);
  const res = [];
  for (const P1 of peaks) {
    let i2 = -1;
    for (let i = P1.t; i < ys.length; i++) if (ys[i] >= P1.p) { i2 = i; break; } // 0-based; первое закрытие >= P1
    if (i2 === -1) continue;
    const P2 = { t: i2 + 1, p: ys[i2] };
    if (P2.t - P1.t + 1 <= tWidth) continue; // width = P2-P1+1 > tWidth
    let tIdx = P1.t - 1, tVal = Infinity;
    for (let i = P1.t - 1; i <= i2; i++) if (ys[i] < tVal) { tVal = ys[i]; tIdx = i; }
    const T1 = { t: tIdx + 1, p: tVal };
    const c = findCircles(ys, P1, P2, T1, boundsRate);
    // fit: доля наблюдений между дугами окружностей 2 (верх, где определена) и 3 (низ).
    // где дуга окружности 2 не существует (у кромки чаши) — ограничения сверху нет.
    let ok = 0, total = 0;
    for (const row of c.crclY) {
      const yScaled = c.scale(ys[row.x - 1]); // row.x — 1-based t
      total++;
      const upper = row.y2 !== null ? row.y2 : Infinity;
      const lower = row.y3 !== null ? row.y3 : -Infinity;
      if (yScaled <= upper && yScaled >= lower) ok++;
    }
    const fit = ok / total;
    if (fit >= tFit) {
      const width = P2.t - P1.t + 1;
      const depth = (Math.max(P1.p, P2.p) - T1.p) / T1.p;
      res.push({ P1, P2, T1, fit, width, depth, circles: c });
    }
  }
  return res;
}

// ---------- Сглаживание Савицкого–Голая (кубика, окно 21) — коэффициенты из табл. 9.3 ----------
const SG21 = [329, 324, 309, 284, 249, 204, 149, 84, 9, -76, -171].map(v => v / 3059);
function savitzkyGolay21(ys) {
  const m = ys.length, half = 10;
  const out = new Array(m);
  for (let i = half; i < m - half; i++) {
    let s = SG21[0] * ys[i];
    for (let k = 1; k <= half; k++) s += SG21[k] * (ys[i + k] + ys[i - k]);
    out[i] = s;
  }
  // краевые точки: полиномиальный фит на первых/последних 21 точках (малые МНК, кубика)
  out.splice(0, 0); // keep length
  const polyFit = (start, end) => {
    const n = end - start;
    // нормированная кубическая аппроксимация (упрощённо: линейная регрессия по 4 коэффициентам)
    let Sx = 0, Sx2 = 0, Sx3 = 0, Sy = 0, Sxy = 0, Sx2y = 0, Sx3y = 0, Sx4 = 0, Sx5 = 0, Sx6 = 0;
    for (let i = start; i < end; i++) {
      const x = i - start, y = ys[i];
      Sx += x; Sx2 += x * x; Sx3 += x ** 3; Sx4 += x ** 4; Sx5 += x ** 5; Sx6 += x ** 6;
      Sy += y; Sxy += x * y; Sx2y += x * x * y; Sx3y += x ** 3 * y;
    }
    // решение нормальных уравнений 4x4 методом Гаусса
    const A = [[n, Sx, Sx2, Sx3], [Sx, Sx2, Sx3, Sx4], [Sx2, Sx3, Sx4, Sx5], [Sx3, Sx4, Sx5, Sx6]];
    const b = [Sy, Sxy, Sx2y, Sx3y];
    const sol = gauss(A, b.slice());
    return x => sol[0] + sol[1] * x + sol[2] * x * x + sol[3] * x ** 3;
  };
  const fL = polyFit(0, half * 2 + 1);
  for (let i = 0; i < half; i++) out[i] = fL(i);
  const fR = polyFit(m - half * 2 - 1, m);
  for (let i = m - half; i < m; i++) out[i] = fR(i - (m - half * 2 - 1));
  void m; void half;
  return out;
}

function gauss(A, b) {
  const n = A.length;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let cI = i; cI < n; cI++) A[r][cI] -= f * A[i][cI];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let cI = i + 1; cI < n; cI++) s -= A[i][cI] * x[cI];
    x[i] = s / A[i][i];
  }
  return x;
}

// ---------- Subsequence DDTW (гл. 9, разд. 9.2-9.3) ----------
// Y — длинная стандартизованная серия производных, Q — запрос. Возвращает окончания похожих подотрезков.
function DDTW(Y, Q, tau = 15, windowRW = 20) {
  const N = Q.length, M = Y.length;
  const INF = Infinity;
  const ed = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(INF));
  for (let m = 1; m <= M; m++) ed[0][m] = 0; // relaxed boundary: ed(1,m)=d(1,m) реализуется через нулевую строку
  for (let n = 1; n <= N; n++) ed[n][0] = INF;
  for (let n = 1; n <= N; n++) {
    for (let m = 1; m <= M; m++) {
      const d = Math.abs(Q[n - 1] - Y[m - 1]);
      if (ed[n - 1][m] === INF && ed[n][m - 1] === INF && ed[n - 1][m - 1] === INF) { ed[n][m] = INF; continue; }
      ed[n][m] = d + Math.min(ed[n - 1][m], ed[n][m - 1], ed[n - 1][m - 1]);
    }
  }
  // локальные минимумы cost-функции ed(N, m) с исключением окрестностей
  const cost = [];
  for (let m = 1; m <= M; m++) cost.push(ed[N][m]);
  const ends = [];
  for (let m = 1; m <= M; m++) {
    if (cost[m - 1] === INF || cost[m - 1] > tau) continue;
    const lo = Math.max(0, m - 1 - windowRW), hi = Math.min(M - 1, m - 1 + windowRW);
    let isMin = true;
    for (let j = lo; j <= hi; j++) if (cost[j] < cost[m - 1]) { isMin = false; break; }
    if (isMin) ends.push({ b: m, cost: cost[m - 1] });
  }
  return ends;
}

// Подготовка серий для subsequence DDTW (по примеру гл. 9).
// Q — последний qLen-отрезок; Y — вся производная стандартизованная серия.
function ddtwSeries(ys, qLen) {
  const sm = savitzkyGolay21(ys);
  // Оценка первой производной Кеога-Паццани (9.11): p'm = (pm - pm-1) + (pm+1 - pm-1)/2
  const d = sm.map((v, i) => i === 0 ? sm[1] - sm[0] : (v - sm[i - 1]) + (sm[Math.min(i + 1, sm.length - 1)] - sm[i - 1]) / 2);
  const std = a => {
    const mu = a.reduce((s, v) => s + v, 0) / a.length;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - mu) ** 2, 0) / a.length);
    return a.map(v => sd ? (v - mu) / sd : v);
  };
  const Y = std(d.slice(1));
  const Q = std(d.slice(Math.max(0, d.length - qLen)));
  return { Y, Q };
}

// ---------- CLI ----------
function readPrices(file) {
  const fs = require('fs');
  const raw = fs.readFileSync(file, 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  const vals = [];
  for (const ln of lines) {
    const cols = ln.split(/[,;\t ]+/).filter(Boolean);
    const v = parseFloat(cols.length === 1 ? cols[0] : cols[cols.length - 1]);
    if (!isNaN(v)) vals.push(v);
  }
  return vals;
}

if (require.main === module) {
  const [, , cmd, file, ...opts] = process.argv;
  const arg = (name, def) => {
    const i = opts.indexOf('--' + name);
    return i >= 0 ? parseFloat(opts[i + 1]) : def;
  };
  if (!cmd || !file) {
    console.log('usage: node ta-tools.js <rw|pips|hsar|circle|dtw> <prices.csv> [--w 15] [--n 10] [--dist 3] [--x 0.05] [--bounds 0.3] [--twidth 15] [--tfit 0.9] [--query 60] [--wins 21] [--tau 15]');
    process.exit(1);
  }
  const ys = readPrices(file);
  let out;
  if (cmd === 'rw') out = RW(ys, arg('w', 15));
  else if (cmd === 'pips') out = PIPs(ys, arg('n', 10), arg('dist', 3));
  else if (cmd === 'hsar') out = HSAR(ys, arg('w', 50), arg('x', 0.05), arg('freq', 2));
  else if (cmd === 'circle') { const u = findUPatterns(ys, arg('w', 10), arg('bounds', 0.3), arg('twidth', 15), arg('tfit', 0.9), opts.includes('--mirror')); out = u.map(({ P1, P2, T1, fit, width, depth }) => ({ P1, P2, T1, fit, width, depth })); }
  else if (cmd === 'dtw') {
    const qLen = arg('query', 60), tau = arg('tau', 15);
    const { Y, Q } = ddtwSeries(ys, qLen);
    out = DDTW(Y, Q, tau, 20);
    console.log('query length N=' + Q.length + ', history M=' + Y.length);
  } else { console.error('unknown command'); process.exit(1); }
  console.log(JSON.stringify(out, null, 1));
}

module.exports = { RW, PIPs, HSAR, findCircles, findUPatterns, savitzkyGolay21, ddtwSeries, DDTW };