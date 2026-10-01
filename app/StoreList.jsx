'use client';
// Live store listing — calls /api/stores (our server proxy) which forwards the
// tenant envelope + the logged-in customer's vendor token to yelo-server's
// marketplace_get_city_storefronts_v3. This tenant requires customer login, so
// we only fetch once a session exists, and re-fetch on the `yelo-auth` event.
import { useCallback, useEffect, useState } from 'react';
import { apiPath } from './lib/apiPath';

function readSession() {
  try {
    return JSON.parse(localStorage.getItem('yelo_customer') || 'null');
  } catch {
    return null;
  }
}

// Best-effort geolocation — the backend needs lat/long; falls back to 0,0.
function getCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ latitude: 0, longitude: 0 });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve({ latitude: 0, longitude: 0 }),
      { timeout: 4000 }
    );
  });
}

export default function StoreList() {
  const [session, setSession] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [stores, setStores] = useState([]);
  const [error, setError] = useState(null);

  // Track the customer session; refresh on login/logout.
  useEffect(() => {
    const sync = () => setSession(readSession());
    sync();
    window.addEventListener('yelo-auth', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('yelo-auth', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    const coords = await getCoords();
    try {
      const res = await fetch(apiPath('/api/stores'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...coords,
          // This tenant allows guest browsing; token is sent only when signed in.
          ...(session?.access_token
            ? { access_token: session.access_token, vendor_id: session.vendor_id }
            : {}),
          limit: 12,
        }),
      });
      const body = await res.json();
      // yelo-server always returns HTTP 200 — real status is body.status.
      if (body.status !== 200) {
        setState('error');
        setError(body.message || 'Could not load stores');
        return;
      }
      const list = Array.isArray(body.data) ? body.data : body.data?.merchant_list || [];
      setStores(list);
      setState('ready');
    } catch {
      setState('error');
      setError('Network error');
    }
  }, [session]);

  // Guest browsing is allowed on this tenant — load on mount and re-load
  // whenever the session changes (sign in personalises the listing).
  useEffect(() => {
    load();
  }, [load]);

  // Pointer-tracked 3D tilt — write rotation into CSS vars on the card.
  const tilt = (e) => {
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--ry', `${px * 14}deg`);
    el.style.setProperty('--rx', `${-py * 14}deg`);
    el.style.setProperty('--mx', `${(px + 0.5) * 100}%`);
    el.style.setProperty('--my', `${(py + 0.5) * 100}%`);
  };
  const untilt = (e) => {
    const el = e.currentTarget;
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--rx', '0deg');
  };

  return (
    <section className="stores">
      <div className="stores-head">
        <h2>Stores near you</h2>
        {state === 'ready' && (
          <button className="stores-refresh" onClick={load}>
            Refresh
          </button>
        )}
      </div>

      {state === 'loading' && <p className="stores-note">Loading stores…</p>}
      {state === 'error' && <p className="stores-note err">{error}</p>}
      {state === 'ready' && stores.length === 0 && (
        <p className="stores-note">No stores found nearby.</p>
      )}

      {state === 'ready' && stores.length > 0 && (
        <div className="store-grid">
          {stores.map((s, i) => {
            const name = s.store_name || s.name || s.display_store_name || 'Store';
            const desc = s.description || s.company_address || '';
            const logo = s.logo || s.image;
            // Demo-only sponsorship: mark a couple of stores as sponsored so the
            // UI shows the promoted treatment. Not backed by real ad data.
            const sponsored = i === 0 || i === 3;
            // Demo rating — backend field if present, else a stable pseudo value.
            const rating = s.rating || (4.2 + ((i * 7) % 8) / 10).toFixed(1);
            return (
              <article
                className={`store-card${sponsored ? ' sponsored' : ''}`}
                key={s.user_id ?? s.merchant_id ?? i}
                onMouseMove={tilt}
                onMouseLeave={untilt}
                style={{ '--i': i }}
              >
                <div className="store-card-inner">
                  {sponsored && <span className="sponsor-tag">★ Sponsored</span>}
                  <div className="store-shine" aria-hidden="true" />
                  <div className="store-logo">
                    {logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={logo} alt={name} />
                    ) : (
                      <span>{name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div className="store-body">
                    <h3>{name}</h3>
                    {desc && <p>{desc}</p>}
                    <div className="store-meta">
                      <span className="store-rating">★ {rating}</span>
                      <span className="store-open">Open now</span>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
