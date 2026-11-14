import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solveLinear, computeHomography, applyHomography, warpPerspective, suggestedSize,
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
