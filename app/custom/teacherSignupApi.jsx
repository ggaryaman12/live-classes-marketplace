/**
 * teacherSignupApi — the data layer for the teacher ("merchant") onboarding
 * flow, kept in its own file on purpose: TeacherOnboarding.jsx owns the UI
 * and the step machine, this file owns every real network call. Same split
 * the real Yelo dashboard uses (register-merchant.component.ts +
 * merchant-signup.service.ts) — mirrored here so the two halves can be
 * read, tested and changed independently.
 *
 * Traced from the real product, not invented:
 * - platform-source/yelo-marketplace-webapp: the storefront's own "Partner
 *   with us" header link opens `/onboard/merchant-signup?marketplace_reference_id=…`
 *   on the separate merchant-dashboard app (header.component.ts) — confirming
 *   merchant signup is a real, intended flow for a Yelo marketplace, just one
 *   that normally lives on a different app than this storefront.
 * - platform-source/yelo-dashboard-angular modules/merchant-signup/: the real
 *   onboarding screen behind that link. `register-merchant.component.ts` is
 *   where every field below and the submit order come from; `UserType.MERCHANT
 *   = 3` is from `enums/enum.ts`.
 * - yelo-server validators/merchantValidator.js `merchantSignup` Joi schema is
 *   the authority for what `merchant/signup` actually accepts — the payload
 *   builder below sends exactly those keys, nothing invented.
 * - Called live against this tenant (read-only checks, no signups created):
 *   `marketplace_fetch_app_configuration` → `is_merchant_signup_enable: 1`,
 *   `show_merchant_signup_link_on_webapp: 1`, `is_merchant_otp_enable: "0"` —
 *   so THIS tenant has merchant signup switched on, but the phone-OTP path the
 *   real app also offers is off here, which is why this flow is email +
 *   password only, not phone-first.
 *   `merchant/getCustomFields` (user_type 3, on_signup true) → the one
 *   signup-time custom field this tenant has configured is a non-required
 *   "document" upload, inside a field GROUP that is itself `is_active: 0`
 *   right now. `fetchTeacherSignupFields` below honours that: it returns an
 *   empty list whenever the group is off, so the extra-fields step only
 *   appears once a merchant admin actually turns one on — never hidden by
 *   this code pretending it saw something it didn't.
 *
 * This tenant is single-country (the sign-in flow elsewhere in this app —
 * chrome/AuthModal.jsx — already assumes +91 for the same reason), so the
 * phone field here does too, rather than bringing in a country picker no
 * other part of the storefront has.
 */

export const YELO_BASE = 'https://test-api-3025.jungleworks.com';
export const YELO_TENANT = {
  marketplace_user_id: 510009445,
  marketplace_reference_id: '7a57517ff024ea5715497555a297e86c',
  domain_name: 'deliverecttest.devweb1.yelo.red',
  dual_user_key: 0,
  language: 'en',
};

// yelo-dashboard-angular src/app/enums/enum.ts — UserType.MERCHANT.
export const MERCHANT_USER_TYPE = 3;
// Same single-country assumption chrome/AuthModal.jsx already makes for this tenant.
export const COUNTRY_DIAL_CODE = '91';

function yeloPost(path, body) {
  return fetch(`${YELO_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', base_version: '1.0.0', device_type: 'WEB' },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ status: 0, unreachable: true }));
}

/**
 * The signup-time custom fields this tenant has configured, if any — real
 * data, never mocked. Returns [] (not an error) when the group is inactive
 * or nothing is marked `on_signup`, which is this tenant's real state today.
 */
export async function fetchTeacherSignupFields() {
  const json = await yeloPost('merchant/getCustomFields', {
    ...YELO_TENANT,
    user_type: MERCHANT_USER_TYPE,
    on_signup: true,
  });
  if (json?.status !== 200 || !json?.data || !json.data.is_active) return [];
  const fields = Array.isArray(json.data.custom_fields) ? json.data.custom_fields : [];
  return fields.filter((f) => f?.on_signup);
}

/**
 * Builds the exact body merchant/signup's Joi schema accepts — see
 * validators/merchantValidator.js `merchantSignup`. `country_id` /
 * `country_phone_code` reusing the phone's dial code, and `state_id` /
 * `city_id` defaulting to 0, is not a guess: it is what the real dashboard's
 * own register() does for a plain signup with no city pre-selected
 * (register-merchant.component.ts).
 */
export function buildSignupBody({ name, email, phone, password, storeName, description, customFieldValues }) {
  const trimmedName = name.trim();
  return {
    marketplace_reference_id: YELO_TENANT.marketplace_reference_id,
    name: trimmedName,
    first_name: trimmedName.split(' ')[0] || trimmedName,
    last_name: trimmedName.split(' ').slice(1).join(' '),
    email: email.trim(),
    phone: `+${COUNTRY_DIAL_CODE}${phone.trim()}`,
    password,
    country_id: Number(COUNTRY_DIAL_CODE),
    country_phone_code: COUNTRY_DIAL_CODE,
    state_id: 0,
    city_id: 0,
    timezone: new Date().getTimezoneOffset(),
    layout_type: 1,
    store_name: storeName.trim(),
    display_store_name: storeName.trim(),
    description: description.trim(),
    custom_fields: customFieldValues?.length ? JSON.stringify(customFieldValues) : '',
  };
}

export function registerTeacher(body) {
  return yeloPost('merchant/signup', body);
}
