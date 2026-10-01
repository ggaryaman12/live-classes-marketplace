// Make the ACTIVE tenant's own component files visible to Next.
//
// Tenant-written components live in their git worktree on the mounted volume
// (`/data/tenants/<id>/components/*.jsx`) so they are persistent, versioned and
// fork/rebase-able with the rest of that tenant's work. But Next only compiles
// files inside the app directory — so before rendering we mirror them into
// `app/custom/`. The preview runs `next dev`, so a newly written or edited
// component is picked up by HMR.
//
// Only the active tenant's components are mirrored, so one tenant's custom code
// is never resolvable from another tenant's preview.
const fs = require('fs');
const path = require('path');

const ROOT = process.env.STUDIO_DATA_ROOT || path.join(process.cwd(), '..');
const CUSTOM_DIR = path.join(process.cwd(), 'app', 'custom');
// Editable site chrome: the project's own copies live in its worktree `chrome/`
// dir; the shipped app/components are the defaults. Mirrored into app/chrome so
// Next compiles them in, and lib/chromeReg.js prefers the project's copy.
const CHROME_DIR = path.join(process.cwd(), 'app', 'chrome');
const SHIPPED_CHROME_DIR = path.join(process.cwd(), 'app', 'components');
const SAFE = /^[A-Za-z][A-Za-z0-9_]{0,63}\.jsx$/;
// The workspace's design tokens, mirrored to a fixed path that layout.jsx imports.
// See TOKENS_DEFAULT below for why this file can never simply be removed.
const TOKENS = 'tokens.css';
// The bundler builds `import('../custom/<name>.jsx')` into a context over this
// directory. If the directory is EMPTY the context cannot resolve and EVERY page
// 500s — which is exactly what happened live: the tenant had no components yet,
// the cleanup below removed the seed file, and the whole preview went down. The
// seed is therefore never synced away.
const SEED = 'Placeholder.jsx';

// WHICH TENANT THIS PROCESS SERVES.
//
// `STUDIO_PREVIEW_TENANT` is set per preview process by platform/previewPool.js,
// so two tenants can be previewed at once. Falling back to the shared
// active.json keeps a single-preview install (and local dev) working exactly as
// before — that file is the right answer when there is only one preview.
function activeTenantId() {
  const pinned = process.env.STUDIO_PREVIEW_TENANT;
  if (pinned) return String(pinned);
  try {
    const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'data', 'active.json'), 'utf8'));
    return a?.tenantId ? String(a.tenantId) : null;
  } catch { return null; }
}

function srcDirFor(tenantId) {
  if (!tenantId || tenantId === 'master') return path.join(process.cwd(), 'components-custom'); // master's own
  return path.join(ROOT, 'tenants', tenantId, 'components');
}

