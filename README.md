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
- `app/components/` — this storefront's header, cart, checkout, catalogue and
  store cards. Ordinary React components; edit them directly.
- `app/custom/` — the bespoke sections built for this storefront, with their
  original source and comments. Page trees reference these by name.
- `data/` — the page trees this storefront renders from.
- `.env.local` — points the app at the bundled `data/` (STUDIO_DATA_ROOT).

Everything needed to run is included. No external Studio dependency.

## Editing it

Edit `app/components/*.jsx` and `app/custom/*.jsx` directly — they are ordinary
React components and they are yours. There is no overlay, no generated copy and
no fallback: `app/components/Header.jsx` is your header. Nothing in this repo
will overwrite your changes, and running the dev server will not revert them.

Commit and push as normal. YELO Studio reads these same paths when it pulls the
branch, so your changes come back into the Studio rather than being replaced by
it. Publishing from the Studio adds commits on top of the branch and never
force-pushes, so your history is preserved.

One file is generated — `app/custom/index.js`, a plain static registry mapping
section names to modules. If you add a section, add it there too.

## Four files that talk to the YELO backend

Restyle these freely; keep their API calls:

- `app/components/CheckoutPanel.jsx`
- `app/components/AuthModal.jsx`
- `app/components/OrderReceipt.jsx`
- `app/components/BillLines.jsx`

Between them they carry the login, bill, order and payment flows. Change the
markup and the styling as much as you like — but if the fetches, field names or
call order change, the page still renders and quietly stops taking money. See
`docs/YELO_API_REFERENCE.md` for the endpoints and payloads.

Everything else in `app/components/` is presentation. Rewrite it however you want.
