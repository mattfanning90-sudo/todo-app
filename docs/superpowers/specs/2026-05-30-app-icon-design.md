# App Icon Design Spec
_2026-05-30_

## Summary

A 1024×1024 PNG app icon for the Todo iOS app. Purple/indigo gradient background with three stacked rounded-rectangle cards — two translucent ghost cards behind a white front card bearing four task lines. Generated from SVG via a Node.js script, then placed into the Xcode asset catalog for TestFlight and App Store distribution.

---

## Visual Design

### Background
- Gradient: `#4f46e5` (indigo) → `#7c3aed` (purple), angle 145°
- Subtle radial shine in the top-right quadrant: `rgba(255,255,255,0.18)` at 80%/20%, fading to transparent

### Card stack (centred, ~54% of icon width, ~60% of icon height)
Three cards, all same dimensions, stacked with rotation:

| Card | Fill | Rotation | Opacity |
|---|---|---|---|
| Back (bottom) | `rgba(255,255,255,0.18)` | −11° | 100% |
| Middle | `rgba(255,255,255,0.42)` | −4° | 100% |
| Front (top) | `#ffffff` | 0° | 100% |

- All cards: `border-radius` = 5.5% of icon size
- All rotate around `transform-origin: bottom center`
- Drop shadow on front card: `0 2% 6% rgba(0,0,0,0.20)`

### Task lines on front card
Four horizontal pill-shaped lines inside the front card (padding ~6.5% horizontal, ~7% vertical, evenly spaced):

| Line | Colour | Width |
|---|---|---|
| Done | `#22c55e` (green) | 65% of card width |
| In progress | `#6366f1` (indigo) | 88% of card width |
| To-do A | `#e2e8f0` (grey) | 75% of card width |
| To-do B | `#e2e8f0` (grey) | 50% of card width |

Line height: ~4.5% of icon size. Border-radius: 99px (pill).

---

## Deliverables

| File | Purpose |
|---|---|
| `ios-app/assets/icon.png` | 1024×1024 source (also referenced in `app.json`) |
| `ios-app/ios/Todo/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` | Xcode asset catalog (force-committed — `ios/` is gitignored) |
| `ios-app/scripts/generate-icon.mjs` | Reproducible generation script |

`app.json` `"icon"` field updated to `"./assets/icon.png"` so EAS picks it up for future managed-workflow rebuilds as well.

---

## Generation approach

An ES module script (`generate-icon.mjs`) builds the icon using the `sharp` package (already in the dependency tree via React Native tooling) and inline SVG:

1. Construct a 1024×1024 SVG string encoding the background gradient, shine, three cards, and four task lines — all using absolute pixel coordinates computed from the proportions above.
2. Pass the SVG buffer to `sharp().png().toFile(...)` to write the PNG.
3. Copy the output to both destination paths.

No browser, no Playwright, no new runtime dependencies beyond `sharp`.

---

## Out of scope

- Dark/light adaptive icon variants (iOS uses a single icon)
- Android adaptive icon (separate `android/` asset, different spec)
- App Store marketing screenshots or preview images
