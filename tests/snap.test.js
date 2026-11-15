import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cornerStrength, findCorner } from '../src/js/snap.js';

/** w×h grey image (value bg) with a rectangle [x0, x1) × [y0, y1) of value fg. */
function rectImage(w, h, [x0, y0, x1, y1], bg = 90, fg = 235) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x >= x0 && x < x1 && y >= y0 && y < y1 ? fg : bg;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return px;
}

const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test('findCorner snaps to the corners of a rectangle', () => {
  const s = cornerStrength(rectImage(120, 100, [20, 30, 90, 80]), 120, 100);
  for (const [cx, cy] of [[20, 30], [90, 30], [90, 80], [20, 80]]) {
    const hit = findCorner(s, cx + 6, cy - 5, 15);
    assert.ok(hit, `no corner found near ${cx},${cy}`);
    near(hit[0], cx, 0.25);
    near(hit[1], cy, 0.25);
  }
});

test('findCorner ignores straight edges and flat areas', () => {
  const s = cornerStrength(rectImage(120, 100, [20, 30, 90, 80]), 120, 100);
  assert.equal(findCorner(s, 55, 30, 10), null); // middle of the top edge
  assert.equal(findCorner(s, 55, 55, 10), null); // inside the rectangle
});

test('findCorner returns null when nothing is in range', () => {
  const s = cornerStrength(rectImage(120, 100, [20, 30, 90, 80]), 120, 100);
  assert.equal(findCorner(s, 55, 55, 15), null);
});

test('findCorner returns null on a uniform image', () => {
  const s = cornerStrength(rectImage(40, 40, [0, 0, 0, 0]), 40, 40);
  assert.equal(findCorner(s, 20, 20, 15), null);
});

test('findCorner prefers a clear corner over a faint one nearby', () => {
  // Strong rectangle corner at (40, 40); a faint speck (90 → 110) just as close to the pointer.
  const w = 80;
  const px = rectImage(w, 80, [40, 40, 80, 80]);
  for (let y = 30; y < 33; y++) for (let x = 28; x < 31; x++) px.set([110, 110, 110, 255], (y * w + x) * 4);
  const hit = findCorner(cornerStrength(px, w, 80), 34, 35, 15);
  near(hit[0], 40, 1);
  near(hit[1], 40, 1);
});
