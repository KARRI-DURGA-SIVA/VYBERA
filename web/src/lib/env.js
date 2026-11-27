// Build target helpers. The Play Store app bundles the site (served from https://localhost
// inside the WebView), so it uses hash routes and needs a public URL for links people share.
export const IS_NATIVE = import.meta.env.VITE_ROUTER === 'hash';

// URL that opens a route inside this app/site (used e.g. as the PayU return address).
export const appUrl = (path) => (IS_NATIVE ? `${window.location.origin}/index.html#${path}` : `${window.location.origin}${path}`);

// URL for links shared with other people (must be a real website, not the app's local origin).
export const publicUrl = (path = '') => `${import.meta.env.VITE_PUBLIC_URL || window.location.origin}${path}`;

// Partners portal build (staff + creator sign-in only), e.g. `npm run dev:portal` on :5175.
export const IS_PORTAL = import.meta.env.VITE_PORTAL === '1';
export const STAFF_LOGIN = IS_PORTAL ? '/staff/login' : '/login?as=staff';
