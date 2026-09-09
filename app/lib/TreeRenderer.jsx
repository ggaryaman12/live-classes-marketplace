// The renderer: turns a component-JSON page tree into the real React UI by
// looking each node's `type` up in the registry. This is the bridge — the same
// tree that fork/rebase/drag-drop/AI operate on is what actually renders.
//
// `data` is a map of { bindingSource: resolvedData }, filled server-side before
// render (e.g. { storefronts: [...] }), so bound nodes get live API data.
//
// Each rendered node is wrapped in a marker carrying its node id, so the Studio
// can map a click in the live preview back to a tree node and select it. The
// wrapper uses `display:contents`, so it adds a hook without changing layout.
import { REGISTRY } from './registry';
import { resolveComponent } from './componentResolve';

function renderNode(doc, id, data) {
  const node = doc.nodes?.[id];
  if (!node) return null;

  // COMPONENT INSTANCE — a node that points at a reusable component in the
  // library. Resolve the master tree (with this instance's overrides) and render
  // it inline, so editing the master updates every instance. Fail-open: an
  // unresolvable instance renders nothing rather than breaking the page.
  if (node.type === 'ComponentInstance') {
    const cid = node.props?.componentId;
    const sub = cid ? resolveComponent(cid, node.props?.overrides || {}) : null;
    if (!sub || !sub.root) return <div key={id} data-node-id={id} data-node-type="ComponentInstance" style={{ display: 'contents' }} />;
    return (
      <div key={id} data-node-id={id} data-node-type="ComponentInstance" style={{ display: 'contents' }}>
        {renderNode(sub, sub.root, data)}
      </div>
    );
  }

  const def = REGISTRY[node.type];
  if (!def) return <div key={id} data-unknown={node.type} />;

  const children = (node.children || []).map((cid) => renderNode(doc, cid, data));
  const bound = node.bind ? data?.[node.bind.source] : undefined;

  // UNIVERSAL CONTROLS, HANDLED HERE RATHER THAN IN EVERY COMPONENT.
  //
  // Hiding a section, changing the space around it, or narrowing it are the
  // things people want most often and could not do at all: the only way to hide
  // a section was to DELETE it, and spacing meant asking the AI — a model call
  // for a value that belongs in a number field.
  //
  // Doing it in the one wrapper every node already passes through means it works
  // for the built-in sections AND for whatever the AI writes next, with no
  // component needing to know these props exist.
  const p = node.props || {};

  // `hidden` keeps the node in the tree, so it stays selectable in the layer
  // list and one click brings it back. Deleting to hide loses the content.
  if (p.hidden === true) return null;

  // Only build a style object when something actually asks for it — an empty
  // wrapper must stay `display:contents` so existing layouts are untouched.
  const hasBox = p.spaceTop != null || p.spaceBottom != null || p.maxWidth != null;
  const box = hasBox ? {
    ...(p.spaceTop != null ? { paddingTop: `${Number(p.spaceTop)}px` } : null),
    ...(p.spaceBottom != null ? { paddingBottom: `${Number(p.spaceBottom)}px` } : null),
    ...(p.maxWidth != null ? { maxWidth: `${Number(p.maxWidth)}px`, marginLeft: 'auto', marginRight: 'auto' } : null),
  } : { display: 'contents' };

  return (
    <div key={id} data-node-id={id} data-node-type={node.type} style={box}>
      <RenderedNode def={def} props={node.props || {}} data={bound}>
        {children}
      </RenderedNode>
    </div>
  );
}

function RenderedNode({ def, props, data, children }) {
  return def.render(props, children, data);
}

export default function TreeRenderer({ doc, data }) {
  if (!doc || !doc.root) return null;
  return renderNode(doc, doc.root, data || {});
}
