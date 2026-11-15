/**
 * Corner "magnet": find corner-like features (e.g. a document's corners)
 * near a point, so a dragged handle can snap onto them. Pure math, no DOM.
 */

const WINDOW_R = 2; // structure-tensor window radius (px): 5×5 box
// Absolute floor: ignores sensor noise and faint corners (roughly under 8% contrast).
// snapNear only sees a small patch, so this floor, not MIN_RATIO, does most of the filtering.
const MIN_STRENGTH = 3e-4;
const MIN_RATIO = 0.01; // …and anything under 1% of the strongest corner in the map
// Score = strength × (1 − FALLOFF·(d/radius)²): the strongest corner in reach
// wins, nearer ones get a mild edge. (Pure nearest-first lets noise specks win.)
const FALLOFF = 0.75;

/**
 * Corner strength for every pixel: the smaller eigenvalue of the gradient
 * structure tensor (Shi–Tomasi). High only where edges meet, not along a
 * single straight edge or in flat areas.
 *
 * @param {Uint8ClampedArray} rgba RGBA pixels
 * @param {number} w width
 * @param {number} h height
 * @returns {{ map: Float32Array, gray: Float32Array, w: number, h: number, max: number }}
 */
export function cornerStrength(rgba, w, h) {
  const n = w * h;
  const g = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    g[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255;
  }

  // Sobel gradients → tensor entries gx², gy², gx·gy (zero on the 1px border).
  const xx = new Float32Array(n);
  const yy = new Float32Array(n);
  const xy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1, i = y * w + 1; x < w - 1; x++, i++) {
      const [gx, gy] = sobel(g, i, w);
      xx[i] = gx * gx;
      yy[i] = gy * gy;
      xy[i] = gx * gy;
    }
  }
  const tmp = new Float32Array(n);
  boxBlur(xx, tmp, w, h, WINDOW_R);
  boxBlur(yy, tmp, w, h, WINDOW_R);
  boxBlur(xy, tmp, w, h, WINDOW_R);

  // Smaller eigenvalue of [[xx, xy], [xy, yy]]. Reuse `tmp` for the result.
  const map = tmp;
  let max = 0;
  for (let i = 0; i < n; i++) {
    const half = (xx[i] - yy[i]) / 2;
    const v = (xx[i] + yy[i]) / 2 - Math.sqrt(half * half + xy[i] * xy[i]);
    map[i] = v;
    if (v > max) max = v;
  }
  return { map, gray: g, w, h, max };
}

/** Sobel gradient at interior pixel index i (normalised so a unit step gives 0.5). */
function sobel(g, i, w) {
  const a = g[i - w - 1], b = g[i - w], c = g[i - w + 1];
  const d = g[i - 1], f = g[i + 1];
  const p = g[i + w - 1], q = g[i + w], r = g[i + w + 1];
  return [(c + 2 * f + r - a - 2 * d - p) / 8, (p + 2 * q + r - a - 2 * b - c) / 8];
}

/** In-place separable box blur (mean over a (2r+1)² window, edges zero-padded). */
function boxBlur(a, tmp, w, h, r) {
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let s = 0;
    for (let x = 0; x < r && x < w; x++) s += a[row + x];
    for (let x = 0; x < w; x++) {
      if (x + r < w) s += a[row + x + r];
      if (x - r - 1 >= 0) s -= a[row + x - r - 1];
      tmp[row + x] = s * k;
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = 0; y < r && y < h; y++) s += tmp[y * w + x];
    for (let y = 0; y < h; y++) {
      if (y + r < h) s += tmp[(y + r) * w + x];
      if (y - r - 1 >= 0) s -= tmp[(y - r - 1) * w + x];
      a[y * w + x] = s * k;
    }
  }
}

/**
 * The corner feature nearest to (x, y) within `radius`, if any. Faint peaks
 * (noise, texture) are skipped when a clearly stronger corner is in range.
 * Coordinates are continuous pixel coordinates (pixel i spans [i, i + 1]),
 * so an edge between pixels 9 and 10 sits at 10.
 *
 * @param {{ map: Float32Array, w: number, h: number, max: number }} s from cornerStrength
 * @param {number} x
 * @param {number} y
 * @param {number} radius search radius, px
 * @returns {[number, number] | null}
 */
