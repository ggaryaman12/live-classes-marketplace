# Yelo API Reference — Auth (Customer + Merchant) + Service Requests

Portable reference of the raw **yelo-server** HTTP calls behind Buddy, for reuse in other projects.
All verified against the running backend. yelo-server **always returns HTTP 200** — the real status is
`json.status` (200 = ok). Treat any `status !== 200` as failure.

> The **Response** blocks below are **real captures** from the live test tenant (trimmed for brevity;
> tokens/ids shortened). Field names are exact. Each section: what it's **used for** → curl → response.

## THIS DOCUMENT IS THE SOURCE OF TRUTH

Build against what is written here. `yelo-server` is a live repo under active
development by another team — it moves constantly, and chasing it would mean
this document was never stable enough to build on.

**What that means for the `file.js:NNN` citations.** They are PROVENANCE, not a
live index: they record where a claim was verified at the time it was written.
Upstream shifts, and they go stale in bulk — in one week `createTaskViaVendorV3`
moved 770 lines. A stale line number does not make the claim wrong.

**So find things by anchor, not by line:**

```bash
grep -n "'/create_task_via_vendor_v2'" platform-source/yelo-server/app.js
grep -n "exports.createTaskViaVendorV3" platform-source/yelo-server/routes/v2/customer_open_apis.js
```

The FACTS — field names, required params, constants, which middleware runs —
are re-checked against upstream on every test run. Drift is reported as
`[upstream-drift]` and does not fail the build; that is deliberate, because a
build that breaks when someone else commits to a different repo trains people
to ignore red. Run `YELO_VERIFY_SOURCE=1 node tests/run.js` when you want a hard
stop instead — that is the mode for deliberately re-deriving a section.

If upstream and this document disagree on something load-bearing, that is a
finding worth acting on, not a formatting problem.

## Conventions

```bash
BASE="https://test-api-3025.jungleworks.com"     # yelo-server base (tenant-specific)
MKT=510009445                                     # marketplace_user_id (the tenant)
REF=7a57517ff024ea5715497555a297e86c              # marketplace_reference_id (the tenant)
DOM="yourtenant.tld"                              # domain_name (tenant storefront domain)
# Common JSON headers (some endpoints expect device_type + base_version):
H=(-H "Content-Type: application/json" -H "device_type: WEB" -H "base_version: 1.0.0")
```

Two auth identities exist:
- **Vendor token** = a **customer** login (`vendor_id` + `access_token`). Used for customer flows + all bidding (service requests), incl. provider bidding.
- **Merchant/dashboard token** = a **storefront/merchant** (`user_id` + `access_token`, often with `secret_token`). Used for merchant signup, order history, dashboard notifications. Minted by `provider_bootstrap`.

> Counter-intuitive naming (yelo-wide): `vendor_id` = the **customer/buyer**; `user_id` = the **merchant/seller**; `marketplace_user_id` = the **tenant/platform owner**.

Most marketplace POST bodies include this **tenant envelope**: `domain_name`, `marketplace_user_id`,
`marketplace_reference_id`, `dual_user_key` (0 unless dual-user), `language` ("en").

---

## 0. Tenant bootstrap

> **Verified against the LIVE endpoint**, not inferred. The handler assembles
> this response by spreading DB rows, so grepping the source for a field name
> finds nothing even when the field is returned — the only reliable check is to
> call it and read the keys. That distinction cost real time; see the warning
> below before you go looking for a field in `marketplace.js`.

### `marketplace_fetch_app_configuration` — everything about the tenant

`POST /marketplace_fetch_app_configuration` — registered at
`yelo-server/app.js:349`. **No auth middleware**: it takes the tenant envelope
only, which is what lets a storefront render before anyone signs in.

Handler: `routes/marketplace.js:6972`. It reads `marketplace_reference_id` and
`domain_name` (`:6996-6997`) and has one hard rejection — `domain_name ==
'food.yelo.red'` returns `INVALID_MARKETPLACE` (`:7002`).

**Request** — the envelope, nothing more:

```
marketplace_user_id, marketplace_reference_id, domain_name,
dual_user_key: 0, language: 'en'
```

**Response.** `data` carries **592 keys** on a real tenant. Listing them here
would be a worse document, not a better one — most are dashboard-only and
tenant-specific. The ones a storefront actually needs, each confirmed present in
a live response:

