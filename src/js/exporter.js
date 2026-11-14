/** Image export helpers. */

export const FORMATS = {
  jpeg: { mime: 'image/jpeg', ext: 'jpg' },
  png: { mime: 'image/png', ext: 'png' },
};

/**
 * Encode a canvas as JPEG or PNG.
 * JPEG has no alpha, so transparent areas are flattened onto white.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {'jpeg' | 'png'} format
 * @param {number} quality 0–1, JPEG only
 * @returns {Promise<Blob>}
 */
export function encodeCanvas(canvas, format, quality) {
  let source = canvas;
  if (format === 'jpeg') {
    source = document.createElement('canvas');
    source.width = canvas.width;
    source.height = canvas.height;
    const ctx = source.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, source.width, source.height);
    ctx.drawImage(canvas, 0, 0);
  }
  return new Promise((resolve, reject) => {
    source.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      FORMATS[format].mime,
      format === 'jpeg' ? quality : undefined,
    );
  });
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
