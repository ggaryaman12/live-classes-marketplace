// Resolve a ComponentInstance from the tenant's component library.
// Reads components-lib.json from the workspace, merges per-instance overrides.
// Fail-safe: returns null on any error, never breaks a render.
import fs from 'fs';
import path from 'path';

const ROOT = process.env.STUDIO_DATA_ROOT || path.join(process.cwd(), '..');
const LIB_FILE = 'components-lib.json';

function libPath() {
  const tid = process.env.STUDIO_PREVIEW_TENANT;
  if (tid) return path.join(ROOT, 'tenants', String(tid), LIB_FILE);
  try {
    const a = JSON.parse(fs.readFileSync(path.join(ROOT, 'platform', 'data', 'active.json'), 'utf8'));
    if (a?.tenantId) return path.join(ROOT, 'tenants', String(a.tenantId), LIB_FILE);
  } catch {}
  return path.join(ROOT, 'pages-repo', LIB_FILE);
}

export function resolveComponent(componentId, overrides = {}) {
  try {
    const lib = JSON.parse(fs.readFileSync(libPath(), 'utf8'));
    const c = lib?.components?.[componentId];
    if (!c || !c.tree) return null;
    if (!overrides || !Object.keys(overrides).length) return c.tree;
    const tree = JSON.parse(JSON.stringify(c.tree));
    if (tree.nodes) {
      for (const [id, node] of Object.entries(tree.nodes)) {
        if (overrides[id] && node.props) tree.nodes[id] = { ...node, props: { ...node.props, ...overrides[id] } };
      }
    }
    return tree;
  } catch { return null; }
}