| Key | Live value (example tenant) | What it is |
|---|---|---|
| `company_name` | `"hey"` | the tenant's display name |
| `store_name` | `"test_23"` | fallback name |
| `domain_name` | `"…jungleworks.me"` | the tenant host |
| `logo` | S3 URL | brand mark |
| `currency_id` | `82` | **required to place an order** (§4 manData) |
| `payment_settings[0].symbol` | `"$"` | the price symbol — see the warning |
| `payment_settings[0].code` | `"XCD"` | ISO currency code |
| `decimal_display_precision_point` | `2` | how many decimals to render |
| `signup_field` | `2` | 1 = email, 2 = phone, else both (§1, §4) |
| `is_guest_checkout_enabled` | `0` | tenant allows guest orders |
| `is_menu_enabled` | `1` | send `is_app_menu_enabled` on orders (§4) |
| `is_multi_currency_enabled` | `0` | changes where currency comes from |
| `business_model_type` | `"HYPERLOCAL_PRODUCT"` | a `"FREELANCER"` tenant uses a flow we do NOT build on — see §3 |
| `onboarding_business_type` | `802` | vertical; `LAUNDRY` uses different order endpoints |
| `latitude` / `longitude` | `"28.61482"` / `"77.219989"` | **strings** — cast before use |
| `address` | `"New Delhi, India"` | tenant address |

### ⚠️ Fields that do NOT exist here (all cost us a real bug)

Every one of these was read by our own storefront and silently produced a
default. None threw. That is the danger of this endpoint: a missing key is
`undefined`, and `undefined || fallback` looks like working code.

| Read | Reality |
|---|---|
| `currency_symbol` | **absent.** The symbol is `payment_settings[0].symbol`. Reading the top level rendered every price as `₹` for a tenant whose currency is XCD `$`. |
| `business_name` | **absent.** Use `company_name`. Falling through displayed the raw hostname as the site's own name. |
| `is_wallet_enabled` / `wallet_enabled` | **absent**, and the real storefront reads neither. Wallet availability is whether `wallet` answers 200 for that customer — a config gate here disables it for everyone. |
| `is_guest_account` | **absent.** It is a per-CUSTOMER field on `vendor_details` (§1). The tenant flag is `is_guest_checkout_enabled`. |

**`latitude` and `longitude` are strings**, not numbers. `Number()` them before
arithmetic or you will concatenate.

### How to check a field yourself

Because the response is assembled by spread, `grep` on the handler is not
evidence of absence. Call it:

```bash
curl -s -X POST "$BASE/marketplace_fetch_app_configuration" \
  -H "Content-Type: application/json" \
  -d '{"marketplace_user_id":<MKT>,"marketplace_reference_id":"<REF>",
       "domain_name":"<DOMAIN>","dual_user_key":0,"language":"en"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print(sorted(d))"
```

That is the whole method for this section, and it is the one that found all four
bugs above after source-reading had missed them.

## 1. Customer (vendor) auth

> **Re-derived from the real source**, the same way §4 was, after the checkout
> section turned out to have three wrong facts written from inference. Every
> claim below cites a file and line in `platform-source/`. Where the backend and
> the live storefront both speak to a field, both are cited — one-sided
> verification is how `CASH = 4` survived for months.
>
> **This section previously documented `phone_number` and `country_code` for the
> OTP endpoints. Neither field exists.** The schema rejects them outright. See
> the warning below.
>
> Routes for these live in TWO places, which is worth knowing before you grep:
> `yelo-server/app.js` for the `marketplace_*` endpoints, and
> `yelo-server/modules/customer/index.js` for everything under `customer/`.
> Searching only `app.js` reports the `customer/*` routes as nonexistent.

### ⚠️ The OTP endpoints reject `phone_number` and `country_code`

The field is **`phone`**, and it carries the whole number. There is no
`country_code` field on these endpoints at all.

This matters more than a rename, because validation here is **strict**.
`validateFields` calls `Joi.validate(req, schema)` with no options
(`yelo-server/validators/joiValidator.js:26`), and Joi's default `allowUnknown`
is `false` — so an unrecognised key is not ignored, it fails the request with
`"phone_number is not allowed"`.

Confirmed on both sides:

| Field | Backend schema | Live storefront sends |
|---|---|---|
| `phone` | `customerValidator.js:101` | `login.component.ts:191` |
| `email` | `customerValidator.js:99` | `login.component.ts:192` |
| `otp` (required) | `customerValidator.js:98` | `login.component.ts:193` |
| `marketplace_reference_id` (required) | `customerValidator.js:100` | `login.component.ts:189` |
| `marketplace_user_id` — **string, not number** | `customerValidator.js:111` | `.toString()` at `login.component.ts:190` |
| `login_vendor_via_otp` | `customerValidator.js:106` | `login.component.ts:194` |

