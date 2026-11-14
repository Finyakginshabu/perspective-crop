/**
 * Image preview with four draggable corner handles.
 *
 * - The image canvas only shows the (downscaled) photo.
 * - A transparent overlay canvas, OVERLAY_PAD px larger on every side, draws
 *   the frame and handles and receives pointer input. Handles therefore render
 *   in full even at the image edge, while corners stay clamped to the image.
 * - While a corner is dragged, a magnifier (fixed-position canvas) shows the
 *   full-resolution pixels around it, anywhere in the window.
 *
 * Corner coordinates are kept in *image* pixels.
 */
import { fitCanvas } from './fit.js';

const MAX_PREVIEW = 1600;
const HANDLE_PX = 12; // handle radius (CSS px)
const OVERLAY_PAD = 16; // overlay extends this far past the image (CSS px)
const LOUPE_R = 48; // magnifier radius (CSS px)
const LOUPE_GAP = 20; // gap between handle and magnifier (CSS px)
const LOUPE_ZOOM = 3; // magnification relative to the on-screen preview
const LOUPE_PAD = 6; // keep this far from the window edges (CSS px)

export class CornerEditor {
  /** @param {HTMLCanvasElement} canvas image canvas; its parent must be positioned */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.bitmap = null;
    this.corners = [];
    this.scale = 1;
    this.active = -1;
    this.onChange = () => {};
    this._raf = 0;

    this.overlay = document.createElement('canvas');
    this.overlay.className = 'corner-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    canvas.after(this.overlay);
    this.overlayCtx = this.overlay.getContext('2d');

    this.loupe = document.createElement('canvas');
    this.loupe.className = 'loupe';
    this.loupe.hidden = true;
    this.loupe.setAttribute('aria-hidden', 'true');
    document.body.append(this.loupe);
    this.loupeCtx = this.loupe.getContext('2d');

    const release = () => {
      if (this.active < 0) return;
      this.active = -1;
      this._schedule(); // redraw handles, hide the magnifier
    };
    this.overlay.addEventListener('pointerdown', (e) => this._down(e));
    this.overlay.addEventListener('pointermove', (e) => this._move(e));
    this.overlay.addEventListener('pointerup', release);
    this.overlay.addEventListener('pointercancel', release);
    // Touch: the page may scroll over the image, except while a handle is held.
    // (pointerdown fires before touchstart, so `active` is already set here.)
    const blockScroll = (e) => { if (this.active >= 0) e.preventDefault(); };
    this.overlay.addEventListener('touchstart', blockScroll, { passive: false });
    this.overlay.addEventListener('touchmove', blockScroll, { passive: false });

