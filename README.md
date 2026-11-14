# Perspective Crop

Straighten skewed photos of documents, receipts, whiteboards and screens, entirely in the browser. Images are never uploaded.

**Live:** https://finyakginshabu.github.io/perspective-crop/

## Features

- **Open images** by choosing a file, dragging it onto the page, or pasting from the clipboard. On phones, pick from the gallery or take a photo.
- **Place four corners** on the document. A magnifier shows full-resolution pixels around the corner you're dragging, so you can place it precisely.
- **Straighten** with a perspective (homography) transform. Output size follows the document's proportions.
- **Export** as **JPG** (adjustable quality, with live file size) or **PNG**.
- **Private:** all processing happens on your device. No server, no tracking.
- **Works on desktop and mobile**, no install and no build step.

## How to use

1. Open an image.
2. Drag each corner handle onto a corner of the document.
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
    cornerEditor.js     corner handles, overlay and magnifier
    homography.js       pure math: homography + bilinear warp (no DOM)
    warp.worker.js      runs the warp off the main thread
    exporter.js         JPG/PNG encoding and download
    fit.js              aspect-exact sizing of preview canvases
tests/                  node:test unit tests for the math
.github/workflows/      test + GitHub Pages deployment
```

## How it works

The four corners define a quadrilateral in the source photo. Solving an 8×8 linear system gives the homography that maps the output rectangle onto that quadrilateral. For every output pixel, the matching source position is looked up (inverse mapping) and sampled bilinearly, so there are no holes or jagged edges. The warp runs in a Web Worker to keep the page responsive on large photos.

## License

MIT, see [LICENSE](LICENSE).
