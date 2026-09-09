import './globals.css';
// THE WORKSPACE'S THEME. Mirrored here from the workspace's own tokens.css by
// app/lib/customSync.js. This import is the entire reason the constitution's
// "write tokens.css before any component" instruction means anything — without
// it the model wrote a design-token file that nothing on earth imported, and a
// theme could only ever reach the components that happened to hardcode it.
//
// AFTER globals.css, deliberately. Both declare on :root at equal specificity,
// so the later file wins and the workspace's palette overrides the defaults.
import './custom/tokens.css';
import { CartProvider } from './lib/cart';
// The project's own Header when it has one, else the shipped default.
import { Chrome } from './lib/chromeReg';
import LiveRefresh from './LiveRefresh';
import ThemedCursor from './ThemedCursor';
import ThemeSwitch from './ThemeSwitch';
import BackendNotice from './BackendNotice';

// THE BROWSER TAB IS BRANDING TOO, and it is the surface nobody checks — the
// Studio preview is an iframe, so the tab title is invisible for the entire time a
// project is being built. It only shows up once somebody opens their own exported
// repo, which is exactly how this was found. See app/lib/siteName.js.
import { siteName, isUnnamed } from './lib/siteName';

export const metadata = {
  title: siteName(),
  description: isUnnamed()
    ? 'A marketplace storefront built with YELO Studio.'
    : `${siteName()} — built with YELO Studio.`,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* BEFORE FIRST PAINT, or a dark-mode visitor gets a white flash on
            every navigation. This runs ahead of React, reads the stored choice
            and stamps data-theme on <html> synchronously. It is the single
            reason this feature does not look cheap. Wrapped in try/catch
            because a browser with storage disabled must still render. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var m=localStorage.getItem('yelo-theme');if(m==='dark'||m==='light')document.documentElement.setAttribute('data-theme',m)}catch(e){}",
          }}
        />
      </head>
      <body>
        <CartProvider>
          <LiveRefresh />
          {/* Site-wide because it is a property of the THEME, not of a page —
              set --cursor once and it is true on every route, including the
              ones the build AI does not own. Renders nothing unless the token
              asks for it, and nothing at all on touch or under reduced motion. */}
          <ThemedCursor />
          <Chrome.Header />
          <ThemeSwitch />
          {/* An outage must LOOK like an outage. Above the content, because a
              tenant who sees an empty store needs the reason before the void. */}
          <BackendNotice />
          <main className="app-main">{children}</main>
        </CartProvider>
      </body>
    </html>
  );
}
