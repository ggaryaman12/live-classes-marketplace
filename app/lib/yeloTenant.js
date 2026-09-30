// The ONE place the YELO backend URL and this storefront's tenant envelope are
// declared. Client-safe (no fs, no server-only imports), so 'use client'
// components import it directly and the server API layer (yeloConfig.js) takes
// its defaults from here too.
//
// Override per deployment with YELO_BASE / YELO_MKT / YELO_REF / YELO_DOMAIN at
// BUILD time — next.config.js exposes them to the browser bundle. Unset, these
// are the verified values for this tenant (marketplace_fetch_app_configuration,
// status 200).
export const YELO_BASE =
  process.env.NEXT_PUBLIC_YELO_BASE || 'https://test-api-3025.jungleworks.com';

export const YELO_TENANT = Object.freeze({
  marketplace_user_id: Number(process.env.NEXT_PUBLIC_YELO_MKT) || 510009445,
  marketplace_reference_id:
    process.env.NEXT_PUBLIC_YELO_REF || '7a57517ff024ea5715497555a297e86c',
  domain_name: process.env.NEXT_PUBLIC_YELO_DOMAIN || 'deliverecttest.devweb1.yelo.red',
  dual_user_key: 0,
  language: 'en',
});
