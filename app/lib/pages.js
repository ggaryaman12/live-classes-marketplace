// Page-tree resolver for the storefront.
//
// One repo, a branch per tenant, a worktree per tenant: every page always
// exists in the active tenant's worktree, so this is normally a single read.
// Whether that page is the tenant's own work or still byte-identical to master
// is a git question — the storefront doesn't care, it renders whatever tree is
// on their branch. Master is kept as a fallback for the un-tenanted preview.
import fs from 'fs';
import path from 'path';

// tenant-demo runs with cwd=<root>/tenant-demo; the repo + trees are one up.
// In production STUDIO_DATA_ROOT points at the mounted volume instead, so the
// storefront reads the same persisted trees the Studio writes.
const ROOT = process.env.STUDIO_DATA_ROOT || path.join(process.cwd(), '..');   // volume in prod
const MASTER_PAGES = path.join(ROOT, 'pages-repo', 'pages');

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
    return a?.tenantId || null;
  } catch { return null; }
}

// Read the render mode off the URL. `?v=published` serves the frozen snapshot;
// anything else is the live draft. searchParams is async in Next 16, hence await.
export async function modeFrom(searchParams) {
  try { const sp = await searchParams; return sp?.v === 'published' ? 'published' : 'draft'; }
  catch { return 'draft'; }
}

// Resolve a page tree: the active tenant's worktree, else master.
// Returns { doc, source }.
//
// mode 'published' serves the FROZEN snapshot (published/<page>.tree.json) instead
// of the live-editing draft, falling back to the draft if the tenant has never
// published so a brand-new store still renders something. This is what makes a
// standalone "live" URL show a stable version while the Studio keeps editing the
// draft. mode 'draft' (the default, used by the embedded Studio preview) always
// reads the working tree so edits appear the instant they are saved.
// A/B: if a running experiment assigns this visitor to variant B, serve the B
// page tree (page__B) instead of A. Best-effort and fail-open: any error just
// serves A, never breaks the storefront. `visitorId` is a stable per-visitor id
// (a cookie), passed by the page route.
export function resolvePageTreeAB(page, mode, visitorId) {
  try {
    const tid = activeTenantId();
    if (!tid || tid === 'master') return resolvePageTree(page, mode);
    const expFile = path.join(ROOT, 'tenants', String(tid), 'experiments', `${String(page).replace(/[^a-z0-9_-]/gi, '')}.json`);
    let exp = null;
    try { exp = JSON.parse(fs.readFileSync(expFile, 'utf8')); } catch { return resolvePageTree(page, mode); }
    if (!exp || exp.status !== 'running') return resolvePageTree(page, mode);
    // Deterministic assignment — same math as platform/abTest.js.
    const crypto = require('crypto');
    const h = crypto.createHash('sha256').update(String(visitorId || 'anon')).digest();
    const bucket = h[0] / 256 * 100;
    const split = Math.max(1, Math.min(99, Number(exp.split) || 50));
    const variant = bucket < split ? 'B' : 'A';
    // Count an impression for the served variant (best-effort, never blocks).
    try { trackImpression(tid, page, variant, exp); } catch {}
    if (variant === 'B') {
      const b = resolvePageTree(`${page}__B`, mode);
      if (b.doc) return { ...b, variant: 'B' };
    }
    return { ...resolvePageTree(page, mode), variant: 'A' };
  } catch {
    return resolvePageTree(page, mode);
  }
}

// Increment the impression counter for a served variant, writing back to the
// experiment file. Debounced-ish by being cheap and best-effort; a lost write
// is acceptable (the numbers are directional, not billing).
function trackImpression(tid, page, variant, exp) {
  try {
    if (!exp.counts) exp.counts = { A: { impressions: 0, conversions: 0 }, B: { impressions: 0, conversions: 0 } };
    exp.counts[variant].impressions += 1;
    const f = path.join(ROOT, 'tenants', String(tid), 'experiments', `${String(page).replace(/[^a-z0-9_-]/gi, '')}.json`);
    fs.writeFileSync(f, JSON.stringify(exp, null, 2));
  } catch {}
}

export function resolvePageTree(page, mode = 'draft') {
  const tid = activeTenantId();
  // Mirror the active tenant's own component files into the app dir so a `Custom`
  // node can resolve real tenant-written code (3D, scroll animation, anything).
  // Done here so EVERY page gets it, and cheap enough to run per render.
  try { require('./customSync').syncCustom(); } catch {}
  const candidates = [];
  if (tid && tid !== 'master') {
    const base = path.join(ROOT, 'tenants', String(tid));
    if (mode === 'published') {
      candidates.push({ src: 'published', file: path.join(base, 'published', `${page}.tree.json`) });
    }
    candidates.push({ src: 'overlay', file: path.join(base, 'pages', `${page}.tree.json`) });
  }
  candidates.push({ src: 'master', file: path.join(MASTER_PAGES, `${page}.tree.json`) });
  for (const c of candidates) {
    try {
      const doc = JSON.parse(fs.readFileSync(c.file, 'utf8'));
      return { doc, source: c.src };
    } catch {}
  }
  return { doc: null, source: null };
}
