# Perspective Crop

Straighten skewed photos of documents, receipts and whiteboards, entirely in the browser. Images are never uploaded.

- Open an image by picking a file, dragging it onto the page, or pasting from the clipboard
- Drag four corners onto the document, then straighten
- Export as **JPG** (adjustable quality, with live file size) or **PNG**

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

## Deploy to GitHub Pages

1. Push to a GitHub repo on the `main` branch.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. The workflow in `.github/workflows/pages.yml` runs the tests and publishes the site.

All asset paths are relative, so it works under `https://<user>.github.io/<repo>/`.

## Project layout

```
index.html              page markup
src/
  css/styles.css        styles (light/dark)
  js/
    main.js             UI wiring: loading, straighten, export
    cornerEditor.js     canvas with four draggable corner handles
    homography.js       pure math: homography + bilinear warp (no DOM)
    warp.worker.js      runs the warp off the main thread
    exporter.js         JPG/PNG encoding and download
    fit.js              aspect-exact sizing of preview canvases
tests/                  node:test unit tests for the math
.github/workflows/      Pages deployment
```

## How it works

The four corners define a quad in the source photo. An 8×8 linear system gives the homography mapping the output rectangle onto that quad. For every output pixel the source position is looked up (inverse mapping) and sampled bilinearly, so there are no holes or jagged edges.

## License

MIT, see [LICENSE](LICENSE).
