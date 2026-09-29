# λ₀ / HumanVerse-500 project page

Research website for **Towards a General Humanoid Loco-Manipulation Model via
Egocentric Whole-Body Human Data Pretraining**.

## View the offline page

Open `offline-site/index.html` in a modern browser. The page includes its own
scripts, images, videos, and packed motion assets. No server, npm installation,
or internet connection is required. WebGL is required for the 3D viewers.

The offline snapshot contains nine real-world demonstration videos (four laboratory
tasks, three break-room tasks, and two visitor-center tasks), updated
paper figures, the 39-recording human motion gallery, synchronized G1 replay, and the scaling
animation. Empty video sections are omitted. Its videos use the compact encodings
from the supplied offline package; the source website retains the original
higher-resolution videos in `public/videos/`. The break-room and visitor-center clips use browser-compatible
H.264 at 1080p online and 720p offline; the alternate fruit-delivery take is excluded.

## Develop the website

Requires Node.js 22.13+ (an LTS release is recommended).

```sh
npm ci
npm run dev
```

```sh
npm run build
npm run lint
npm test
```

## Refresh the offline snapshot

```sh
npm run build:offline
```

This rebuilds the HTML, CSS, and browser bundle from `app/`, preserving the
existing packed recordings in `offline-site/offline/assets/`. It also updates
the static HTML fallback so it agrees with the interactive page. The offline
page deliberately omits the manuscript links; its accompanying PDF is not
needed to run the interactive demonstrations.

`scripts/build-offline.mjs` also supports a full asset export when pointed at an
unpacked site containing the original `motion/*.json`, meshes and videos.
`scripts/package-offline.py` and `scripts/shrink-offline.py` produce compact
copies without overwriting their source media. Those optional preparation tools
require Python, NumPy and FFmpeg.

## Contents

- `app/`: editable React page, styles, figures, and 3D viewers.
- `public/`: full-resolution website media and motion data.
- `offline-site/`: directly viewable offline snapshot.
- `scripts/`: preparation, export and performance notes.
- `tests/`: page rendering, asset consistency and playback checks.

The separate training-code release and standalone summary videos from the
supplementary-materials folder are outside this project-page repository.
