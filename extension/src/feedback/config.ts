/**
 * Web3Forms access_key for feedback submissions.
 *
 * SETUP (one-time):
 *   1. Go to https://web3forms.com
 *   2. Enter your email — they will send an access_key
 *   3. Paste it below, or set env var IMPACTFLOW_WEB3FORMS_KEY at build time
 *
 * Until configured, the extension falls back to GitHub Issues for feedback.
 */
export const WEB3FORMS_ACCESS_KEY: string =
  process.env.IMPACTFLOW_WEB3FORMS_KEY ?? 'REPLACE_WITH_YOUR_WEB3FORMS_ACCESS_KEY';
