// Module worker: keeps the heavy per-pixel warp off the UI thread.
import { warpPerspective } from './homography.js';

self.onmessage = (e) => {
  const { id, pixels, sw, sh, corners, dw, dh } = e.data;
  const out = warpPerspective(new Uint8ClampedArray(pixels), sw, sh, corners, dw, dh);
  if (!out) {
    self.postMessage({ id, error: 'Some corners are on top of each other or in a straight line. Spread them out into a four-sided shape.' });
    return;
  }
  self.postMessage({ id, pixels: out.buffer, dw, dh }, [out.buffer]);
};
