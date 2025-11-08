## Purpose
This file gives concise, actionable context to AI coding agents working on the prun_universe_map React app (a D3/SVG map of the "Prosperous Universe"). Focus on data flow, integration points, and repository conventions so an agent can be productive immediately.

## Big picture
- Single-page React app (Create React App) that renders an interactive SVG world map via D3.
- Data lives in `public/` as JSON: `graph_data.json`, `material_data.json`, `prun_universe_data.json`, `planet_data.json`.
- `src/contexts/GraphContext.js` is the primary data loader: it fetches the JSON files and groups planet/universe data by `SystemId`.
- `src/components/UniverseMap.jsx` loads `public/PrUn_universe_map_normalized.svg` with `d3.xml(...)`, attaches zoom/pan and mouse events (via `src/utils/svgUtils.js`), and mutates the SVG DOM directly. Treat the SVG as an external asset (not managed by React).

## Key files to inspect
- `src/contexts/GraphContext.js` — loads JSON files, exposes `{ graph, planetData, universeData, materials }` via `GraphContext`.
- `src/components/UniverseMap.jsx` — D3 setup, zoom, event wiring, and overlays (see `applyCogcOverlay`). Avoid React-style rewrites of the SVG under the map container element (id: map-container).
- `src/utils/svgUtils.js` — centralized mouse/hover/tip logic used by the map.
- `src/utils/graphUtils.js` — pathfinding helpers (uses `dijkstrajs`) and highlight logic.
- `constants/cogcPrograms.js` — program display/value mapping used by overlays.
- `public/PrUn_universe_map_normalized.svg` and `public/*.json` — canonical runtime assets. SVG normalization scripts live in `public/normalize_svg_styles.py` and `public/parse_svg.py`.

## Dataflow / integration points
- On app mount, `GraphProvider` fetches JSON files from the site root (relative paths like `fetch('graph_data.json')`), so any data replacement must be placed in `public/` or served at the same path.
- `GraphContext` groups planet data by `SystemId` (object keyed by system id string). This is the lookup shape other components expect.
- The SVG nodes' `id` attributes are used as system identifiers. The map code maps `rect` elements with `id` === `SystemId` to planet/planetData.
- Pathfinding: `findShortestPath` uses `utils/graphUtils.js` and the `graph` object loaded from `graph_data.json`.

## Project-specific conventions
- Data files are loaded from `public/` with `fetch('filename.json')` (not imported). Keep large JSON files in `public/`.
- Map SVG is manipulated with D3 after being appended to the DOM — avoid React re-rendering the SVG node.
- Many contexts are nested in `src/App.js` in this order: `GraphProvider` > `SelectionProvider` > `SearchProvider` > `CogcOverlayProvider` > `DataPointProvider`. Be careful when moving providers — some consumers assume parent providers exist.
- Planet/universe objects are grouped by `SystemId`. Use that keying pattern when creating helpers consuming `planetData` or `universeData`.

## Developer workflows (commands)
- Dev server: `npm start` — Create React App dev server (http://localhost:3000).
- Run tests: `npm test` (CRA interactive watch).
- Build for production: `npm run build`.
- Serve production locally: `npm run serve` (serves `build/` on port 5000).

## Quick editing hints / examples
- To change how overlays are drawn, edit `src/components/UniverseMap.jsx` (function `applyCogcOverlay`) and `constants/cogcPrograms.js` (program types).
- To change map interactions, edit `src/utils/svgUtils.js` and `src/components/DataPointOverlay.jsx` (overlay rendering).
- Example: `GraphContext` fetch snippet — when modifying data-loading behavior, replicate grouping by `SystemId`:
  fetch('planet_data.json').then(r => r.json()).then(data => { const grouped = data.reduce((acc, planet) => { (acc[planet.SystemId] ??= []).push(planet); return acc; }, {}); setPlanetData(grouped); });

## External dependencies & data sources
- Notable npm packages: `d3`, `dijkstrajs`, `react` (CRA). See `package.json` for full list.
- Official data sources used by maintainers: FIO endpoints mentioned in `README.md` (e.g. `https://rest.fnar.net/systemstars` and `https://rest.fnar.net/planet/allplanets/full`). To refresh runtime data: replace `public/prun_universe_data.json` and `public/planet_data.json` with updated exports.

## Gotchas for AI agents
- Don't convert the SVG into React-managed JSX — the app expects D3 to mutate the DOM.
- IDs in SVG must match `SystemId` keys in the JSON — renaming either side will break lookups.
- Many files assume browser globals (e.g., `window.innerWidth`), so local scripts should run in a browser-like environment.

If anything here is unclear or you'd like more examples (e.g., exact call-sites for `addMouseEvents` or `findShortestPath`), tell me which area to expand and I will iterate.
