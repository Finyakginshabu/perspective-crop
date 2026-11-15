# Perspective Crop

Straighten skewed photos of documents, receipts, whiteboards and screens, entirely in the browser. Images are never uploaded.

**Live:** https://finyakginshabu.github.io/perspective-crop/

## Features

- **Open images** by choosing a file, dragging it onto the page, or pasting from the clipboard. On phones, pick from the gallery or take a photo.
- **Place four corners** on the document. A magnifier shows full-resolution pixels around the corner you're dragging, so you can place it precisely.
- **Magnet:** a dragged corner snaps onto a nearby corner in the photo, such as the paper's corner. Toggle it with the magnet button next to **Reset corners**.
- **Straighten** with a perspective (homography) transform. Output size follows the document's proportions.
- **Export** as **JPG** (adjustable quality, with live file size) or lossless **PNG**. The result preview shows the exact output file; long-press or right-click it to save or copy.
- **Private:** all processing happens on your device. No server, no tracking.
- **Works on desktop and mobile**, no install and no build step.

## How to use

1. Open an image.
2. Drag each corner handle onto a corner of the document. With the magnet on, it snaps into place once it's close.
3. Click **Straighten** and check the result.
4. Choose JPG or PNG, then click **Download**.

## Run locally

ES modules and Web Workers don't load from `file://`, so serve the folder over HTTP:

```bash
npm start            # http://localhost:3000
# or, with no Node tooling:
python -m http.server 3000
```

Run the unit tests (Node 18+, no dependencies):

```bash
npm test
```

## Deployment

Every push to `main` runs the tests and publishes the site to GitHub Pages via [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

To deploy your own copy: fork the repo, then in **Settings → Pages** set **Source** to **GitHub Actions**. All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

## Project layout

```
index.html              page markup
src/
  css/styles.css        styles (navy theme, responsive)
  js/
    main.js             UI wiring: loading, straighten, export
    cornerEditor.js     corner handles, overlay, magnifier and magnet
    snap.js             pure math: corner detection for the magnet (no DOM)
    homography.js       pure math: homography + bilinear warp (no DOM)
    warp.worker.js      runs the warp off the main thread
    exporter.js         JPG/PNG encoding and download
    fit.js              aspect-exact sizing of the previews
tests/                  node:test unit tests for the math (warp and magnet)
.github/workflows/      test + GitHub Pages deployment
```

## How it works

The four corners define a quadrilateral in the source photo. Solving an 8×8 linear system gives the homography that maps the output rectangle onto that quadrilateral. For every output pixel, the matching source position is looked up (inverse mapping) and sampled bilinearly, so there are no holes or jagged edges. The warp runs in a Web Worker to keep the page responsive on large photos.

The magnet computes a corner-strength map of the preview once per image: the smaller eigenvalue of the gradient structure tensor (Shi–Tomasi), which is high only where two edges meet. While you drag, it takes the strongest corner within reach of the pointer and refines it to sub-pixel accuracy by finding the point that the surrounding gradient lines pass through.

## License

MIT, see [LICENSE](LICENSE).
