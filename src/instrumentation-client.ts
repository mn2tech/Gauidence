import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

const CHUNK_RELOAD_KEY = "guardian:chunk-reload";

function isChunkLoadFailure(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  const name = error instanceof Error ? error.name : "";

  if (name === "ChunkLoadError" || /Loading chunk [\w-]+ failed/i.test(message)) {
    return true;
  }

  return /Failed to fetch/i.test(message) && /\/_next\/static\/chunks\//i.test(message);
}

function isChunkScriptTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLScriptElement)) return false;
  return /\/_next\/static\/chunks\//.test(target.src);
}

function chunkReloadAlreadyAttempted(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
  } catch {
    return false;
  }
}

function tryRecoverFromChunkLoadFailure(): boolean {
  if (typeof window === "undefined" || chunkReloadAlreadyAttempted()) return false;

  try {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("load", () => {
    try {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    } catch {
      /* ignore */
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (!isChunkLoadFailure(event.reason)) return;
    if (tryRecoverFromChunkLoadFailure()) event.preventDefault();
  });

  window.addEventListener(
    "error",
    (event) => {
      const chunkFailure =
        isChunkLoadFailure(event.error ?? event.message) ||
        isChunkScriptTarget(event.target);
      if (!chunkFailure) return;
      if (tryRecoverFromChunkLoadFailure()) event.preventDefault();
    },
    true
  );
}

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  beforeSend(event, hint) {
    const error = hint.originalException;
    const frames = event.exception?.values?.[0]?.stacktrace?.frames;
    const chunkFrame = frames?.some((frame) =>
      frame.filename?.includes("/_next/static/chunks/")
    );

    if (
      (isChunkLoadFailure(error) || chunkFrame) &&
      !chunkReloadAlreadyAttempted()
    ) {
      return null;
    }

    return event;
  },
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
