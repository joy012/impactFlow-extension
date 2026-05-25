// Web3Forms access_key — read from env at build time. NEVER commit a real key here.
//
// SETUP (one-time, for the maintainer publishing the extension):
//   1. Go to https://web3forms.com → enter destination email → get access_key.
//   2. Restrict the key to your publish domain in the Web3Forms console
//      (Settings → Domain Restriction). This caps the blast radius if the key
//      is ever extracted from the compiled JS — see audit item S1.
//   3. Set IMPACTFLOW_WEB3FORMS_KEY at build time:
//         IMPACTFLOW_WEB3FORMS_KEY=ak_live_xxx pnpm --filter extension package
//
// When unset (default), the feedback form falls back to opening a pre-filled
// GitHub issue — no inline submission, no key leakage.
//
// SECURITY NOTE (audit S4):
// Submissions go over HTTPS but with no SRI / cert pinning. This is acceptable
// for v1 because (a) every submission is opt-in and user-initiated, (b) the
// payload contains no source code or secrets (only title + description + the
// optional log lines, which have absolute paths scrubbed per S3), and (c) the
// trust anchor is the user's OS certificate store, the same one VS Code uses
// for its own update channel. We re-evaluate if we ever ship endpoint changes.
export const WEB3FORMS_ACCESS_KEY: string = process.env.IMPACTFLOW_WEB3FORMS_KEY ?? '';