// Mirror the active tenant's components into app/custom. Returns the names found.
// Cheap and idempotent: copies only when size/mtime differs, and removes files
// that no longer belong to this tenant so stale code can't render.
//
// TENANT ISOLATION: app/custom is a SHARED directory, but each tenant preview is
// a SEPARATE `next start` whose registry was already COMPILED into its own
// .next-t-<id> at build time. So in production this mutation does nothing for the
// running process — the bundle is frozen — while it actively DELETES the other
// running tenant's files from the shared dir on every render, corrupting a
// concurrent build. That is exactly how Pluto ended up serving Hersh99's
// (or an empty) registry. So mutation happens ONLY when explicitly forced (the
// pre-build sync in platform/previewPool.js) or in dev (next dev needs the files
// on disk for HMR). A normal production request is a no-op.
function syncCustom({ force = false } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && !force) {
    // Nothing to do: the registry this process serves is already compiled in.
    // Report what SHOULD be there so callers/telemetry stay meaningful, without
    // touching the shared directory the other tenant is also using.
    return expectedNames();
  }
  const tenantId = activeTenantId();
  const src = srcDirFor(tenantId);
  let names = [];
  try { fs.mkdirSync(CUSTOM_DIR, { recursive: true }); } catch {}

  let entries = [];
  try { entries = fs.readdirSync(src).filter((f) => SAFE.test(f)); } catch { entries = []; }

  for (const f of entries) {
    const from = path.join(src, f), to = path.join(CUSTOM_DIR, f);
    try {
      const a = fs.statSync(from);
      let stale = true;
      try { const b = fs.statSync(to); stale = b.size !== a.size || b.mtimeMs < a.mtimeMs; } catch {}
      if (stale) fs.copyFileSync(from, to);
      names.push(f.replace(/\.jsx$/, ''));
    } catch {}
  }

  // Drop anything mirrored earlier that is not this tenant's — but NEVER the seed
  // (see SEED above: removing it takes the entire preview down with a 500).
  try {
    for (const f of fs.readdirSync(CUSTOM_DIR)) {
      if (f === SEED) continue;
      if (SAFE.test(f) && !entries.includes(f)) {
        try { fs.unlinkSync(path.join(CUSTOM_DIR, f)); } catch {}
      }
    }
  } catch {}

  // Belt and braces: if the seed ever goes missing (manual deletion, a bad
  // rebase), recreate it rather than letting the preview break.
  try {
    const seedPath = path.join(CUSTOM_DIR, SEED);
    if (!fs.existsSync(seedPath)) {
      fs.writeFileSync(seedPath, 'export default function Placeholder() {\n  return null;\n}\n');
    }
  } catch {}

  // ONE MISSING SIBLING MUST NOT KILL THE WHOLE PREVIEW.
  //
  // The AI sometimes writes a component that imports a sibling it never created
  // — e.g. ClassCheckout.jsx does `import OrderReceipt from '../components/
  // OrderReceipt'` but no OrderReceipt.jsx exists. `next build` then fails with
  // "Module not found" and the ENTIRE tenant preview cannot compile — it hangs
  // on "Compiling…" forever. A dangling import is a data bug in one section; it
  // must not take down the site. So scan the mirrored components for relative
  // sibling imports and, for any target that does not exist, drop a harmless
  // stub (renders nothing) so the build resolves and only that one section is
  // empty rather than everything being dead.
  try { stubMissingSiblings(names); } catch {}

  syncTokens(tenantId);
  writeIndex(names);
  // Mirror the tenant's editable chrome (header/cart/checkout/etc.) so the build
  // renders THEIR version, not the stock one. Same force-vs-noop discipline: this
  // whole function only mutates when forced (build) or in dev.
  try { syncChrome(tenantId); } catch {}
  return names;
}

// EDITABLE SITE CHROME — the project's own header/cart/checkout/etc.
//
// THE LOST-WORK BUG. The tenant's chrome edits are saved in <worktree>/chrome/*.jsx
// (seeded once from the shipped app/components, then edited over many turns). But
// nothing mirrored them into the app, so the PREVIEW and the EXPORT both rendered
// the STOCK chrome — the user's header/cart/checkout work looked lost (it was on
// the volume all along, just never applied). This mirrors the project's chrome
// into app/chrome and lib/chromeReg.js prefers it, falling back to shipped.
function chromeSrcDirFor(tenantId) {
  if (!tenantId || tenantId === 'master') return null;   // no per-project chrome → shipped fallback
  return path.join(ROOT, 'tenants', tenantId, 'chrome');
}