`marketplace_user_id` is typed `Joi.string()`. The storefront calls `.toString()`
on it for exactly that reason. Sending the number you keep everywhere else in
this API fails validation here — this endpoint is the odd one out.

`.or('email', 'phone')` (`customerValidator.js:114`) means **one of the two is
required**; sending neither fails even though both are individually optional.

### Endpoint table

Auth middleware is part of the contract — it decides what a request needs
before your handler is ever reached.

| Endpoint | Registered | Middleware before the handler |
|---|---|---|
| `marketplace_vendor_login` | `app.js:327` | `vendors.rateLimit` |
| `marketplace_vendor_signup` | `app.js:326` | **`authServer.verifyRecaptchaToken`** |
| `marketplace_vendor_login_via_access_token` | `app.js:348` | none |
| `marketplace_vendor_verify_otp` | `app.js:334` | none |
| `marketplace_vendor_resend_otp` | `app.js:335` | none |
| `marketplace_vendor_change_phone` | `app.js:336` | none |
| `submit_signup_template` | `app.js:305` | `authenticateVendorLoginRequest` |
| `customer/send_login_otp` | `modules/customer/index.js:23` | validator (see below), `authenticateAllRequest` |
| `customer/verifyOtp` | `modules/customer/index.js:20` | `customerValidator.verifyOtp`, `authenticateAllRequest` |
| `customer/forgotPassword` | `modules/customer/index.js:18` | validator, `vendors.rateLimit`, `authenticateAllRequest` |

**Signup needs a reCAPTCHA token.** `marketplace_vendor_signup` sits behind
`authServer.verifyRecaptchaToken` (`app.js:326`). A server-rendered storefront
cannot mint one; plan the signup flow around that rather than discovering it at
integration time. Login is separately rate-limited (`vendors.rateLimit`), so a
retry loop on bad credentials will start failing for a different reason than the
credentials.

**`customer/send_login_otp` is not actually validated.** The schema at
`customerValidator.js:181-203` is built and then never used — the function calls
`next()` unconditionally at `customerValidator.js:204`, without calling
`validateFields`. So the endpoint accepts any body and problems surface deeper
in the controller instead of as a clean parameter error. Treat that schema as a
statement of intent (`email` or `phone`, plus `marketplace_reference_id`) rather
than something enforced, and do not rely on a validation error to tell you the
request was malformed.

### `marketplace_vendor_login` — email or phone + password

Handler: `routes/marketplace.js:2881`.

**Mandatory:** the handler builds `manData = [password, marketplace_reference_id]`
(`routes/marketplace.js:2901`) and rejects with `PARAMETER_MISSING` if either is
blank. Note what is *not* in that list: neither `email` nor `phone_no` is
mandatory at this check, so a request with a password and no identifier gets
past it and fails later, less clearly.

Read from the body (`routes/marketplace.js:2886-2899`): `email`, `password`,
`marketplace_reference_id`, `domain_name`, `phone_no`, `device_token`,
`app_version`, `app_device_type`, `timezone`, `fb_token`, `language`,
`business_type`, `new_payment_gateways_required`, and `lat`/`lng` — which are
only read when **both** keys are present (`:2903`).

**`phone_no` must contain a space.** It is parsed by `extractPhoneNumber`
(`routes/marketplace.js:5708`), which does `number.split(" ")[1].split("")`. With
no space, `split(" ")[1]` is `undefined` and the call **throws** rather than
returning a validation error. So `"+91 9876543210"` is correct and
`"+919876543210"` is not merely wrong, it is a 500.

**Response.** `status: 200` with `data.access_token` — also mirrored as
`data.app_access_token`, same value — plus `data.vendor_details` (carrying
`vendor_id`, the customer's id under YELO's inverted naming) and `formSettings`.
Store `vendor_id` + `access_token`; every later customer call needs both.

### `marketplace_vendor_login_via_access_token` — session restore

`app.js:348`, no middleware. Send `vendor_id` + `access_token` with the tenant
envelope. Use it as "who am I, and am I verified" on boot: it returns the same
`vendor_details` and `formSettings`, plus any pending verification steps, so a
storefront can decide whether to show the app or a verification screen without
guessing from a stored flag.

### What is NOT verified in this section

Stated plainly rather than left for someone to discover:

- The **response bodies** above are from observed responses, not from reading
  the assembly code the way §4's bill response was. Field names are reliable;
  completeness is not guaranteed.
- `marketplace_vendor_verify_otp`, `resend_otp`, `change_phone` and
  `submit_signup_template` have their **routes and middleware** verified here,
  but their parameter lists have not been traced to a `manData` or a schema.
