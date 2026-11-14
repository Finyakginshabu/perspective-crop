/**
 * Pure perspective-transform math. No DOM access, so it runs in a Web Worker
 * and under Node for tests.
 */

/**
 * Solve A·x = b by Gaussian elimination with partial pivoting.
 * @param {number[][]} A square matrix (not mutated)
 * @param {number[]} b
 * @returns {number[] | null} solution, or null if the matrix is singular
 */
export function solveLinear(A, b) {
  const n = b.length;
  const m = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
    }
    if (Math.abs(m[pivot][c]) < 1e-10) return null;
    [m[c], m[pivot]] = [m[pivot], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

/**
 * Homography H (3x3, row-major, h33 = 1) such that from[i] → to[i].
 * @param {number[][]} from four [x, y] points
 * @param {number[][]} to four [x, y] points
 * @returns {number[] | null} 9 values, or null if the points are degenerate
 */
export function computeHomography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solveLinear(A, b);
  return h && [...h, 1];
}

/** Apply a homography to one point. */
export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

/**
 * Warp the quad `corners` (TL, TR, BR, BL in source pixels) of an RGBA image
 * into a dw×dh rectangle using inverse mapping and bilinear sampling.
 * Pixels that fall outside the source stay transparent.
 *
 * @param {Uint8ClampedArray} src RGBA pixels
 * @param {number} sw source width
 * @param {number} sh source height
 * @param {number[][]} corners four [x, y] points
 * @param {number} dw output width
 * @param {number} dh output height
 * @returns {Uint8ClampedArray | null} RGBA output, or null if corners are degenerate
 */
export function warpPerspective(src, sw, sh, corners, dw, dh) {
  const rect = [[0, 0], [dw, 0], [dw, dh], [0, dh]];
  const H = computeHomography(rect, corners); // output → source
  if (!H) return null;

  const out = new Uint8ClampedArray(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      // Sample at pixel centres.
      const [sx, sy] = applyHomography(H, x + 0.5, y + 0.5).map((v) => v - 0.5);
      if (!(sx >= 0 && sy >= 0 && sx <= sw - 1 && sy <= sh - 1)) continue;

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bottom = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        out[o + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return out;
}

/**
 * Suggested output size for a quad: mean of opposite edge lengths.
 * @param {number[][]} corners TL, TR, BR, BL
 * @returns {[number, number]} [width, height]
 */
export function suggestedSize(corners) {
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const [tl, tr, br, bl] = corners;
  return [
    Math.max(1, Math.round((d(tl, tr) + d(bl, br)) / 2)),
    Math.max(1, Math.round((d(tl, bl) + d(tr, br)) / 2)),
  ];
}
