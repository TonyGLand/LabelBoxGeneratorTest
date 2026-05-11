# Label Roll Box Calculator

A static React calculator for estimating practical box plans for label rolls.

The app source started as `base.js`. For GitHub Pages deployment, `base.js` is split into `base.part*.txt` files and stitched together by `index.html` in the browser.

Current assumptions:

- Repeat edge can be set to short edge or long edge.
- Roll pitch includes a fixed 0.25 inch gap between labels.
- Roll height includes a fixed 0.5 inch core overhang beyond the label height.
- Multiple allowed box sizes can be selected per order.
- Core diameter, caliper, clearance, extra amount percentage, packing method, and allowed box sizes live in the Settings tab.
- Extra amount defaults to 5 percent.
- Packing method can be set to standard grid or hex / offset rows.
- Roll IDs in the calculation table match the IDs shown in the 2D packing view and box summary.

## GitHub Pages

This repository is designed to deploy directly from the `main` branch root.

Live site:

```text
https://tonygland.github.io/LabelBoxGenerator/
```

## Local Run

Serve the folder:

```powershell
python -m http.server 5173
```

Then visit:

```text
http://localhost:5173
```