- `customer/forgotPassword` has a validator (`modules/customer/index.js:18`)
  whose schema has not been read.

If you need any of those exactly, read the handler — the route line above tells
you where it is.

## 2. Merchant (storefront) auth

> **Re-derived from source**, like §1 and §4. Every claim cites a file and line
> in `platform-source/`. The previous version of this section documented an
> endpoint that does not exist — see the warning immediately below.
>
> Merchant routes live in `yelo-server/app.js`. Unlike the customer endpoints,
> there is no separate module router for these.

### 🚫 `merchant/getByEmail` DOES NOT EXIST

The previous version of this section documented `merchant/getByEmail` as a way
to "pre-check whether a merchant account already exists for an email before
signup". **There is no such endpoint.** Searched across all three repos:

```
grep -rn "getByEmail" platform-source/yelo-server        # 0 results
grep -rn "getByEmail" platform-source/yelo-dashboard-angular/src   # 0 results
grep -rn "getByEmail" platform-source/yelo-marketplace-webapp/src  # 0 results
```

Zero occurrences anywhere. It was invented, in the one document whose stated
rule is never to invent an endpoint. Anything built against it calls a 404.

**There is no email-existence pre-check.** The complete set of `merchant/*`
routes is in `app.js` (`grep -nE "app\.post\('/merchant/" app.js`) and none of
them looks up a merchant by email. Let `merchant/signup` fail and surface its
error instead of pre-flighting.

### `merchant/signup` — create a storefront

`app.js:401`. Two middlewares run before the controller, and both can reject:

```
merchantValidator.merchantSignup   → validators/merchantValidator.js:280
passwordPolicy.validate            → middlewares/passwordPolicy.js:16
```

**Validation is strict and enforced.** The schema is at
`merchantValidator.js:281-313` and the guard at `:315` is
`if (validFields) { next(); }`, so a bad body stops there. As everywhere,
`validateFields` calls `Joi.validate(req, schema)` with no options
(`joiValidator.js:26`), so **unknown keys are rejected**, not ignored.

**Required** (`Joi.*.required()`):

| Field | Type |
|---|---|
| `email` | string |
| `name` | string |
| `first_name` | string |
| `phone` | string |
| `country_phone_code` | string |
| `timezone` | number |
| `country_id` | number |
| `state_id` | number |
| `city_id` | number |
| `password` | string |
| `marketplace_reference_id` | string |

**Optional:** `last_name` (allows `''`), `store_name`, `display_store_name`,
`company_address`, `display_address`, `company_latitude`, `company_longitude`,
`logo`, `description`, `serving_distance`, `layout_type`,
`marketplace_user_id`, `fb_token`, `dob`, `custom_fields`, `otp_id`.

Two things worth stating explicitly, because both are easy to get wrong:

- **The phone is split across two fields** — `phone` and `country_phone_code`,
  separately. This is NOT the `phone_no` `"+<code> <number>"` combined format
  that `marketplace_vendor_login` uses (§1). Same concept, different shape, and
  sending `phone_no` here fails as an unknown key.
- **`marketplace_user_id` is `Joi.number()` here** (`merchantValidator.js:305`).
  In `customer/verifyOtp` it is `Joi.string()` (§1). The same field is typed
  differently on different endpoints; send it the way the endpoint you are
  calling wants it.

### ⚠️ Passwords are checked by a service outside these repos

`passwordPolicy.validate` (`middlewares/passwordPolicy.js:16`) does not
implement any rule itself. It calls `authService.verifyPassword`, which POSTs to
an external auth service at **`/jungle/verifyPassword`**
(`properties/constants.js:1457`) and rejects with `PASSWORD_ERROR` when that
service answers `valid: false`.

**The actual password rules are not knowable from these three repos.** Do not
document a minimum length or a character-class rule here — there is nothing to
read. Treat a `PASSWORD_ERROR` response as authoritative, surface its message,
and let the user retry. Do not pre-validate in the client against a guessed
policy; you will either block passwords the service would accept or accept ones
it will not.

The middleware is skipped entirely when neither `password` nor `new_password` is
present (`passwordPolicy.js:17-19`), so it only applies to requests that
actually set one.

### Custom fields — note which ones need dashboard auth

| Endpoint | Registered | Dashboard auth? |
|---|---|---|
| `merchant/getCustomFields` | `app.js:404` | **no** — validator only |
| `merchant/addCustomFields` | `app.js:403` | yes |
| `merchant/updateCustomFields` | `app.js:405` | yes |

`getCustomFields` is deliberately readable without a merchant session — a signup
form has to render the tenant's custom fields before an account exists. The
write endpoints require `dashboardAuth.authenticateDashboardUser`.

