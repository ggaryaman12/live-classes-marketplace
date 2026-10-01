// ANY PAGE THE AI IS ASKED TO CREATE.
//
// The storefront ships four hand-written routes — landing, browse, store,
// checkout — because each fetches real commerce data and its route file lives
// in the image. That made "add a booking page" impossible without a deploy,
// which was the wrong answer to a reasonable request: a booking site wants
// /book, a bakery wants /our-story, a dealer wants /finance.
//
// This is the catch-all. A page tree named <slug> is live at /p/<slug> the
// moment it is written — no deploy, no route file, no engineering. New PAGES
// are now as cheap as new sections already were.
//
// It renders through the same registry and the same tree resolver as every
// other page, so a custom page is fork-able, versioned, drag-and-droppable and
// AI-editable exactly like the built-in four. It is not a lesser kind of page.
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { getAppConfig, getStorefronts } from '../../lib/api';
import { resolvePageTreeAB, modeFrom } from '../../lib/pages';
import { pageMetadata } from '../../lib/seoMeta';
import TreeRenderer from '../../lib/TreeRenderer';
import { validSlug } from '../../lib/slug';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug: raw } = await params;
  const slug = validSlug(raw);
  return slug ? pageMetadata(slug) : {};
}

export default async function CustomPage({ params, searchParams }) {
  const { slug: raw } = await params;
  // The slug reaches the filesystem, so it is validated here as well as at the
  // write path. Two gates on the same value is deliberate: this one is reached
  // by anyone who can type a URL.
  const slug = validSlug(raw);
  if (!slug) notFound();

  const mode = await modeFrom(searchParams);
  let visitorId = 'anon';
  try { const jar = await cookies(); visitorId = jar.get('yelo_v')?.value || 'anon'; } catch {}
  const { doc, source } = resolvePageTreeAB(slug, mode, visitorId);
  if (!doc) notFound();

  // Custom pages get the same live bindings as the built-ins, so a bound
  // StoreGrid on a bespoke page shows real merchants rather than placeholders.
  // Fetched defensively: a page that needs no data must not fail because the
  // backend was slow.
  let data = {};
  try {
    const cfg = await getAppConfig();
    data = { storefronts: await getStorefronts(cfg.latitude, cfg.longitude) };
  } catch { data = { storefronts: [] }; }

  return (
    <>
      <TreeRenderer doc={doc} data={data} />
      <div className="tree-badge" title={`Rendered from component-JSON · ${source}`}>
        ◆ rendered from component-JSON ({source})
      </div>
    </>
  );
}
