# Beaco brand assets

## Image-generated master

- `png/beaco-mark-master.png`: transparent 1400px image-generated master mark
- `png/beaco-lockup-horizontal-dark.png`: white-wordmark lockup for dark surfaces
- `png/beaco-lockup-horizontal-light.png`: black-wordmark, black-bell lockup for light surfaces
- `png/beaco-lockup-stacked-dark.png`: white-wordmark lockup for dark surfaces
- `png/beaco-lockup-stacked-light.png`: black-wordmark, black-bell lockup for light surfaces
- `png/beaco-wordmark-*.png`: standalone wordmarks
- `png/beaco-mark-on-light.png`: transparent approved mark with a black bell for light surfaces

## Raster exports

The `png/` directory contains transparent mark exports from 16px through 1024px, Apple and PWA icons, a maskable icon, a multi-size `.ico`, and a 1200x630 social card. The visual master was produced with image generation from the supplied Beaco references, then mechanically resized and composed into production formats.

## Usage rules

- Use the mark alone below 120px of available horizontal space.
- Use the horizontal lockup in headers, marketing exports, and partner placements.
- Use the stacked lockup only in centered or square compositions.
- Keep clear space around the mark equal to at least one quarter of its width.
- Do not add glow, shadow, or a containing shape below 48px.
- Use the original white-bell mark and `*-dark` lockups on dark UI.
- Use `beaco-mark-on-light.png` and the `*-light` lockups on light UI. These preserve the amber B and switch only the bell and wordmark contrast elements to black.
- App icons, favicons, and the maskable icon keep their original white bell because their exported dark background supplies the required contrast.
- Use the maskable icon for installable app manifests. It includes the required safe-area padding.

Brand colors:

- Canvas: `#060605`
- Ink: `#F1EFE7`
- Amber: `#E9AA31`
- Amber on light: `#D38F16`