**`merchant/getCustomFields` parameters** — schema at
`validators/merchantCustomFieldValidator.js:72`, strict Joi as everywhere:

| Field | Required | Note |
|---|---|---|
| `marketplace_reference_id` | **yes** | string |
| `user_type` | **yes** | number — `3` for the merchant/storefront form |
| `marketplace_user_id` | no | number |
| `on_signup` | no | boolean — set it when rendering the SIGNUP form |
| `language` | no | string |

`access_token` and `user_id` are commented out in the schema, which is what
makes this callable before an account exists. Do not send them: unknown keys
are rejected, and a commented-out line is not a declared key.

### `get_dashboard_notifications` — merchant notification feed

`app.js:127`, behind `dashboardAuth.authenticateDashboardUser`. This is
**merchant-token** auth, not the customer `access_token` from §1 — a storefront
customer token cannot call it, and a build that tries will fail in a way that
looks like the feature is broken rather than like an auth mismatch.

### What is NOT verified in this section

- **Response bodies** are from observed responses, not from reading the
  assembly code the way §4's bill response was. Field names are reliable;
  completeness is not.
- The `bidding/list` `provider_bootstrap` view — how a customer becomes a
  provider and mints a merchant token — is documented in §3 and has **not** been
  traced to source.
- ~~`merchant/getCustomFields`' own schema~~ — now read and documented above.
- Merchant **order history** endpoints (below) have their auth model confirmed
  by inspection of the route table, but not their parameters.

### Merchant order history (read-only)
**Used for:** the merchant's jobs/orders. **Merchant-token auth**, `user_type:3`.
```bash
# List — data.all_jobs[] (job_id, order_id, job_status, customer_username, total_amount, creation_datetime, job_description, job_address)
curl -sX POST "$BASE/marketplace_get_orders_v4" -H "Authorization: Bearer <MERCHANT_TOKEN>" "${H[@]}" --data "{
  \"access_token\":\"<MERCHANT_TOKEN>\", \"marketplace_user_id\":$MKT, \"user_id\":<MERCHANT_ID>, \"user_type\":3,
  \"order_status\":0, \"start\":0, \"length\":25, \"sortCol\":0, \"sortDir\":\"desc\", \"edited_orders\":0,
  \"start_date\":\"2026-03-01\", \"end_date\":\"2026-06-30\"}"
# order_status: 0=all, 10=Ordered, 13=Delivered, 15=Cancelled
# Detail — data is an ARRAY [{...}]
curl -sX POST "$BASE/get_order_history_dashboard" -H "Authorization: Bearer <MERCHANT_TOKEN>" "${H[@]}" --data "{
  \"access_token\":\"<MERCHANT_TOKEN>\", \"user_type\":3, \"user_id\":<MERCHANT_ID>,
  \"merchant_id_filter\":[<MERCHANT_ID>], \"marketplace_user_id\":$MKT, \"job_id\":<JOB_ID>}"
```
**List response (200):**
```json
{ "message": "Successful", "status": 200, "data": {
  "count": 20,
  "all_jobs": [
    { "job_id": 131839, "order_id": 88214, "job_status": 9, "user_id": 510013205,
      "customer_username": "qwertytr", "job_description": "testing on saas",
      "job_address": "New Delhi, India", "total_amount": 2.2, "payment_type": "CASH",
      "is_custom_order": 1, "merchant_name": "Simran Test 2",
      "creation_datetime": "2026-06-23T05:49:10.000Z" } ] } }
```
**Detail response (200):** `data` is an **array** `[{ job_id, order_id, job_description, total_amount, job_pickup_address, job_delivery_datetime, merchant_name, merchant_phone_number, payment_type, ... }]`.

---


## 3. Service requests (freelancer / bidding) — OUT OF SCOPE

**We do not build on this flow. Do not use it.**

`/freelancer/*` is a separate product surface — customers post a service
request, merchants bid on it, the customer accepts a quote. It exists in
`yelo-server` (`modules/freelancer/`), it works, and it is **not part of what
this storefront does.** It has its own checkout endpoints, entirely separate
from the `get_bill_breakdown` / `create_task_via_vendor_v2` pair in §4. They are
deliberately not named here — naming them is how a flow nobody uses ends up
with something built against it.

This section is kept as a MARKER rather than deleted. An earlier draft
documented the whole subsystem at invented URLs (`POST /bidding`, `POST
/bidding/list` with a `view` parameter — no route anywhere contains "bidding"
in its path). Deleting the section silently would invite the next person who
finds `/freelancer/*` in `platform-source/` to document it again, and then to
build against it.

