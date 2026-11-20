# @pixelvale/ui (vendored)

This directory contains the source of [Pixelvale UI](https://github.com/summer-boythink/pixelvale-ui)
so the platform can build offline and without publishing to npm.

- Upstream: `summer-boythink/pixelvale-ui`, `packages/ui/src`
- Keep `src/components`, `src/lib`, `src/index.ts` and `src/styles.css` in sync with upstream.
- The package deliberately points its exports at TypeScript source. Vite compiles it as part
  of the frontend build, so there is no separate build step.
- Local compatibility patch: `src/components/Carousel.tsx` spreads `{ inert: '' }` instead of
  using the boolean JSX prop, because this app uses React 18 typings. Re-apply this one-line
  change after syncing if the upstream still targets React 19 typings.
- Upstream license: MIT (see `LICENSE`).

Usage in this workspace:

```tsx
import { Button, Panel } from '@pixelvale/ui';
import '@pixelvale/ui/style.css';
```

When syncing from upstream, copy upstream `packages/ui/src` over `src`, then remove
`src/bundle.ts`, `src/test` and any `vite.config.ts` references. See the root README for the
exact command.
