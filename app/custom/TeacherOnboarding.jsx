'use client';
/**
 * TeacherOnboarding — "Become a teacher", a real signup flow that creates a
 * real merchant account on this marketplace (the same account type every
 * teacher already selling classes here has).
 *
 * WHY THIS IS ITS OWN FILE, PLUS ITS OWN DATA FILE (teacherSignupApi.jsx):
 * requested explicitly — keeping the step UI here and every network call
 * there means either half can be read, changed or debugged without the
 * other, the same split the real Yelo merchant dashboard uses for this exact
 * screen (register-merchant.component.ts + merchant-signup.service.ts).
 *
 * THE REAL FLOW, TRACED FROM THE REAL PRODUCT (see teacherSignupApi.jsx for
 * the full citations): a prospective teacher fills in who they are, what
 * they'll teach under, and (only if this tenant has one configured and
 * switched on) any extra field the marketplace owner requires — then
 * `merchant/signup` creates the real account. No part of this is mocked;
 * every field sent is one `merchant/signup`'s own validator accepts.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: sign the new teacher in. A merchant
 * session belongs to the separate teacher/merchant dashboard product, not to
 * this customer storefront (confirmed: the real storefront's own "Partner
 * with us" link sends people to a different app entirely). So success here
 * is an honest confirmation, not a login — never a page pretending to be a
 * dashboard this storefront doesn't have.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  fetchTeacherSignupFields,
  buildSignupBody,
  registerTeacher,
} from './teacherSignupApi';

const FONT_LINK =
  'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Hanken+Grotesk:wght@400;500;600&display=swap';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors the real dashboard's password floor (custom.validators.ts
// isStrongPassword / hasAllCharClasses) minus the zxcvbn guessability score,
// which needs a dependency this storefront doesn't carry — the backend's own
// `requireStrongPassword` + `passwordPolicy` middleware is the real,
// authoritative check either way; this is just an honest head start so a
// weak password doesn't cost a whole round trip to find out.
function passwordIssues(pw) {
  const issues = [];
  if (pw.length < 8) issues.push('at least 8 characters');
  if (!/[A-Z]/.test(pw)) issues.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) issues.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) issues.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) issues.push('a symbol');
  return issues;
}

const STEP_LABELS = {
  about: 'About you',
  business: 'Your classes',
  extra: 'A couple more things',
  review: 'Review & submit',
};

export default function TeacherOnboarding({
  eyebrow = 'Teach on this marketplace',
  title = 'Bring your class online',
  subtitle = "Set your own price, your own schedule, and meet students live. It's the same account every teacher here already has.",
}) {
  const [about, setAbout] = useState({ name: '', email: '', phone: '', password: '', confirm: '' });
  const [business, setBusiness] = useState({ storeName: '', description: '' });
  const [extraFields, setExtraFields] = useState([]);
  const [extraLoading, setExtraLoading] = useState(true);
  const [extraValues, setExtraValues] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [touched, setTouched] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!document.querySelector('link[data-bell-fonts]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = FONT_LINK;
      l.setAttribute('data-bell-fonts', '');
      document.head.appendChild(l);
    }
  }, []);

  // Real, tenant-specific: an empty list here means this marketplace hasn't
  // switched on any extra signup field, which is this tenant's actual state
  // right now — not a loading failure, so the "extra" step is simply skipped.
  useEffect(() => {
    let cancelled = false;
    fetchTeacherSignupFields().then((fields) => {
      if (cancelled) return;
      setExtraFields(fields);
      setExtraLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const steps = useMemo(
    () => ['about', 'business', ...(extraFields.length ? ['extra'] : []), 'review'],
    [extraFields.length]
  );
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const pwIssues = passwordIssues(about.password);
  const errors = {
    name: about.name.trim() ? '' : 'Enter your name.',
    email: about.email.trim()
      ? EMAIL_RE.test(about.email.trim())
        ? ''
        : 'Enter a valid email.'
      : 'Enter your email.',
    phone: /^\d{10}$/.test(about.phone.trim()) ? '' : 'Enter a 10-digit phone number.',
    password: about.password
      ? pwIssues.length
        ? `Password needs ${pwIssues.join(', ')}.`
        : ''
      : 'Choose a password.',
    confirm: about.confirm === about.password && about.confirm ? '' : "Passwords don't match.",
    storeName: business.storeName.trim().length >= 2 ? '' : 'Enter a name students will see.',
  };
  const requiredExtraMissing = extraFields.some(
    (f) => f.required && !String(extraValues[f.label] ?? '').trim()
  );

  const aboutValid = !errors.name && !errors.email && !errors.phone && !errors.password && !errors.confirm;
  const businessValid = !errors.storeName;
  const extraValid = !requiredExtraMissing;

  function markTouched(keys) {
    setTouched((t) => ({ ...t, ...Object.fromEntries(keys.map((k) => [k, true])) }));
  }

  function next() {
    if (step === 'about') {
      markTouched(['name', 'email', 'phone', 'password', 'confirm']);
      if (!aboutValid) return;
    }
    if (step === 'business') {
      markTouched(['storeName']);
      if (!businessValid) return;
    }
    if (step === 'extra' && !extraValid) {
      markTouched(extraFields.map((f) => `extra:${f.label}`));
      return;
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function back() {
    setSubmitError('');
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function submit() {
    if (!aboutValid || !businessValid || !extraValid) return;
    setSubmitting(true);
    setSubmitError('');
    const customFieldValues = extraFields.map((f) => ({ label: f.label, value: extraValues[f.label] ?? '' }));
    const body = buildSignupBody({ ...about, ...business, customFieldValues });
    const res = await registerTeacher(body);
    setSubmitting(false);
    if (res?.status === 200) {
      setDone(true);
      return;
    }
    setSubmitError(typeof res?.message === 'string' && res.message ? res.message : "That didn't go through — please try again.");
  }

  if (done) {
    return (
      <section className="tob" aria-labelledby="tob-h">
        <div className="tob-frame tob-done">
          <span className="tob-done-badge" aria-hidden="true">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M4 12.5l5 5L20 6" /></svg>
          </span>
          <h1 id="tob-h">Your teacher account is set up</h1>
          <p>
            Welcome, {about.name.split(' ')[0] || 'there'} — <b>{business.storeName}</b> is now a real
            account on this marketplace, the same kind every teacher here already has.
          </p>
          <p className="tob-done-next">
            Check {about.email} for how to get into your teacher dashboard and add your first class.
            That dashboard is a separate app from this one, so it isn't something you'll sign into here.
          </p>
        </div>
        <style>{css}</style>
      </section>
    );
  }

  return (
    <section className="tob" aria-labelledby="tob-h">
      <div className="tob-frame">
        <p className="tob-eyebrow">{eyebrow}</p>
        <h1 id="tob-h" className="tob-title">{title}</h1>
        <p className="tob-sub">{subtitle}</p>

        <ol className="tob-steps" aria-label="Signup steps">
          {steps.map((s, i) => (
            <li key={s} data-state={i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'next'}>
              <span className="tob-step-dot" aria-hidden="true">{i < stepIndex ? '✓' : i + 1}</span>
              <span className="tob-step-label">{STEP_LABELS[s]}</span>
            </li>
          ))}
        </ol>

        <div className="tob-card">
          {step === 'about' && (
            <div className="tob-step">
              <h2 className="tob-step-h">Who's teaching?</h2>
              <label className="tob-field">
                <span>Full name</span>
                <input
                  value={about.name}
                  onChange={(e) => setAbout({ ...about, name: e.target.value })}
                  onBlur={() => markTouched(['name'])}
                  placeholder="e.g. Priya Sharma"
                  autoComplete="name"
                />
                {touched.name && errors.name && <small className="tob-err">{errors.name}</small>}
              </label>
              <div className="tob-two">
                <label className="tob-field">
                  <span>Email</span>
                  <input
                    type="email"
                    value={about.email}
                    onChange={(e) => setAbout({ ...about, email: e.target.value })}
                    onBlur={() => markTouched(['email'])}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {touched.email && errors.email && <small className="tob-err">{errors.email}</small>}
                </label>
                <label className="tob-field">
                  <span>Phone</span>
                  <div className="tob-phone">
                    <span className="tob-cc">+91</span>
                    <input
                      value={about.phone}
                      onChange={(e) => setAbout({ ...about, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      onBlur={() => markTouched(['phone'])}
                      inputMode="numeric"
                      placeholder="98765 43210"
                      autoComplete="tel-national"
                    />
                  </div>
                  {touched.phone && errors.phone && <small className="tob-err">{errors.phone}</small>}
                </label>
              </div>
              <div className="tob-two">
                <label className="tob-field">
                  <span>Password</span>
                  <input
                    type="password"
                    value={about.password}
                    onChange={(e) => setAbout({ ...about, password: e.target.value })}
                    onBlur={() => markTouched(['password'])}
                    autoComplete="new-password"
                  />
                  {touched.password && errors.password && <small className="tob-err">{errors.password}</small>}
                </label>
                <label className="tob-field">
                  <span>Confirm password</span>
                  <input
                    type="password"
                    value={about.confirm}
                    onChange={(e) => setAbout({ ...about, confirm: e.target.value })}
                    onBlur={() => markTouched(['confirm'])}
                    autoComplete="new-password"
                  />
                  {touched.confirm && errors.confirm && <small className="tob-err">{errors.confirm}</small>}
                </label>
              </div>
            </div>
          )}

          {step === 'business' && (
            <div className="tob-step">
              <h2 className="tob-step-h">What will students see?</h2>
              <label className="tob-field">
                <span>Your teaching name</span>
                <input
                  value={business.storeName}
                  onChange={(e) => setBusiness({ ...business, storeName: e.target.value })}
                  onBlur={() => markTouched(['storeName'])}
                  placeholder="e.g. Priya's Piano Studio"
                />
                <small className="tob-hint">This is the name your classes are listed under.</small>
                {touched.storeName && errors.storeName && <small className="tob-err">{errors.storeName}</small>}
              </label>
              <label className="tob-field">
                <span>A line about what you teach <i>(optional)</i></span>
                <textarea
                  value={business.description}
                  onChange={(e) => setBusiness({ ...business, description: e.target.value })}
                  placeholder="e.g. Beginner-friendly piano for ages 6 and up, live every week."
                  rows={3}
                />
              </label>
            </div>
          )}

          {step === 'extra' && (
            <div className="tob-step">
              <h2 className="tob-step-h">A couple more things</h2>
              <p className="tob-hint" style={{ margin: '-6px 0 14px' }}>
                This marketplace asks every new teacher for these.
              </p>
              {extraFields.map((f) => (
                <ExtraField
                  key={f.label}
                  field={f}
                  value={extraValues[f.label]}
                  touched={!!touched[`extra:${f.label}`]}
                  onChange={(v) => setExtraValues({ ...extraValues, [f.label]: v })}
                  onBlur={() => markTouched([`extra:${f.label}`])}
                />
              ))}
            </div>
          )}

          {step === 'review' && (
            <div className="tob-step">
              <h2 className="tob-step-h">Review</h2>
              <dl className="tob-review">
                <div><dt>Name</dt><dd>{about.name}</dd></div>
                <div><dt>Email</dt><dd>{about.email}</dd></div>
                <div><dt>Phone</dt><dd>+91 {about.phone}</dd></div>
                <div><dt>Teaching name</dt><dd>{business.storeName}</dd></div>
                {business.description && <div><dt>About</dt><dd>{business.description}</dd></div>}
                {extraFields.map((f) => {
                  const v = extraValues[f.label];
                  return v ? <div key={f.label}><dt>{f.display_name}</dt><dd>{Array.isArray(v) ? v.join(', ') : String(v)}</dd></div> : null;
                })}
              </dl>
              <p className="tob-hint">
                This creates a real account on this marketplace — the password above is how you'll sign
                in to your teacher dashboard.
              </p>
              {submitError && <p className="tob-err tob-err-block" role="alert">{submitError}</p>}
            </div>
          )}

          <div className="tob-actions">
            {stepIndex > 0 && (
              <button type="button" className="tob-back" onClick={back} disabled={submitting}>Back</button>
            )}
            {step !== 'review' ? (
              <button type="button" className="tob-next" onClick={next} disabled={step === 'extra' && extraLoading}>
                Continue
              </button>
            ) : (
              <button type="button" className="tob-next" onClick={submit} disabled={submitting}>
                {submitting ? 'Creating your account…' : 'Create my teacher account'}
              </button>
            )}
          </div>
        </div>
      </div>
      <style>{css}</style>
    </section>
  );
}

function ExtraField({ field, value, touched, onChange, onBlur }) {
  const missing = field.required && !String(value ?? '').trim();
  if (field.data_type === 'Document' || field.data_type === 'Image') {
    // No verified upload endpoint for this field from the storefront side —
    // real, not faked: this just tells the teacher where it really belongs.
    return (
      <p className="tob-field-note">
        <b>{field.display_name}</b>{field.required ? '' : ' (optional)'} — you can add this from your
        teacher dashboard once your account is created.
      </p>
    );
  }
  if (field.data_type === 'Single-Select') {
    return (
      <label className="tob-field">
        <span>{field.display_name}</span>
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}>
          <option value="">Choose one…</option>
          {(field.allowed_values || []).filter(Boolean).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {touched && missing && <small className="tob-err">Required.</small>}
      </label>
    );
  }
  if (field.data_type === 'Multi-Select') {
    const selected = Array.isArray(value) ? value : [];
    const toggle = (v) => onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    return (
      <fieldset className="tob-field">
        <legend>{field.display_name}</legend>
        <div className="tob-check-grid">
          {(field.allowed_values || []).filter(Boolean).map((v) => (
            <label key={v} className="tob-check">
              <input type="checkbox" checked={selected.includes(v)} onChange={() => toggle(v)} onBlur={onBlur} />
              <span>{v}</span>
            </label>
          ))}
        </div>
        {touched && missing && <small className="tob-err">Required.</small>}
      </fieldset>
    );
  }
  const type =
    field.data_type === 'Email' ? 'email'
      : field.data_type === 'Telephone' ? 'tel'
      : field.data_type === 'URL' ? 'url'
      : field.data_type === 'Date' || field.data_type === 'Date-Past' ? 'date'
      : field.data_type === 'Datetime-Future' ? 'datetime-local'
      : 'text';
  return (
    <label className="tob-field">
      <span>{field.display_name}{field.required ? '' : ' (optional)'}</span>
      <input type={type} value={value || ''} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
      {touched && missing && <small className="tob-err">Required.</small>}
    </label>
  );
}

const css = `
.tob{ background:var(--brand-paper); color:var(--brand-ink); font-family:var(--brand-font-body); padding:48px 20px 80px; }
@media (min-width:820px){ .tob{ padding:72px 32px 104px; } }
.tob-frame{ max-width:640px; margin-inline:auto; }

.tob-eyebrow{
  display:inline-block; margin:0 0 14px; padding:6px 13px;
  border:1px solid var(--brand-line); border-radius:980px;
  background:color-mix(in srgb, var(--brand-surface) 80%, transparent);
  font-size:12.5px; font-weight:600; color:var(--brand-ink-soft);
}
.tob-title{
  font-family:var(--brand-font-display); font-weight:700; letter-spacing:-.02em; line-height:1.08;
  font-size:clamp(1.9rem, 5.6vw, 2.7rem); margin:0 0 10px;
}
.tob-sub{ margin:0 0 28px; font-size:1.02rem; line-height:1.55; color:var(--brand-ink-soft); max-width:52ch; }

.tob-steps{ list-style:none; display:flex; flex-wrap:wrap; gap:10px 18px; margin:0 0 20px; padding:0; }
.tob-steps li{ display:flex; align-items:center; gap:7px; font-size:.82rem; font-weight:600; color:var(--brand-ink-soft); }
.tob-steps li[data-state="current"]{ color:var(--brand-ink); }
.tob-step-dot{
  display:grid; place-items:center; width:22px; height:22px; border-radius:50%; flex:none;
  font-size:.72rem; font-weight:700; background:var(--brand-accent-soft); color:var(--brand-accent);
  border:1px solid transparent;
}
.tob-steps li[data-state="current"] .tob-step-dot{ border-color:var(--brand-accent); }
.tob-steps li[data-state="next"] .tob-step-dot{ background:transparent; border-color:var(--brand-line); color:var(--brand-ink-soft); }

.tob-card{
  background:var(--brand-surface); border:1px solid var(--brand-line); border-radius:var(--radius-lg);
  padding:24px; box-shadow:0 1px 2px color-mix(in srgb, var(--brand-ink) 8%, transparent);
}
@media (min-width:560px){ .tob-card{ padding:30px; } }
.tob-step-h{ margin:0 0 18px; font-family:var(--brand-font-display); font-weight:650; font-size:1.2rem; }

.tob-field{ display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
.tob-field > span{ font-size:.82rem; font-weight:600; color:var(--brand-ink-soft); }
.tob-field > span i{ font-style:normal; font-weight:500; opacity:.8; }
.tob-field input, .tob-field select, .tob-field textarea{
  width:100%; min-height:46px; padding:10px 12px; font:inherit; font-size:16px;
  border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-paper); color:var(--brand-ink);
}
.tob-field textarea{ min-height:76px; resize:vertical; }
.tob-field input:focus, .tob-field select:focus, .tob-field textarea:focus{
  outline:none; border-color:var(--brand-accent);
  box-shadow:0 0 0 4px color-mix(in srgb, var(--brand-accent) 14%, transparent);
}
.tob-two{ display:grid; gap:14px; grid-template-columns:1fr; }
@media (min-width:480px){ .tob-two{ grid-template-columns:1fr 1fr; } }
.tob-phone{ display:flex; align-items:center; border:1px solid var(--brand-line); border-radius:var(--radius); background:var(--brand-paper); overflow:hidden; }
.tob-phone:focus-within{ border-color:var(--brand-accent); box-shadow:0 0 0 4px color-mix(in srgb, var(--brand-accent) 14%, transparent); }
.tob-cc{ padding:0 10px; font-weight:650; color:var(--brand-ink-soft); border-right:1px solid var(--brand-line); align-self:stretch; display:flex; align-items:center; }
.tob-phone input{ border:0; min-height:44px; background:transparent; }
.tob-phone input:focus{ outline:none; box-shadow:none; }

.tob-hint{ margin:0; font-size:.78rem; color:var(--brand-ink-soft); }
.tob-err{ margin:0; font-size:.78rem; font-weight:600; color:#c0392b; }
.tob-err-block{ padding:10px 12px; border-radius:var(--radius); background:color-mix(in srgb, #c0392b 10%, var(--brand-surface)); border:1px solid color-mix(in srgb, #c0392b 24%, var(--brand-line)); }

.tob-field-note{ margin:0 0 16px; padding:10px 12px; border-radius:var(--radius); background:var(--brand-accent-soft); font-size:.84rem; line-height:1.5; color:var(--brand-ink); }
.tob-check-grid{ display:flex; flex-wrap:wrap; gap:8px 16px; }
.tob-check{ display:flex; align-items:center; gap:7px; font-size:.86rem; }
.tob-check input{ width:16px; height:16px; accent-color:var(--brand-accent); }
fieldset.tob-field{ border:0; padding:0; margin:0 0 16px; }
fieldset.tob-field legend{ padding:0; margin:0 0 6px; font-size:.82rem; font-weight:600; color:var(--brand-ink-soft); }

.tob-review{ margin:0 0 16px; display:grid; gap:10px; }
.tob-review > div{ display:flex; justify-content:space-between; gap:12px; padding-bottom:10px; border-bottom:1px solid var(--brand-line); }
.tob-review dt{ font-size:.76rem; font-weight:700; letter-spacing:.03em; text-transform:uppercase; color:var(--brand-ink-soft); }
.tob-review dd{ margin:0; font-weight:600; text-align:right; max-width:60%; }

.tob-actions{ display:flex; justify-content:space-between; gap:12px; margin-top:8px; }
.tob-back{
  min-height:48px; padding:0 18px; border-radius:980px; border:1px solid var(--brand-line);
  background:var(--brand-surface); color:var(--brand-ink); font:inherit; font-weight:650; cursor:pointer;
}
.tob-next{
  flex:1; min-height:48px; padding:0 22px; border-radius:980px; border:0; cursor:pointer;
  background:var(--brand-accent); color:var(--brand-accent-ink); font-family:var(--brand-font-display); font-weight:700; font-size:1rem;
  transition:filter var(--motion) var(--motion-ease);
}
.tob-next:hover{ filter:brightness(1.06); }
.tob-next:disabled, .tob-back:disabled{ opacity:.6; cursor:default; }

.tob-done{ text-align:center; padding:12px 0; }
.tob-done-badge{
  display:grid; place-items:center; width:56px; height:56px; margin:0 auto 18px; border-radius:50%;
  background:var(--brand-accent-soft); color:var(--brand-accent);
}
.tob-done h1{ font-family:var(--brand-font-display); font-weight:700; font-size:1.6rem; margin:0 0 10px; }
.tob-done p{ margin:0 auto 10px; max-width:48ch; color:var(--brand-ink-soft); line-height:1.55; }
.tob-done-next{ font-size:.9rem; }

.tob :is(input,select,textarea,button):focus-visible{ outline:3px solid var(--brand-accent); outline-offset:2px; }
@media (prefers-reduced-motion: reduce){ .tob-next{ transition:none; } }
`;