**If you are building a storefront feature and think you need this, you have
taken a wrong turn.** Ordinary ordering is §4. If a tenant genuinely runs the
service-request model, that is a separate conversation, not something to infer
from the presence of the routes.


## Status / error handling
- HTTP is always 200 — check `json.status === 200`. Common failure statuses: `100` (validation / "Can not process"), `401` (bad/expired token).
- `marketplace_reference_id` is **required** by most marketplace + auth endpoints — omitting it yields `status:100`.
- For server-driven multi-tenant apps, inject `vendor_id`/`access_token`/`marketplace_user_id` **server-side**; never trust client-supplied auth.

---

## 4. Checkout — bill breakdown + order placement

> **Every fact in this section is cited to a file and line in the real repos**,
> which are mounted read-only in this workspace at `platform-source/`. Nothing
> here is inferred from a name. Where a value appears in both the backend and
> the live storefront, both citations are given, because a value that matches on
> only one side is how `CASH = 4` survived in this document for weeks — see the
> warning below.
>
> Verify anything yourself:
> `grep -n "get_bill_breakdown" platform-source/yelo-server/app.js`
>
> | Concern | Backend | Live storefront |
> |---|---|---|
> | Bill | `yelo-server/routes/v2/customer_open_apis.js:849` | `yelo-marketplace-webapp/src/app/components/payment/payment.service.ts:51` |
> | Order | `yelo-server/routes/v2/customer_open_apis.js:5573` | `.../payment/payment.service.ts:165` |
> | Payment values | `yelo-server/properties/constants.js:472-606` | `yelo-marketplace-webapp/src/app/enums/enum.ts:75-91` |

The SaaS marketplace webapp splits this across two screens (checkout, then
payment); our storefront clubs them into one. Both call the same two endpoints
in the same order.

### ⚠️ Payment method values — read this before writing any checkout code

The parameter is **`payment_method`**, not `payment_type`. The backend reads it
as `data.payment_type = parseInt(req.body.payment_method)`
(`customer_open_apis.js:5640`) — the *internal* field is `payment_type`, the
*wire* field is `payment_method`. Sending `payment_type` produces `NaN` and the
order is created with no payment method at all.

Values come from `constants.merchantPaymentMethodsMasks`
(`yelo-server/properties/constants.js:472-606`), mirrored in the storefront as
`PaymentMode` (`yelo-marketplace-webapp/src/app/enums/enum.ts`):

| Method | Value | Server | Storefront |
|---|---|---|---|
| `CASH` | **8** | `constants.js:478` | `enum.ts:75` |
| `PAY_ON_DELIVERY` | 9 | `constants.js:479` | `enum.ts:76` |
| `WALLET` | 16384 | `constants.js:565` | `enum.ts:89` |
| `PAYLATER` / `PAY_LATER` | 65536 | `constants.js:567` | `enum.ts:91` |
| `STRIPE` | 2 | `constants.js:474` | `enum.ts` |
| `RAZORPAY` | 128 | `constants.js` | `enum.ts` |

The reverse map (value → display name) is `constants.paymentTypeReverse`
(`constants.js:616`), which is also the complete list of ~120 supported
gateways.

> **An earlier version of this document said `CASH = 4`. It is 8.** Four is not
> a payment method in this system at all. If you are porting code written
> against the old doc, that is the first thing to check.

### `get_bill_breakdown` — itemized bill

`POST /get_bill_breakdown` — registered at `yelo-server/app.js:300`, behind
`authServer.authenticateVendorLoginRequest`, so a customer `access_token` is
required. (A separate dashboard-authed variant exists at
`app.js:607` as `/open/get_bill_breakdown`; do not use it from a storefront.)

**Request.** Params are read at `customer_open_apis.js:856-930`. The ones a
storefront actually sends — copied from the two real callers,
`checkout.service.ts:245` and `payment.service.ts:48`:

```
envelope +
user_id                       # the MERCHANT / store  (see naming warning below)
vendor_id                     # the CUSTOMER, 0 for guest
access_token
marketplace_user_id
amount                        # cart subtotal
products                      # JSON string: [{ product_id, quantity, unit_price }]
latitude, longitude
self_pickup                   # 1 = self-pickup, 0 = delivery
is_app_product_tax_enabled: 1 # BOTH real clients hard-code this to 1
promo_id: 0                   # 0 = none; default is 0 server-side
tip_type: -1                  # -1 = no tip; default is -1 server-side
```

