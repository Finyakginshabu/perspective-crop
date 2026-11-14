import { CornerEditor } from './cornerEditor.js';
import { suggestedSize } from './homography.js';
import { encodeCanvas, downloadBlob, formatBytes, FORMATS } from './exporter.js';
import { fitCanvas } from './fit.js';

const $ = (id) => document.getElementById(id);

const els = {
  dropzone: $('dropzone'),
  fileInput: $('file-input'),
  editor: $('editor'),
  sourceCanvas: $('source-canvas'),
  resultCanvas: $('result-canvas'),
  resultEmpty: $('result-empty'),
  straighten: $('straighten'),
  reset: $('reset'),
  newImage: $('new-image'),
  format: $('format'),
  quality: $('quality'),
  qualityValue: $('quality-value'),
  qualityRow: $('quality-row'),
  info: $('info'),
  download: $('download'),
  status: $('status'),
  dropStatus: $('drop-status'),
};

const editor = new CornerEditor(els.sourceCanvas);
// Keep the result preview fitted (aspect-exact) as the layout changes.
new ResizeObserver(() => !els.resultCanvas.hidden && fitCanvas(els.resultCanvas))
  .observe(els.resultCanvas.parentElement);

const worker = new Worker(new URL('./warp.worker.js', import.meta.url), { type: 'module' });

let bitmap = null;
let fileName = 'image';
let requestId = 0;
let currentBlob = null;
let encodeTimer = 0;

// Messages go in the editor card, or in the drop zone before an image is loaded.
const setStatus = (msg) => {
  const target = els.editor.hidden ? els.dropStatus : els.status;
  target.textContent = msg;
};

// ---------- Loading images (picker, drag & drop, paste) ----------

async function loadFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('Please choose an image file.');
    return;
  }
  try {
    // 'from-image' applies EXIF orientation so phone photos load upright.
    const next = await createImageBitmap(file, { imageOrientation: 'from-image' });
    bitmap?.close();
    bitmap = next;
    fileName = file.name.replace(/\.[^.]+$/, '') || 'image';
    editor.setImage(bitmap);
    clearResult();
    els.dropzone.hidden = true;
    els.editor.hidden = false;
    setStatus(`${bitmap.width} × ${bitmap.height} px. Drag the corners to the edges of the document.`);
  } catch {
    setStatus('Could not read that image.');
  }
}

els.fileInput.addEventListener('change', () => {
  loadFile(els.fileInput.files[0]);
  els.fileInput.value = ''; // allow re-selecting the same file
});
els.newImage.addEventListener('click', () => els.fileInput.click());

for (const type of ['dragenter', 'dragover']) {
  window.addEventListener(type, (e) => {
    e.preventDefault();
    document.body.classList.add('dragging');
  });
}
for (const type of ['dragleave', 'drop']) {
  window.addEventListener(type, (e) => {
    e.preventDefault();
    if (type === 'drop' || e.relatedTarget === null) document.body.classList.remove('dragging');
  });
}
window.addEventListener('drop', (e) => loadFile(e.dataTransfer?.files[0]));
window.addEventListener('paste', (e) => {
  const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
  if (file) loadFile(file);
});

// ---------- Straighten ----------

els.reset.addEventListener('click', () => editor.reset());

els.straighten.addEventListener('click', () => {
  if (!bitmap) return;
  const [dw, dh] = suggestedSize(editor.corners);

  // Read pixels from a clean canvas so the overlay is never baked in.
  const tmp = document.createElement('canvas');
  tmp.width = bitmap.width;
  tmp.height = bitmap.height;
  const ctx = tmp.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, tmp.width, tmp.height);

  els.straighten.disabled = true;
  setStatus('Straightening…');
  worker.postMessage(
    { id: ++requestId, pixels: data.data.buffer, sw: tmp.width, sh: tmp.height,
      corners: editor.corners, dw, dh },
    [data.data.buffer],
  );
});

worker.onmessage = (e) => {
  const m = e.data;
  if (m.id !== requestId) return;
  els.straighten.disabled = false;
  if (m.error) return setStatus(m.error);

  const c = els.resultCanvas;
  c.width = m.dw;
  c.height = m.dh;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(m.pixels), m.dw, m.dh), 0, 0);
  c.hidden = false;
  fitCanvas(c);
  // Stacked layout: the result is below the fold, so bring it into view.
  if (matchMedia('(max-width: 800px)').matches) {
    c.closest('.pane').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  els.resultEmpty.hidden = true;
  els.download.disabled = false;
  setStatus(`Straightened · ${m.dw} × ${m.dh} px. Ready to download.`);
  encode();
};

worker.onerror = () => {
  els.straighten.disabled = false;
  setStatus('Processing failed.');
};

function clearResult() {
  els.resultCanvas.hidden = true;
  els.resultEmpty.hidden = false;
  els.download.disabled = true;
  els.info.textContent = '';
  currentBlob = null;
}

// ---------- Export (JPG / PNG, adjustable quality) ----------

function syncQualityUi() {
  // Keep the slot (visibility, not display) so the layout doesn't shift.
  const isJpeg = els.format.value === 'jpeg';
  els.qualityRow.classList.toggle('is-off', !isJpeg);
  els.quality.disabled = !isJpeg;
  els.qualityValue.textContent = els.quality.value;
}

async function encode() {
  if (els.resultCanvas.hidden) return;
  const format = els.format.value;
  const blob = await encodeCanvas(els.resultCanvas, format, Number(els.quality.value) / 100);
  currentBlob = blob;
  els.info.textContent = `${FORMATS[format].ext.toUpperCase()} · ${formatBytes(blob.size)}`;
}

function scheduleEncode() {
  syncQualityUi();
  clearTimeout(encodeTimer);
  encodeTimer = setTimeout(encode, 150); // debounce slider drags
}

els.format.addEventListener('click', () => {
  const next = els.format.value === 'jpeg' ? 'png' : 'jpeg';
  els.format.value = next;
  els.format.querySelector('.format-label').textContent = FORMATS[next].ext.toUpperCase();
  scheduleEncode();
});
els.quality.addEventListener('input', scheduleEncode);

els.download.addEventListener('click', () => {
  if (!currentBlob) return;
  const ext = FORMATS[els.format.value].ext;
  downloadBlob(currentBlob, `${fileName}-straightened.${ext}`);
});

syncQualityUi();
