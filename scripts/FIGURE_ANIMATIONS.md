# HumanVerse figure and page entrances

`HumanVerseAnimation.tsx` lazily loads a same-origin SVG in an object element.
The existing transparent WebP remains the no-JavaScript/error fallback.
`humanverse-motion.ts` animates original SVG layers over 4.2 seconds: 19 skill
bars grow from their baselines, the five independent rings sweep clockwise,
then their labels, photos and title fade in. Bar heights, logarithmic scale,
sector shapes, values and final positions remain unchanged. It plays once on
entry, supports pause/replay, pauses offscreen or in a hidden tab, and displays
the complete figure for reduced motion. Print also uses the complete WebP.

Source: [Figma Dataset figure 558:2](https://www.figma.com/design/AvbPqyrt6WDjBsrSW6NLuW/lambda0?node-id=558-2).
A temporary clone was exported with each SVG ID set to `hv_<original node ID>`
and large white backgrounds removed. The temporary clone was deleted; the
original design was not changed. Outlined text preserves original typography.

To package a fresh equivalent export saved in `work/humanverse-layers.svg`:

```sh
python scripts/prepare-humanverse-animation.py
```

The packager keeps SVG vectors verbatim and externalizes the 21 embedded bitmap
images as optimized WebP assets. The published SVG is 1.19 MB uncompressed and
the image assets total 1.85 MB, loaded only near the figure's viewport.

`PageTransitions.tsx` gives selected text/figure groups a single 850 ms opacity
entrance. Content stays visible after entering; there is no scroll-exit hiding
or infinite loop. Server-rendered content is visible by default. Keyboard focus,
reduced motion and printing expose content immediately.
