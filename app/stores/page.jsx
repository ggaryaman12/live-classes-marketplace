// Merchant listing — RENDERED FROM component-JSON, same bridge as the landing.
// The tree is resolved through the fork model (this tenant's branch), so
// editing it in the Studio, or master pushing a change, changes this real page.
// The sticky Header comes from app/layout.jsx.
import { getAppConfig, getStorefronts } from '../lib/api';
import { resolvePageTree, modeFrom } from '../lib/pages';
import TreeRenderer from '../lib/TreeRenderer';

export const dynamic = 'force-dynamic';

export default async function StoresPage({ searchParams }) {
  const mode = await modeFrom(searchParams);
  const cfg = await getAppConfig();
  const stores = await getStorefronts(cfg.latitude, cfg.longitude);

  const { doc, source } = resolvePageTree('merchant-listing', mode);

  // Bindings → live data. This tree binds to the marketplace storefronts
  // endpoint, so expose the data under that source name as well as the short
  // one, and let either spelling resolve.
  const data = {
    storefronts: stores,
    'marketplace/marketplace_get_city_storefronts_v3': stores,
  };

  if (!doc) {
    return <div className="stores2"><p className="stores2-empty">Merchant listing tree not found.</p></div>;
  }

  return (
    <>
      <TreeRenderer doc={doc} data={data} />
      <div className="tree-badge" title={`Rendered from component-JSON · ${source}`}>
        ◆ rendered from component-JSON ({source})
      </div>
      <footer className="foot">Built with Yelo Studio · this page is edited live by AI</footer>
    </>
  );
}
