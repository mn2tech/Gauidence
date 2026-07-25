/** Document analysis server budget on Vercel (seconds). Must match route maxDuration literals. */
export const ANALYZE_MAX_DURATION_SEC = 300;

/** Abort client fetches slightly before the server limit (ms). */
export const ANALYZE_CLIENT_TIMEOUT_MS = 290_000;
