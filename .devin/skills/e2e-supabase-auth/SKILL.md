---
name: Supabase auth bypass for manual E2E testing
description: How to obtain and inject a Supabase session cookie when browser login forms do not cooperate with UI automation.
---

## When to use

You are testing a Next.js + Supabase SSR app (`GH-NEW2`) in the browser, but the email/password form does not register keystrokes from automation (React controlled input issue). Rather than get stuck, you can sign in via a one-off Node script and inject the resulting `sb-<project-ref>-auth-token` cookie into the browser.

## Devin Secrets Needed

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Steps

1. Sign in with `@supabase/supabase-js` using a known test account and capture the storage value.

```js
const { createClient } = require("@supabase/supabase-js");

function b64urlEncode(s) {
  return Buffer.from(s, "utf8").toString("base64url").replace(/=+$/, "");
}

let stored = null;
const storage = {
  getItem: (k) => stored ? (k === stored.key ? stored.value : null) : null,
  setItem: (k, v) => { stored = { key: k, value: v }; },
  removeItem: () => { stored = null; },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, storage, autoRefreshToken: false } }
);

const { data, error } = await supabase.auth.signInWithPassword({
  email: "<test-email>",
  password: "<test-password>",
});

console.log("cookie name:", stored.key);
console.log("cookie value:", "base64-" + b64urlEncode(stored.value));
```

2. The cookie name is `sb-<first-part-of-supabase-hostname>-auth-token`, e.g. `sb-gzvixlvkwjsrtmtybtkf-auth-token`.

3. In the Chrome DevTools console, set the cookie and reload:

```js
document.cookie = '<cookie-name>=base64-<base64url-encoded-session-json>; path=/';
window.location.href = 'http://localhost:3000/leaderboard?tab=daily';
```

## Caveats

- The base64 cookie payload is large because it includes the full `user` object; long sessions may exceed the 4 KB single-cookie limit. If so, use the chunked cookie format (`<name>.0`, `<name>.1`) or use Playwright to handle cookies for the browser context.
- The token expires after `expires_in` seconds; refresh it if the test session spans more than an hour.
- This bypass is only for testing; do not use it in production or user-facing flows.

## Alternate approach

If the cookie method also fails, launch Playwright headed and use `page.fill()` on the email/password inputs; Playwright's CDP typing usually triggers React `onChange` correctly. However, screen recordings are captured from the primary display, so ensure the Playwright window is visible there.
