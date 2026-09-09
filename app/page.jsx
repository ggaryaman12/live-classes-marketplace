// Landing — now RENDERED FROM component-JSON (the bridge). The page tree is
// resolved via the overlay model (tenant's fork if any, else master) and driven
// through the registry renderer. Forking this page in the Studio, or master
// pushing a change, now changes THIS real page — one substrate, three modalities.
import { cookies } from 'next/headers';
import { getAppConfig, getStorefronts } from './lib/api';
import { resolvePageTreeAB, modeFrom } from './lib/pages';
import { pageMetadata } from './lib/seoMeta';
import TreeRenderer from './lib/TreeRenderer';

export const dynamic = 'force-dynamic';

// SEO: pull the page's stored meta into the document head.
export async function generateMetadata() {
  return pageMetadata('landing');
}

export default async function Landing({ searchParams }) {
  const mode = await modeFrom(searchParams);
  const cfg = await getAppConfig();
  const stores = await getStorefronts(cfg.latitude, cfg.longitude);

  // A/B: a stable per-visitor id (cookie) decides A vs B for any running test.
  let visitorId = 'anon';
  try {
    const jar = await cookies();
    visitorId = jar.get('yelo_v')?.value || 'anon';
  } catch {}
  const { doc, source } = resolvePageTreeAB('landing', mode, visitorId);
  // Resolve bindings → live data injected into bound nodes.
  const data = { storefronts: stores };

  if (!doc) {
    // Safety fallback if no tree is present.
    return <div className="stores2"><p className="stores2-empty">Landing tree not found.</p></div>;
  }

  return (
    <>
      <TreeRenderer doc={doc} data={data} />
      <div className="tree-badge" title={`Rendered from component-JSON · ${source}`}>◆ rendered from component-JSON ({source})</div>
    </>
  );
}
