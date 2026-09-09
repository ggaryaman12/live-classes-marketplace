// SAYS SO WHEN THE BACKEND IS DOWN, INSTEAD OF LOOKING DELETED.
//
// This exists because of a real incident. `test-api-3025` stopped answering —
// TLS completed, HTTP never returned — and because `fetch` has no default
// timeout, the server render never resolved. Next served `loading.jsx` forever,
// so the storefront sat on grey skeleton blocks with no error, no message and
// no end. The owner's reasonable reading was that their website was gone.
//
// The timeout in `yeloConfig.js` fixes the hang. This fixes the *silence*: an
// outage now looks like an outage. It is deliberately worded to protect the
// tenant's trust in their own site — their content is fine, someone else's
// server is not.
//
// Costs nothing. `getAppConfig` is wrapped in React's `cache()`, so this awaits
// the exact same promise the page already awaited — one request, two readers.
import { getAppConfig } from './lib/api';

export default async function BackendNotice() {
  const cfg = await getAppConfig();
  if (!cfg.unreachable) return null;

  return (
    <div className="bn" role="status">
      <span className="bn-dot" aria-hidden="true" />
      <span>
        <strong>Can’t reach the store data right now.</strong> Your site and its
        content are safe — the marketplace server isn’t responding. Products and
        stores will reappear on their own once it’s back.
      </span>
    </div>
  );
}
