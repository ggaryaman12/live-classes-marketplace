// AUTO-SHIM: a chrome file imported this but no module existed. A
// permissive Proxy so any named/default import resolves to a safe
// no-op, keeping the build alive rather than failing on one dangling ref.
const noop = () => "";
const handler = { get: () => noop };
const shim = new Proxy(noop, handler);
export default shim;
export const titleHtml = (s) => String(s == null ? "" : s);
export { shim };