Optional, all read by the same handler: `promo_code`, `referral_code`,
`loyalty_points`, `external_coins`, `is_auto_apply_coin`, `payment_method`,
`is_scheduled` + `schedule_time`, `job_pickup_datetime`, `is_custom_order`,
`is_pickup_anywhere`, `prev_job_id`, `checkout_template`,
`exclude_additional_charges_arr`, `is_recurring_enabled` +
`start_schedule`/`end_schedule`/`occurrence_count`/`day_array`/`cycle_type`.

**Response.** The response object is assembled verbatim at
`customer_open_apis.js:2518-2552`. These are all of its keys — not a summary,
the actual object:

| Key | Meaning |
|---|---|
| `ACTUAL_AMOUNT` | Item total (subtotal) before delivery and tax |
| `NET_PAYABLE_AMOUNT` | **Grand total the customer pays.** This is the number you send back as `amount` when placing the order |
| `DELIVERY_CHARGE` | Base delivery fee (initialised to `0`) |
| `USER_TAXES` / `DELIVERY_TAXES` / `TOTAL_TAX` | Item tax, delivery tax, and their sum |
| `TAXABLE_AMOUNT` | Amount tax was computed on |
| `TAX_BILL_BREAKUP` | Per-tax rows for display |
| `DISCOUNT` | Promo / coupon discount |
| `PROMOS` / `APPLIED_PROMOS` / `SHOW_PROMO_BTN` | Available promos, applied promos, and whether to render the promo entry at all |
| `DELIVERY_DISCOUNT` | Delivery-specific discount |
| `BILL_BREAKUP` | **Pre-built display array.** When present, render it verbatim — see below |
| `PRODUCTS` | Server-recalculated line items (authoritative over your cart) |
| `ADDITIONAL_CHARGES` / `TOTAL_ADDITIONAL_CHARGE` / `ADDITIONAL_AMOUNT` | Extra fees and their sum |
| `SURGE_AMOUNT` / `DELIVERY_CHARGE_SURGE_AMOUNT` | Surge on goods and on delivery |
| `TIP_ENABLE_DISABLE` / `TIP_OPTION_ENABLE` / `TIP_TYPE` / `MINIMUM_TIP` / `MINIMUM_TIP_TYPE` | Tip config — all five drive one UI |
| `WALLET_DETAILS` | Customer wallet balance and applicability |
| `HOLD_AMOUNT` / `HOLD_PAYMENT` | Pre-authorisation hold (some gateways) |
| `REFERRAL` | Referral state |
| `CURRENCY` | Currency symbol / code for formatting |
| `BUSINESS_TYPE` | Tenant vertical; changes wording and which fields matter |
| `DELIVERY_CHARGES_FORMULA_FIELDS` | Inputs behind the delivery number, for "how was this calculated" |
| `SHOW_TAX_INCLUSIVE_PRICING` / `..._MERCHANT` | Whether prices already include tax — **changes whether you display a tax line at all** |

Added only under some configurations, so guard before reading:
`dynamicDeliveryDistanceObj`, `MAX_USABLE_POINT`, `EXTERNAL_COINS_USED`.

**Render `BILL_BREAKUP` verbatim when it is present.** It is a pre-built array
of display rows that already reflects tenant configuration the client cannot
see — tax-inclusive pricing, which fees this tenant shows, what they are called
in this locale. Field-mapping the individual keys yourself is only correct when
`BILL_BREAKUP` is absent. Getting this wrong produces a bill that is arithmetically
right and does not match what the tenant's other surfaces show.

**What the backend actually does**, from the platform's own pseudo-code at
`yelo-server/bill_breakdown_pseudo.txt` (94 lines, worth reading in full before
touching pricing) — in order: app-version gate → merchant business config →
products → product discount mapping → catalog (if mandatory catalog settings
enabled) → customisation prices → taxes on catalogue and on product → per-product
loop applying tax, customisation, discount and template cost → surge (per-service
for service businesses, on the total for product businesses) → multi-currency →
wallet balance → promo/referral code resolution → geofence region charges →
city-based charges → delivery charge (delegated to Tookan with a city template)
→ surge on delivery → additional charges → merchant and marketplace taxes →
delivery tax → tip → referral validation → loyalty points → customer debt →
payment gateway charges.

The practical consequence: **almost every number is tenant-configurable, and
several are computed by a different service.** Never recompute a total on the
client to "check" the backend — you will disagree with it for legitimate
reasons. `NET_PAYABLE_AMOUNT` is the answer.

### `create_task_via_vendor_v2` — place the order

