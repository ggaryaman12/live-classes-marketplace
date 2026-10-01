// SAFELY RENDER A PLAIN-TEXT HEADING AS HTML.
//
// Hero titles support one piece of markup — a line break from a newline — so the
// renderers feed the title to dangerouslySetInnerHTML. That made the title a
// stored-XSS sink: a value carrying <script>/<svg onload=…>/<img onerror=…> was
// injected and RUN, and one "set the title to <a scraped listing page>" edit put
// a page of markup straight into a hero.
//
// So escape every HTML metacharacter FIRST — the text can no longer open a tag or
// an attribute — THEN turn newlines into <br/>, which is added after escaping so it
// survives as the only live markup. Titles set through the editor are plain text,
// so this changes nothing a real storefront shows; it only ever neutralises markup
// that should never have been in a title.
export function titleHtml(text) {
  const escaped = String(text == null ? '' : text)
    .replace(/&/g, '&amp;')      // must be first, or it double-escapes the entities below
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped.replace(/\n/g, '<br/>');
}
