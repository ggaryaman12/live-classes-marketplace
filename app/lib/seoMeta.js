// Read the tenant's stored SEO meta for a page and shape it for Next's
// generateMetadata. Fail-open: no meta → sensible empty object (Next uses
// defaults), never breaks the render.
import fs from 'fs';
import path from 'path';

const ROOT = process.env.STUDIO_DATA_ROOT || path.join(process.cwd(), '..');
const FILE = 'seo-meta.json';

function metaFile() {
  const tid = process.env.STUDIO_PREVIEW_TENANT;
  if (tid) return path.join(ROOT, 'tenants', String(tid), FILE);
  try {
    const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'data', 'active.json'), 'utf8'));
    if (a?.tenantId) return path.join(ROOT, 'tenants', String(a.tenantId), FILE);
  } catch {}
  return null;
}

export function pageMetadata(page) {
  try {
    const f = metaFile();
    if (!f) return {};
    const all = JSON.parse(fs.readFileSync(f, 'utf8'));
    const m = all[page];
    if (!m) return {};
    const meta = {};
    if (m.title) meta.title = m.title;
    if (m.description) meta.description = m.description;
    if (m.ogImage || m.title || m.description) {
      meta.openGraph = {
        ...(m.title ? { title: m.title } : {}),
        ...(m.description ? { description: m.description } : {}),
        ...(m.ogImage ? { images: [m.ogImage] } : {}),
      };
    }
    if (m.noIndex) meta.robots = { index: false, follow: false };
    return meta;
  } catch { return {}; }
}
