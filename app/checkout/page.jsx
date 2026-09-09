// Checkout — RENDERED FROM component-JSON, same bridge as landing and stores.
// The tree resolves to a CheckoutPanel node (the clubbed one-page checkout +
// payment); editing that tree in the Studio restyles this real page. The
// interactive wiring and the marketplace rules live inside CheckoutPanel.
import { resolvePageTree, modeFrom } from '../lib/pages';
import TreeRenderer from '../lib/TreeRenderer';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ searchParams }) {
  const mode = await modeFrom(searchParams);
  const { doc, source } = resolvePageTree('checkout', mode);

  if (!doc) {
    return <div className="ck-empty"><h1>Checkout unavailable</h1></div>;
  }

  return (
    <>
      <TreeRenderer doc={doc} data={{}} />
      <div className="tree-badge" title={`Rendered from component-JSON · ${source}`}>
        ◆ rendered from component-JSON ({source})
      </div>
    </>
  );
}