`POST /create_task_via_vendor_v2` — registered at `yelo-server/app.js:280`,
behind `authServer.authenticateVendorLoginRequest`, handled by
`exports.createTaskViaVendorV3` (`customer_open_apis.js:5573`). The route name
says v2 and the handler says V3; that is not a typo, do not "fix" it.

**Mandatory params.** The handler builds a `manData` array at
`customer_open_apis.js:5777-5787` and rejects the request with
`PARAMETER_MISSING` if any entry is blank:

```
job_pickup_name       →  customer_username
job_pickup_datetime
job_pickup_latitude   →  latitude
job_pickup_longitude  →  longitude
job_pickup_address    →  job_address
currency_id
marketplace_user_id
```

Plus, unless the tenant has guest accounts enabled (`is_guest_account`), one or
both of `job_pickup_email` / `job_pickup_phone` — **which one depends on the
tenant's `signup_field` config** (`EMAIL` → email, `PHONE` → phone, anything
else → both). Do not hard-code this; read it from the tenant config.

`products` is validated separately (`:5831-5840`): it must parse to a non-empty
array or the request is rejected.

**Body**, from the real caller (`payment.component.ts:4212-4232` assembling,
`payment.service.ts:165` sending):

```
envelope +
user_id                  # MERCHANT / store
vendor_id                # CUSTOMER
access_token
marketplace_user_id
products                 # JSON string, same shape as the bill call
amount                   # = NET_PAYABLE_AMOUNT from get_bill_breakdown
delivery_charge          # from the bill response
payment_method: 8        # CASH — see the values table above
currency_id
job_pickup_name, job_pickup_phone, job_pickup_email
job_pickup_address, job_pickup_latitude, job_pickup_longitude
job_pickup_datetime
self_pickup / home_delivery
is_scheduled: 0          # 0 = now
is_app_product_tax_enabled: 1
is_app_menu_enabled: 1   # only when the tenant has is_menu_enabled
```

`created_by` is set server-side from `app_type` (`:5789-5802`); a web storefront
that sends no `app_type` is recorded as `WEBAPP`, which is correct — do not
spoof it.

**Response.** `status === 200` and the order id is at **`data.job_id`** — that
exact path, as read by the real client at `payment.component.ts:7206`:

```js
const response = await this.createTaskApiCall(data);
this.sessionService.set('lastOrderId', response.data.job_id);
```

### The complete cash order flow — two calls

This is the whole thing, and it is worth stating plainly because the payment
component that implements it is 10,000+ lines and almost all of that is gateway
handling that cash does not touch:

1. `POST /get_bill_breakdown` → read `NET_PAYABLE_AMOUNT`
2. `POST /create_task_via_vendor_v2` with `payment_method: 8` and
   `amount: NET_PAYABLE_AMOUNT` → read `data.job_id`

**That is the order.** There is no third confirmation call for a normal cash
order. Cash is settled physically, so nothing needs to be charged.

**The exception, so you recognise it and do not copy it.** The real client also
has `payViaCash()` (`payment.component.ts:10420`), which posts to
`initiate_payment` (`payment.service.ts`, `payViaBillPlz`) with
`payment_method: 8` and the `job_id`. It is called **only** when
`isSourceCustom || isEditedTask` (`payment.component.ts:7215`) — i.e. custom
quotations and edits to an existing order, where a job already exists and a
payment record has to be attached to it. A first-time cash checkout must not
call it.

**Why the distinction matters:** each payment option carries a
`payment_process_type` (`payment.component.ts:5423-5429`). `0` means charge
before creating the job (cards), `1` means post-payment (`post_payment_enable`),
`2` means the job already exists. Cash falls through every gateway branch in
`createTask()` and reaches the plain API call. If you find yourself writing a
gateway redirect for cash, you have taken a wrong branch.

### Naming — the trap that costs everyone a day

Verified against `yelo-server` DB access throughout:

| Field | What it actually means |
|---|---|
| `user_id` | The **MERCHANT** — the store, the seller |
| `vendor_id` | The **CUSTOMER** — the buyer |
| `marketplace_user_id` | The tenant (platform owner) |

Both of these are backwards from what the words suggest. In `tb_jobs`,
`tb_job_payment_details` and every checkout payload, `user_id` is the shop and
`vendor_id` is the person buying. Read any SQL twice.

### Failure handling

HTTP is always 200. Check `body.status`:

- `200` — success
- `100` — validation failure. For the order endpoint this is usually a blank
  `manData` entry or an empty `products` array; `message` is localised and
  safe to show.
- `401` — bad or expired `access_token`; re-authenticate.

Never show a raw backend message for a `500`. Never retry an order automatically
on an ambiguous failure — a duplicated order is worse than an error message.