export function findCorner(s, x, y, radius) {
  const { map, w, h, max } = s;
  const thr = Math.max(MIN_STRENGTH, max * MIN_RATIO);
  if (!(max >= thr)) return null;

  const r2 = radius * radius;
  const cx = x - 0.5; // pixel-centre coordinates
  const cy = y - 0.5;
  const x0 = Math.max(2, Math.floor(cx - radius));
  const x1 = Math.min(w - 3, Math.ceil(cx + radius));
  const y0 = Math.max(2, Math.floor(cy - radius));
  const y1 = Math.min(h - 3, Math.ceil(cy + radius));

  let best = -1;
  let bestScore = 0;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0, i = py * w + x0; px <= x1; px++, i++) {
      const v = map[i];
      if (v < thr) continue;
      const d2 = ((px - cx) ** 2 + (py - cy) ** 2) / r2;
      if (d2 > 1) continue;
      const score = v * (1 - FALLOFF * d2);
      if (score <= bestScore || !isPeak(map, i, w, v)) continue;
      best = i;
      bestScore = score;
    }
  }
  if (best < 0) return null;

  const bx = best % w;
  const by = (best - bx) / w;
  return refine(s, bx + 0.5, by + 0.5);
}

const REFINE_R = 4; // refinement window radius, px
const REFINE_MAX_SHIFT = 3; // distrust a refinement that wanders further than this, px

/**
 * Sub-pixel corner position. The strength peak sits slightly inside the
 * corner, so solve for the point that every nearby gradient line passes
 * through: minimise Σ (gᵢ · (q − pᵢ))² over the window, then re-centre and repeat.
 */
function refine({ gray, w, h }, x0, y0) {
  let x = x0;
  let y = y0;
  for (let iter = 0; iter < 3; iter++) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let a = 0, b = 0, c = 0, u = 0, v = 0;
    for (let py = Math.max(1, iy - REFINE_R); py <= Math.min(h - 2, iy + REFINE_R); py++) {
      for (let px = Math.max(1, ix - REFINE_R); px <= Math.min(w - 2, ix + REFINE_R); px++) {
        const [gx, gy] = sobel(gray, py * w + px, w);
        const xx = gx * gx, xy = gx * gy, yy = gy * gy;
        const cx = px + 0.5, cy = py + 0.5; // pixel centre
        a += xx; b += xy; c += yy;
        u += xx * cx + xy * cy;
        v += xy * cx + yy * cy;
      }
    }
    const det = a * c - b * b;
    if (!(det > 1e-6 * (a + c) ** 2)) break; // a single edge: no unique point
    const nx = (c * u - b * v) / det;
    const ny = (a * v - b * u) / det;
    if (Math.hypot(nx - x0, ny - y0) > REFINE_MAX_SHIFT) return [x0, y0];
    const moved = Math.hypot(nx - x, ny - y);
    x = nx;
    y = ny;
    if (moved < 0.05) break;
  }
  return [x, y];
}

/** Local maximum over the 5×5 neighbourhood (ties broken towards the top-left). */
function isPeak(map, i, w, v) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      const u = map[i + dy * w + dx];
      if (u > v || (u === v && (dy < 0 || (dy === 0 && dx < 0)))) return false;
    }
  }
  return true;
}

// Patch margin beyond the search radius, so every candidate's strength, peak
// test and refinement window only read pixels computed inside the patch.
const PATCH_MARGIN = Math.max(WINDOW_R + 3, REFINE_R + REFINE_MAX_SHIFT + 1) + 2;

/**
 * findCorner without a precomputed map: computes corner strength only in a
 * small patch around (x, y). Fast enough to run on every pointer move, so
 * nothing has to be prepared when an image loads.
 *
 * @param {Uint8ClampedArray} rgba RGBA pixels of the whole image
 * @param {number} w image width
 * @param {number} h image height
 * @param {number} x
 * @param {number} y
 * @param {number} radius search radius, px
 * @returns {[number, number] | null}
 */
export function snapNear(rgba, w, h, x, y, radius) {
  const m = Math.ceil(radius) + PATCH_MARGIN;
  const x0 = Math.max(0, Math.floor(x) - m);
  const y0 = Math.max(0, Math.floor(y) - m);
  const x1 = Math.min(w, Math.floor(x) + m + 1);
  const y1 = Math.min(h, Math.floor(y) + m + 1);
  const pw = x1 - x0;
  const ph = y1 - y0;
  if (pw < 6 || ph < 6) return null;

  const patch = new Uint8ClampedArray(pw * ph * 4);
  for (let row = 0; row < ph; row++) {
    const src = ((y0 + row) * w + x0) * 4;
    patch.set(rgba.subarray(src, src + pw * 4), row * pw * 4);
  }
  const hit = findCorner(cornerStrength(patch, pw, ph), x - x0, y - y0, radius);
  return hit && [hit[0] + x0, hit[1] + y0];
}
