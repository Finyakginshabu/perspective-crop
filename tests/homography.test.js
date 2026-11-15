import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveLinear, computeHomography, applyHomography, warpPerspective, suggestedSize, isValidQuad,
} from '../src/js/homography.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('solveLinear solves a 2x2 system', () => {
  const x = solveLinear([[2, 1], [1, 3]], [5, 10]);
  near(x[0], 1);
  near(x[1], 3);
});

test('solveLinear returns null for singular matrices', () => {
  assert.equal(solveLinear([[1, 2], [2, 4]], [1, 2]), null);
});

test('homography maps each source corner onto its target', () => {
  const from = [[0, 0], [100, 0], [100, 50], [0, 50]];
  const to = [[10, 5], [90, 12], [95, 70], [4, 60]];
  const H = computeHomography(from, to);
  from.forEach((p, i) => {
    const [x, y] = applyHomography(H, ...p);
    near(x, to[i][0]);
    near(y, to[i][1]);
  });
});

test('collinear points are rejected', () => {
  const pts = [[0, 0], [1, 1], [2, 2], [3, 3]];
  assert.equal(computeHomography(pts, pts), null);
});

test('warping the full image onto itself is the identity', () => {
  const w = 4, h = 3;
  const src = new Uint8ClampedArray(w * h * 4).map((_, i) => (i * 7) % 256);
  const full = [[0, 0], [w, 0], [w, h], [0, h]];
  const out = warpPerspective(src, w, h, full, w, h);
  assert.deepEqual([...out], [...src]);
});

test('suggestedSize averages opposite edges', () => {
  assert.deepEqual(suggestedSize([[0, 0], [100, 0], [100, 40], [0, 40]]), [100, 40]);
});

const countTransparent = (px) => {
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] === 0) n++;
  return n;
};

test('corners on the image border leave no transparent edge pixels', () => {
  const w = 100, h = 100;
  const src = new Uint8ClampedArray(w * h * 4).fill(255);
  const full = [[0, 0], [w, 0], [w, h], [0, h]];
  assert.equal(countTransparent(warpPerspective(src, w, h, full, 200, 200)), 0);
  const skew = [[0, 0], [w, 10], [w, h - 10], [0, h]];
  const [dw, dh] = suggestedSize(skew);
  assert.equal(countTransparent(warpPerspective(src, w, h, skew, dw, dh)), 0);
});

test('areas outside the source stay transparent', () => {
  const w = 10, h = 10;
  const src = new Uint8ClampedArray(w * h * 4).fill(255);
  const quad = [[-w, 0], [w, 0], [w, h], [-w, h]]; // left half is off the image
  const out = warpPerspective(src, w, h, quad, 20, 10);
  const alphaAt = (x, y) => out[(y * 20 + x) * 4 + 3];
  assert.equal(alphaAt(2, 5), 0);
  assert.equal(alphaAt(17, 5), 255);
});

test('isValidQuad accepts rectangles and perspective quads', () => {
  assert.ok(isValidQuad([[0, 0], [100, 0], [100, 50], [0, 50]]));
  assert.ok(isValidQuad([[10, 5], [90, 12], [95, 70], [4, 60]]));
});

test('isValidQuad rejects crossed, concave, mirrored and degenerate quads', () => {
  assert.ok(!isValidQuad([[0, 0], [100, 50], [100, 0], [0, 50]]), 'bow-tie');
  assert.ok(!isValidQuad([[0, 0], [100, 0], [20, 20], [0, 100]]), 'concave');
  assert.ok(!isValidQuad([[100, 0], [0, 0], [0, 50], [100, 50]]), 'mirrored');
  assert.ok(!isValidQuad([[0, 0], [0, 0], [100, 50], [0, 50]]), 'coincident');
  assert.ok(!isValidQuad([[0, 0], [2000, 1000], [4000, 2000.0001], [100, 3000]]), 'near-collinear');
});
