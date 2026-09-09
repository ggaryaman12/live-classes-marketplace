// Pure auth wire-shaping — NO IMPORTS, same reason as order.js and bill.js.
//
// WHY THIS EXISTS. The auth proxy spread one envelope over every endpoint:
//
//   { ...tenantEnvelope(), app_type:'WEB', device_token:null, ...fields }
//
// That is fine for the `marketplace_*` endpoints, which read what they want off
// req.body and ignore the rest. It is fatal for the `customer/*` endpoints,
// which validate with Joi and REJECT unknown keys — `validateFields` calls
// `Joi.validate(req, schema)` with no options
// (yelo-server/validators/joiValidator.js:26), and Joi defaults allowUnknown to
// false.
//
// So `customer/verifyOtp` was being sent five things it refuses:
//
//   phone_no             not in the schema  → "phone_no is not allowed"
//   country_code         not in the schema  → no such field exists anywhere
//   name                 not in the schema
//   device_token: null   Joi.string() rejects null
//   marketplace_user_id  schema says Joi.string(); the envelope sends a NUMBER
//
// OTP login could not have worked. The API reference described the same wrong
// fields, which is how both were written and neither was checked.
//
// Schema: yelo-server/modules/customer/validators/customerValidator.js:92-121
// Real client, for comparison:
//   yelo-marketplace-webapp/src/app/themes-custom/modules/login/login.component.ts:187-195

// Exactly the keys `customer/verifyOtp` accepts (customerValidator.js:98-113).
// Anything not on this list fails the whole request, so the list IS the filter.
const VERIFY_OTP_ALLOWED = [
  'otp', 'email', 'marketplace_reference_id', 'phone', 'language', 'app_type',
  'app_version', 'is_demo_app', 'login_vendor_via_otp', 'domain_name',
  'dual_user_key', 'marketplace_user_id', 'device_token', 'access_token',
  'reference_id',
];

// `customer/send_login_otp` builds a schema and never enforces it — the
// validator calls next() unconditionally (customerValidator.js:204). We shape
// the payload to the schema anyway: relying on a bug staying present is not a
// contract, and if it is ever fixed this keeps working.
const SEND_OTP_ALLOWED = [
  'email', 'marketplace_reference_id', 'phone', 'language', 'app_type',
  'app_version', 'is_demo_app', 'otp_id', 'make_otp_invalid', 'is_login',
];

// Drop undefined/null as well as unlisted keys: `device_token: null` is a real
// rejection cause, not a harmless absent value.
function pick(source, allowed) {
  const out = {};
  for (const k of allowed) {
    const v = source[k];
    if (v !== undefined && v !== null && v !== '') out[k] = v;
  }
  return out;
}

// The customer/* endpoints type marketplace_user_id as a STRING. The envelope
// carries it as a number, and every other endpoint wants it that way — this is
// the one place it must be converted. The live storefront calls .toString() at
// login.component.ts:190 for exactly this reason.
function asString(v) {
  return v === undefined || v === null ? undefined : String(v);
}

// action + caller fields + envelope -> the body to actually POST.
// Returns { path, body } so the route stays a transport and this stays pure.
export function buildAuthBody(action, fields = {}, envelope = {}) {
  const base = { ...envelope, ...fields };

  switch (action) {
    case 'verify-otp': {
      const body = pick(
        { ...base, marketplace_user_id: asString(base.marketplace_user_id) },
        VERIFY_OTP_ALLOWED,
      );
      // One of email/phone is required — `.or('email','phone')` at
      // customerValidator.js:114 — and the caller may pass either.
      // login_vendor_via_otp: 1 is what the real storefront sends to mark this
      // as an OTP login rather than a verification of something else.
      if (body.login_vendor_via_otp === undefined) body.login_vendor_via_otp = 1;
      return { path: 'customer/verifyOtp', body };
    }

    case 'send-otp': {
      const body = pick(
        { ...base, marketplace_user_id: asString(base.marketplace_user_id) },
        SEND_OTP_ALLOWED,
      );
      return { path: 'customer/send_login_otp', body };
    }

    // The marketplace_* endpoints read named fields off req.body and ignore
    // the rest, so the permissive spread is correct for them — and they need
    // envelope keys (dual_user_key, domain_name) the customer/* schemas reject.
    case 'login':
      return { path: 'marketplace_vendor_login', body: base };
    case 'signup':
      return { path: 'marketplace_vendor_signup', body: base };

    default:
      return null;
  }
}

// `phone_no` on marketplace_vendor_login is parsed by extractPhoneNumber
// (yelo-server/routes/marketplace.js:5708), which does
// `number.split(" ")[1].split("")`. With no space, split(" ")[1] is undefined
// and it THROWS — a 500, not a validation error. So the space is mandatory.
export function phoneNo(countryCode, number) {
  const cc = String(countryCode || '').replace(/^\+/, '').trim();
  const n = String(number || '').trim();
  if (!cc || !n) return '';
  return `+${cc} ${n}`;
}

export const ACTIONS = ['login', 'signup', 'send-otp', 'verify-otp'];

// LOGIN RESPONSE -> STORED SESSION.
//
// The customer id lives at `data.vendor_details.vendor_id`, NOT at
// `data.vendor_id`. Our modal read the top level, so `vendorId` was undefined
// and every authenticated call afterwards sent `vendor_id: undefined` — the
// backend then treats the caller as a guest, silently, on a signed-in session.
//
// The real storefront reads vendor_details throughout, e.g.
// yelo-marketplace-webapp/src/app/components/login/login.component.ts:386
// and :795 (`response.data.vendor_details.is_phone_verified`).
//
// Both shapes are accepted with vendor_details winning, because the OTP and
// password paths do not return identical envelopes and a session that silently
// downgrades to guest is the worst failure mode available here.
export function sessionFromLogin(data, fallback = {}) {
  const d = data || {};
  const v = d.vendor_details || {};
  const num = (x) => (x === undefined || x === null || x === '' ? undefined : Number(x));

  return {
    vendorId: num(v.vendor_id) ?? num(d.vendor_id) ?? null,
    // `app_access_token` is the same value as `access_token` on the login
    // response; take either so an endpoint that returns only one still works.
    token: d.access_token || d.app_access_token || v.app_access_token || null,
    name: v.first_name || d.name || fallback.name || 'there',
    email: v.email || d.email || fallback.email || '',
    phone: v.phone_no || d.phone_no || fallback.phone || '',
  };
}
