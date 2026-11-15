/**
 * Size a canvas to fit inside its parent's content box, keeping its aspect
 * ratio exactly and never upscaling. (Pure CSS max-width/max-height inside a
 * flex container can distort the ratio, which breaks pointer → pixel mapping.)
 *
 * The available height is the parent's `max-height` if it has one (so the
 * parent can use `height: auto` and hug the image), otherwise its actual height.
 * Works for an <img> too, using its natural size.
 * @param {HTMLCanvasElement | HTMLImageElement} canvas
 */
export function fitCanvas(canvas) {
  const parent = canvas.parentElement;
  const iw = canvas.naturalWidth ?? canvas.width;
  const ih = canvas.naturalHeight ?? canvas.height;
  const cs = getComputedStyle(parent);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  const maxH = parseFloat(cs.maxHeight); // NaN when 'none'
  const availW = parent.clientWidth - padX;
  const availH = (Number.isFinite(maxH) ? maxH : parent.clientHeight) - padY;
  if (availW <= 0 || availH <= 0 || !iw || !ih) return;

  const k = Math.min(1, availW / iw, availH / ih);
  const w = `${Math.floor(iw * k)}px`;
  const h = `${Math.floor(ih * k)}px`;
  if (canvas.style.width !== w) canvas.style.width = w;
  if (canvas.style.height !== h) canvas.style.height = h;
}