    const ro = new ResizeObserver(() => this.bitmap && this._schedule());
    ro.observe(canvas);
    ro.observe(canvas.parentElement);
  }

  /** @param {ImageBitmap} bitmap */
  setImage(bitmap) {
    this.bitmap = bitmap;
    this.scale = Math.min(1, MAX_PREVIEW / Math.max(bitmap.width, bitmap.height));
    this.canvas.width = Math.round(bitmap.width * this.scale);
    this.canvas.height = Math.round(bitmap.height * this.scale);
    this.ctx.drawImage(bitmap, 0, 0, this.canvas.width, this.canvas.height);
    this.reset();
  }

  /** Place corners 8% in from each edge. */
  reset() {
    if (!this.bitmap) return;
    const { width: w, height: h } = this.bitmap;
    const mx = w * 0.08;
    const my = h * 0.08;
    this.corners = [[mx, my], [w - mx, my], [w - mx, h - my], [mx, h - my]];
    this._schedule();
    this.onChange(this.corners);
  }

  _schedule() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._draw());
  }

  /** Frame/handle colour, taken from the CSS `--accent` variable. */
  get accent() {
    return getComputedStyle(this.canvas).getPropertyValue('--accent').trim() || '#ff7f1a';
  }

  /** CSS px per image px at the current on-screen size. */
  _cssPerImg() {
    return this.canvas.clientWidth / this.bitmap.width;
  }

  /** Size/position the overlay over the image, then draw frame + handles (in CSS px). */
  _draw() {
    const { canvas, overlay, overlayCtx: ctx, corners } = this;
    fitCanvas(canvas);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;

    const dpr = window.devicePixelRatio || 1;
    const ow = cw + 2 * OVERLAY_PAD;
    const oh = ch + 2 * OVERLAY_PAD;
    if (overlay.width !== Math.round(ow * dpr) || overlay.height !== Math.round(oh * dpr)) {
      overlay.width = Math.round(ow * dpr);
      overlay.height = Math.round(oh * dpr);
      overlay.style.width = `${ow}px`;
      overlay.style.height = `${oh}px`;
    }
    overlay.style.left = `${canvas.offsetLeft - OVERLAY_PAD}px`;
    overlay.style.top = `${canvas.offsetTop - OVERLAY_PAD}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, ow, oh);

    const s = this._cssPerImg();
    const accent = this.accent;
    const pts = corners.map(([x, y]) => [OVERLAY_PAD + x * s, OVERLAY_PAD + y * s]);

    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.strokeStyle = accent;
    ctx.stroke();

    pts.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x, y, HANDLE_PX, 0, Math.PI * 2);
      ctx.fillStyle = i === this.active ? accent : '#fff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = accent;
      ctx.stroke();
    });

    if (this.active >= 0) this._drawLoupe(accent);
    else this.loupe.hidden = true;
  }

  /**
   * Position the magnifier above the active handle (below if there's no room),
   * clamped only to the window, then render the zoomed pixels into it.
   */
  _drawLoupe(accent) {
    const { loupe, loupeCtx: ctx, bitmap, corners } = this;
    const R = LOUPE_R;
    const dpr = window.devicePixelRatio || 1;
    const canvasRect = this.canvas.getBoundingClientRect();
    const cssPerImg = canvasRect.width / bitmap.width;

    // --- placement (viewport CSS px) ---
    const [cx, cy] = corners[this.active];
    const hx = canvasRect.left + cx * cssPerImg;
    const hy = canvasRect.top + cy * cssPerImg;
    const offset = R + HANDLE_PX + LOUPE_GAP;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const minC = R + LOUPE_PAD;
    const vw = document.documentElement.clientWidth; // excludes scrollbar
    const vh = document.documentElement.clientHeight;
    let ly = hy - offset;
    if (ly < minC) ly = hy + offset;
    ly = clamp(ly, minC, vh - minC);
    const lx = clamp(hx, minC, vw - minC);

    const size = 2 * R;
    if (loupe.width !== Math.round(size * dpr)) {
      loupe.width = loupe.height = Math.round(size * dpr);
      loupe.style.width = loupe.style.height = `${size}px`;
    }
    loupe.style.left = `${lx - R}px`;
    loupe.style.top = `${ly - R}px`;
    loupe.hidden = false;

    // --- content (drawn in CSS px via the DPR transform) ---
    const half = R / cssPerImg / LOUPE_ZOOM; // half-width of sampled area, image px
    const map = ([x, y]) => [R + ((x - cx) / half) * R, R + ((y - cy) / half) * R];

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#222'; // shows where the area falls outside the image
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = cssPerImg * LOUPE_ZOOM < 2; // crisp once pixels are big
    ctx.drawImage(bitmap, cx - half, cy - half, 2 * half, 2 * half, 0, 0, size, size);

    // The two frame edges meeting at this corner.
    ctx.beginPath();
    ctx.moveTo(...map(corners[(this.active + 3) % 4]));
    ctx.lineTo(R, R);
    ctx.lineTo(...map(corners[(this.active + 1) % 4]));
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = accent;
    ctx.stroke();

    // Crosshair (white with dark outline so it shows on any background).
    const arm = 8;
    for (const [w, color] of [[3, 'rgba(0,0,0,.6)'], [1.25, '#fff']]) {
      ctx.beginPath();
      ctx.moveTo(R - arm, R);
      ctx.lineTo(R + arm, R);
      ctx.moveTo(R, R - arm);
      ctx.lineTo(R, R + arm);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
  }

  /** Pointer position → image px (relative to the image canvas, not the overlay). */
  _toImage(e) {
    const r = this.canvas.getBoundingClientRect();
    const s = r.width / this.bitmap.width;
    return [(e.clientX - r.left) / s, (e.clientY - r.top) / s];
  }

  _down(e) {
    if (!this.bitmap) return;
    const [px, py] = this._toImage(e);
    const reach = (HANDLE_PX * 2) / this._cssPerImg();
    let best = -1;
    let bestDist = reach;
    this.corners.forEach(([x, y], i) => {
      const d = Math.hypot(x - px, y - py);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    this.active = best;
    if (best >= 0) {
      this.overlay.setPointerCapture(e.pointerId);
      this._schedule(); // show the magnifier immediately
    }
  }

  _move(e) {
    if (this.active < 0) return;
    const [px, py] = this._toImage(e);
    const { width, height } = this.bitmap;
    this.corners[this.active] = [
      Math.min(width, Math.max(0, px)),
      Math.min(height, Math.max(0, py)),
    ];
    this._schedule();
    this.onChange(this.corners);
  }
}
