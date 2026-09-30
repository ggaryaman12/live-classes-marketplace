# Live Classes Markeptlace 2

A storefront built with YELO Studio, exported as a standalone Next.js app.

## Run it

```bash
npm install
npm run dev      # http://localhost:4400/preview
```

`npm run build && npm run start` for a production build.

## What is here

- `app/` — the Next.js app (App Router). Pages render from component-JSON trees.
- `app/custom/` — the bespoke components built for this storefront (with their
  original source and comments).
- `data/` — the page trees and design tokens this storefront renders from.
- `.env.local` — points the app at the bundled `data/` (STUDIO_DATA_ROOT).

Everything needed to run is included. No external Studio dependency.
