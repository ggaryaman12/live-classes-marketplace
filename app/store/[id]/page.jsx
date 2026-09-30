// Store detail — RENDERED FROM component-JSON, same bridge as every other page.
// Resolves the `store` tree (StoreHeader + Catalogue) and injects this store's
// live data into the bound nodes. Editing the store tree in the Studio restyles
// every store's detail page at once. The marketplace rules — closed store,
// unavailable products, single-merchant cart, add-to-cart — live inside the
// Catalogue component and are unchanged by tree-driving the page.
import Link from 'next/link';
import { getAppConfig, getStore, getCatalogue, flattenCategories } from '../../lib/api';
import { resolvePageTree, modeFrom } from '../../lib/pages';
import TreeRenderer from '../../lib/TreeRenderer';

export const dynamic = 'force-dynamic';

export default async function StorePage({ params, searchParams }) {
  const { id } = await params;
  const cfg = await getAppConfig();
  const [store, catalogue] = await Promise.all([
    getStore(id, cfg.latitude, cfg.longitude),
    getCatalogue(id, cfg.latitude, cfg.longitude),
  ]);

  if (!store) {
    return <div className="store-missing">Store not found. <Link href="/">← Back</Link></div>;
  }

  const isDemo = catalogue.some((c) => c.demo);
  const sections = flattenCategories(catalogue);

  const { doc, source } = resolvePageTree('store', await modeFrom(searchParams));
  // Bound data: StoreHeader ← store, Catalogue ← { store, sections }.
  const data = { store, catalogue: { store, sections } };

  return (
    <div className="store">
      {doc ? <TreeRenderer doc={doc} data={data} /> : (
        <div className="store-missing">Store layout unavailable.</div>
      )}
      {isDemo && (
        <div className="store-demo-note">
          Demo menu — this store has no catalogue on the backend yet. The order flow is fully wired; add real products and it goes live.
        </div>
      )}
      <div className="tree-badge" title={`Rendered from component-JSON · ${source}`}>
        ◆ rendered from component-JSON ({source})
      </div>
    </div>
  );
}