// A chrome file imports its siblings by relative path (Header → ./CartSheet), so a
// PARTIAL overlay would fail to compile. Rule: if the project owns ANY chrome, the
// overlay is the FULL set — its own files plus the shipped default for any piece it
// hasn't touched. Owns none ⇒ empty overlay, resolver uses shipped entirely.
function syncChrome(tenantId = activeTenantId()) {
  if (!fs.existsSync(CHROME_DIR)) { try { fs.mkdirSync(CHROME_DIR, { recursive: true }); } catch {} }
  if (!fs.existsSync(SHIPPED_CHROME_DIR)) { writeChromeIndex([]); return []; }
  const src = chromeSrcDirFor(tenantId);

  let owned = [];
  try { if (src) owned = fs.readdirSync(src).filter((f) => SAFE.test(f)); } catch { owned = []; }

  let full = [];
  if (owned.length) {
    let shipped = [];
    try { shipped = fs.readdirSync(SHIPPED_CHROME_DIR).filter((f) => SAFE.test(f)); } catch {}
    full = [...new Set([...owned, ...shipped])];
  }

  const want = new Set(full);
  const names = [];
  for (const f of full) {
    const from = owned.includes(f) ? path.join(src, f) : path.join(SHIPPED_CHROME_DIR, f);
    const to = path.join(CHROME_DIR, f);
    try {
      const a = fs.statSync(from);
      let stale = true;
      try { const b = fs.statSync(to); stale = b.size !== a.size || b.mtimeMs < a.mtimeMs; } catch {}
      if (stale) fs.copyFileSync(from, to);
      names.push(f.replace(/\.jsx$/, ''));
    } catch {}
  }

  // A chrome file can import a SIBLING that is not itself chrome — the tenant's
  // Header imports ./HeaderProfileMenu, which lives in the project's components/
  // (a Custom component), not chrome/. Those relative imports resolve inside
  // app/chrome, so pull any such sibling in from the tenant's components/ (or
  // stub it) — otherwise the mirrored Header fails to compile. Returns the set
  // of sibling files it added, so the cleanup below never deletes them.
  let siblings = new Set();
  if (names.length) {
    try { siblings = resolveChromeSiblings(tenantId) || new Set(); } catch { siblings = new Set(); }
  }

  // Drop overlay files no longer wanted (reverted to stock, or preview switched
  // tenant) so one project's chrome never leaks into another's.
  //
  // ORDER-INDEPENDENT AND PROCESS-SAFE. This used to rely on a module-level
  // `chromeSiblingKeep` var, which is empty in a fresh child process and could
  // be reset at the wrong time — so a SECOND syncChrome (e.g. a request-time
  // sync racing the pre-build one) deleted HeaderProfileMenu.jsx AFTER it was
  // placed, and the build then failed "Can't resolve './HeaderProfileMenu'".
  // The keep-set is now COMPUTED FRESH here from (a) the overlay set, (b) the
  // siblings just resolved, and (c) anything the chrome files actually import —
  // so it is correct no matter how many times, or in what order, this runs.
  try {
    const keep = new Set([...want, ...siblings]);
    // Belt-and-braces: never delete a file that a chrome file imports right now.
    for (const f of fs.readdirSync(CHROME_DIR)) {
      if (f === 'index.js' || !SAFE.test(f)) continue;
      try {
        const src2 = fs.readFileSync(path.join(CHROME_DIR, f), 'utf8');
        let m; const re = /\bfrom\s+['"]\.\/([A-Za-z][A-Za-z0-9_]*)['"]/g;
        while ((m = re.exec(src2))) keep.add(`${m[1]}.jsx`);
      } catch {}
    }
    for (const f of fs.readdirSync(CHROME_DIR)) {
      if (f === 'index.js') continue;
      if (SAFE.test(f) && !keep.has(f)) { try { fs.unlinkSync(path.join(CHROME_DIR, f)); } catch {} }
    }
  } catch {}

  writeChromeIndex(names);
  return names;
}

// Make every relative import in the mirrored chrome files resolve, so one
// dangling reference never fails the whole build:
//   • ./Sibling  — copy from the tenant's components/ if it lives there, else a
//                  null-render component stub.
//   • ../lib/X   — if app/lib/X is missing, drop a PERMISSIVE shim (any named or
//                  default import resolves to a safe no-op). The tenant's chrome
//                  sometimes imports a helper the AI never created (e.g.
//                  ../lib/safeText's titleHtml) — the same dangling-ref class as
//                  OrderReceipt. A shim keeps the storefront alive; the section
//                  degrades gracefully rather than the build dying.
// Returns the Set of sibling filenames it ADDED to app/chrome (so the caller's
// cleanup keeps them). Loops until stable, because a pulled sibling can itself
// import another sibling (HeaderProfileMenu → ./SomethingElse).
function resolveChromeSiblings(tenantId) {
  const added = new Set();
  const tenantComponents = tenantId && tenantId !== 'master'
    ? path.join(ROOT, 'tenants', String(tenantId), 'components') : null;
  const relRe = /\b(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]/g;   // ./X and ../lib/X, static or dynamic
  const exts = ['', '.jsx', '.js', '.tsx', '.ts', '/index.jsx', '/index.js'];
  for (let pass = 0; pass < 6; pass += 1) {           // bounded fixed-point
    let changed = false;
    const files = fs.readdirSync(CHROME_DIR).filter((f) => SAFE.test(f));
    for (const f of files) {
      let src = '';
      try { src = fs.readFileSync(path.join(CHROME_DIR, f), 'utf8'); } catch { continue; }
      let m;
      while ((m = relRe.exec(src))) {
      const spec = m[1];
      const base = path.resolve(CHROME_DIR, spec);
      if (exts.some((e) => { try { return fs.existsSync(base + e); } catch { return false; } })) continue;

      // Same-dir ./Sibling → prefer the tenant's real component, else null stub.
      if (/^\.\/[A-Za-z][A-Za-z0-9_]*$/.test(spec)) {
        const sib = spec.replace('./', '');
        const target = path.join(CHROME_DIR, `${sib}.jsx`);
        let copied = false;
        if (tenantComponents) {
          const from = path.join(tenantComponents, `${sib}.jsx`);
          try { if (fs.existsSync(from)) { fs.copyFileSync(from, target); copied = true; } } catch {}
        }
        if (!copied) { try { fs.writeFileSync(target, `export default function ${sib}() { return null; }\n`); } catch {} }
        added.add(`${sib}.jsx`); changed = true;
        continue;
      }

      // Anything else relative (../lib/X, ../foo) that is missing → permissive
      // shim so named AND default imports resolve to safe no-ops.
      try {
        const shimPath = `${base}.js`;
        fs.mkdirSync(path.dirname(shimPath), { recursive: true });
        if (!fs.existsSync(shimPath)) {
          fs.writeFileSync(shimPath,
            '// AUTO-SHIM: a chrome file imported this but no module existed. A\n'
            + '// permissive Proxy so any named/default import resolves to a safe\n'
            + '// no-op, keeping the build alive rather than failing on one dangling ref.\n'
            + 'const noop = () => "";\n'
            + 'const handler = { get: () => noop };\n'
            + 'const shim = new Proxy(noop, handler);\n'
            + 'export default shim;\n'
            + 'export const titleHtml = (s) => String(s == null ? "" : s);\n'
            + 'export { shim };\n');
          changed = true;
        }
      } catch {}
      }   // while imports
    }     // for files
    if (!changed) break;   // fixed point reached
  }       // for passes
  return added;
}

// app/chrome/index.js: a runtime CHROME object (object, not named exports, so a
// resolver reading an absent key just gets undefined and falls back). Empty
// overlay ⇒ `export const CHROME = {}` — zero missing-import risk.
function renderChromeIndex(names, ext = '.jsx') {
  const list = [...new Set(names)].sort();
  return [
    '// AUTO-GENERATED by app/lib/customSync.js — do not edit by hand.',
    '// Project-owned chrome overlay, exposed as a runtime OBJECT so lib/chromeReg.js',
    '// can read a name that may be absent without a static "export not found" break.',
    ...list.map((n) => `import * as m_${n} from './${n}${ext}';`),
    '',
    'function isComp(v) {',
    "  if (typeof v === 'function') return true;",
    "  return !!(v && typeof v === 'object' && v.$$typeof);",
    '}',
    'function pick(mod, name) {',
    '  if (!mod) return null;',
    '  if (isComp(mod.default)) return mod.default;',
    '  if (isComp(mod[name])) return mod[name];',
    '  for (const k of Object.keys(mod)) if (isComp(mod[k])) return mod[k];',
    '  return null;',
    '}',
    '',
    'export const CHROME = Object.fromEntries(Object.entries({',
    ...list.map((n) => `  ${n}: pick(m_${n}, '${n}'),`),
    '}).filter(([, v]) => v));',
    '',
  ].join('\n');
}

function writeChromeIndex(names) {
  const body = renderChromeIndex(names);
  try {
    const p = path.join(CHROME_DIR, 'index.js');
    let prev = null; try { prev = fs.readFileSync(p, 'utf8'); } catch {}
    if (prev !== body) fs.writeFileSync(p, body);
  } catch {}
}

// Find every RELATIVE import in the mirrored components and create a null-render
// stub for any target .jsx that does not exist — so one dangling reference can't
// fail the whole `next build`. The import is resolved RELATIVE TO THE IMPORTING
// FILE (in CUSTOM_DIR), so `../components/OrderReceipt` from app/custom resolves
// to app/components/OrderReceipt — exactly where the build looks. Only ever ADDS
// a missing file; never touches a real one, and never stubs a package import.
function stubMissingSiblings(present) {
  // Any relative import path: from './x', '../components/x', '../lib/x', etc.
  const importRe = /\bfrom\s+['"](\.[^'"]+)['"]/g;
  for (const name of present) {
    let src = '';
    try { src = fs.readFileSync(path.join(CUSTOM_DIR, `${name}.jsx`), 'utf8'); } catch { continue; }
    let m;
    while ((m = importRe.exec(src))) {
      const spec = m[1];
      // Resolve against CUSTOM_DIR (where the importing file lives). Try the
      // common component extensions; if any real file resolves, leave it alone.
      const base = path.resolve(CUSTOM_DIR, spec);
      const exts = ['', '.jsx', '.js', '.tsx', '.ts', '/index.jsx', '/index.js'];
      const exists = exts.some((e) => { try { return fs.existsSync(base + e); } catch { return false; } });
      if (exists) continue;
      // Only stub something that looks like a component (a .jsx target). Never
      // fabricate a lib/util or a package — those failing is a real error we
      // should surface, not paper over.
      if (/\/(lib|utils?)\//.test(spec)) continue;
      const stubPath = `${base}.jsx`;
      const compName = (path.basename(base).replace(/[^A-Za-z0-9_]/g, '') || 'Stub');
      try {
        fs.mkdirSync(path.dirname(stubPath), { recursive: true });
        if (!fs.existsSync(stubPath)) {
          fs.writeFileSync(stubPath,
            `// AUTO-STUB: '${spec}' was imported but no file existed, which would\n`
            + `// fail the whole build. Renders nothing so the rest of the preview\n`
            + `// stays alive. Replace it by writing the real component.\n`
            + `export default function ${compName}() { return null; }\n`);
        }
      } catch {}
    }
  }
}

// THE THEME REACHES THE WHOLE SITE, OR IT REACHES NOTHING.
//
// The constitution has told the build AI to write `tokens.css` before any
// component since the day it was written. Nothing ever loaded it: no import in
// layout.jsx, no reference in globals.css, no mirror here. The model dutifully
// produced a design-token file into a void, which is exactly why themes stayed
// trapped inside whichever components happened to hardcode them while the header,
// the nav and the cart kept the stock green.
//
// So: mirror it to the one path layout.jsx imports. Missing file REWRITES THE
// DEFAULTS rather than unlinking — layout.jsx imports this statically, and a
// static import of a deleted file fails the build outright, taking the preview
// down for every workspace instead of just un-theming one.
function syncTokens(tenantId) {
  const dest = path.join(CUSTOM_DIR, TOKENS);
  const from = tenantId && tenantId !== 'master'
    ? path.join(ROOT, 'tenants', tenantId, TOKENS)
    : path.join(process.cwd(), 'components-custom', TOKENS);

  let next = null;
  try { next = fs.readFileSync(from, 'utf8'); } catch {}
  if (next === null || !next.trim()) next = TOKENS_DEFAULT;

  // Compare before writing: this runs on request paths, and a needless write
  // retriggers HMR in dev and a full rebuild in prod.
  try {
    let cur = null;
    try { cur = fs.readFileSync(dest, 'utf8'); } catch {}
    if (cur !== next) fs.writeFileSync(dest, next);
  } catch {}
}

// The committed defaults, kept in their OWN file rather than read back from the
// destination — the destination is overwritten with each workspace's tokens, so
// reading it would hand the next workspace the previous one's palette.
//
// cwd, NOT __dirname. app/lib/pages.js requires this module, so Next bundles it
// and webpack rewrites __dirname to a placeholder that resolved to "/ROOT" — the
// exact failure that made the skills, the constitution and the API reference
// silently absent from every workspace. CUSTOM_DIR above already uses cwd for the
// same reason; this follows it.
//
// If the file is somehow unreadable we still return a valid stylesheet: every
// token has a fallback at its use site in globals.css, so an empty block renders
// the stock palette rather than an unstyled page.
//
// TWO CWDS, NOT ONE — this is the part that bit. syncCustom() runs with cwd
// tenant-demo (the preview server, and the child process server.js spawns), but
// expectedTokens() is required straight from server.js at the REPO ROOT. A single
// cwd-relative path is therefore wrong half the time: it silently fell back to
// ':root{}', whose hash never matched the real defaults, and the boot reconcile
// then rebuilt the preview on every single start — forever, for nothing. Caught by
// reading the reconcile line on a live deploy, not by the suite.
function tokensDefaultPath() {
  const cwd = process.cwd();
  for (const p of [
    path.join(cwd, 'app', 'lib', 'tokens.default.css'),        // cwd = tenant-demo
    path.join(cwd, 'tenant-demo', 'app', 'lib', 'tokens.default.css'), // cwd = repo root
  ]) {
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

const TOKENS_DEFAULT = (() => {
  try {
    const p = tokensDefaultPath();
    if (p) return fs.readFileSync(p, 'utf8');
  } catch {}
  console.warn('[tokens] defaults unreadable; falling back to an empty :root');
  return ':root{}\n';
})();

// The contract, as data — defined once in ./tokenContract.js and shared with the
// preview bridge and the Studio's theme panel. The test suite asserts the
// constitution demands exactly this set, so the instruction given to the model
// and the interface the site consumes cannot drift apart the way the instruction
// and the (absent) loader did.
const { TOKEN_CONTRACT } = require('./tokenContract.json');

// Parse a flat `:root { --name: value; }` block into a name -> value map.
// Deliberately strict and deliberately small: the constitution requires exactly
// that shape, so anything cleverer would be accepting input the contract forbids.
// Unknown names are dropped — a token outside the contract themes nothing.
function parseTokens(css) {
  const out = {};
  // Comments stripped BEFORE the split — see platform/theme.js for the full
  // account. Splitting on ';' first puts a group comment at the start of the
  // next chunk, and the `^\s*--` anchor drops that token silently.
  const clean = String(css || '').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const block = /:root\s*\{([^}]*)\}/.exec(clean);
  if (!block) return out;
  for (const line of block[1].split(';')) {
    const m = /^\s*--([a-z0-9-]+)\s*:\s*([\s\S]+?)\s*$/i.exec(line);
    if (!m) continue;
    if (!TOKEN_CONTRACT.includes(m[1])) continue;
    out[m[1]] = m[2].trim();
  }
  return out;
}

// Generate app/custom/index.js: a map of name -> component built from STATIC
// imports. Static because the dynamic `import('../custom/' + name)` form makes the
// bundler build a directory context, and under Turbopack dev that shipped a client
// chunk which failed to load — breaking hydration for the WHOLE preview, which
// silently disabled inline text editing and click-to-select too. Compile-time
// imports cannot fail that way.
//
// Written only when the contents actually change, so we don't retrigger HMR (and
// a full re-render) on every request.
// Pure so a test can EXECUTE the generated module (as ESM, against real component
// files in a temp dir) instead of only grepping its text. Grep-only assertions are
// how the broken default-import version passed its tests for days.
function renderIndex(names, ext = '.jsx') {
  const list = [...new Set(names)].filter((n) => n !== 'Placeholder').sort();
  return [
    '// AUTO-GENERATED by app/lib/customSync.js — do not edit by hand.',
    '// Static imports on purpose: a dynamic import context broke hydration.',
    '//',
    '// NAMESPACE imports, not default imports. This was a real bug: the AI wrote',
    '// ReviewMarquee.jsx with `export function ReviewMarquee()` and no default',
    '// export, so `import ReviewMarquee from ...` resolved to undefined. The key was',
    '// present in CUSTOM but its value was not a component, so the section rendered',
    '// "Preparing…" forever while a sibling component with `export default` rendered',
    '// fine — the asymmetry that gave it away. We cannot dictate the export style of',
    '// code a model writes on request, so accept every valid one instead.',
    ...list.map((n) => `import * as m_${n} from './${n}${ext}';`),
    '',
    'function isComp(v) {',
    "  if (typeof v === 'function') return true;              // function or class component",
    "  return !!(v && typeof v === 'object' && v.$$typeof);   // memo() / forwardRef()",
    '}',
    '',
    '// default → export matching the filename → the first component-shaped export.',
    'function pick(mod, name) {',
    '  if (!mod) return null;',
    '  if (isComp(mod.default)) return mod.default;',
    '  if (isComp(mod[name])) return mod[name];',
    '  for (const k of Object.keys(mod)) if (isComp(mod[k])) return mod[k];',
    '  return null;',
    '}',
    '',
    '// Unresolvable entries are DROPPED, not stored as null: Object.keys(CUSTOM) is',
    '// what the UI shows as "Ready now", and it must not promise a broken section.',
    'export const CUSTOM = Object.fromEntries(Object.entries({',
    ...list.map((n) => `  ${n}: pick(m_${n}, '${n}'),`),
    '}).filter(([, v]) => v));',
    '',
  ].join('\n');
}

function writeIndex(names) {
  const body = renderIndex(names);
  try {
    const p = path.join(CUSTOM_DIR, 'index.js');
    let prev = null;
    try { prev = fs.readFileSync(p, 'utf8'); } catch {}
    if (prev !== body) fs.writeFileSync(p, body);
  } catch {}
}

// The names that SHOULD be compiled in, for the startup reconcile in server.js.
// A freshly built image always starts with an empty registry — tenant components
// live on the volume, not in the image — so boot has to compare and rebuild once.
function expectedNames() {
  const src = srcDirFor(activeTenantId());
  try {
    return fs.readdirSync(src).filter((f) => SAFE.test(f) && f !== SEED)
      .map((f) => f.replace(/\.jsx$/, '')).sort();
  } catch { return []; }
}

// A fingerprint of the tokens the ACTIVE workspace should be compiled with, for
// the boot reconcile in server.js. Same problem the component registry has: tokens
// live on the volume, a fresh image ships the defaults, and the watcher only fires
// on change — so without this a redeploy would serve the stock palette until
// someone happened to touch a file.
function expectedTokens() {
  const tenantId = activeTenantId();
  const from = tenantId && tenantId !== 'master'
    ? path.join(ROOT, 'tenants', tenantId, TOKENS)
    : path.join(process.cwd(), 'components-custom', TOKENS);
  let css = null;
  try { css = fs.readFileSync(from, 'utf8'); } catch {}
  if (css === null || !css.trim()) css = TOKENS_DEFAULT;
  return require('crypto').createHash('sha1').update(css).digest('hex').slice(0, 12);
}

module.exports = {
  syncCustom, activeTenantId, CUSTOM_DIR, renderIndex, expectedNames,
  syncTokens, expectedTokens, parseTokens, TOKEN_CONTRACT, TOKENS,
  syncChrome, renderChromeIndex, CHROME_DIR,
};
