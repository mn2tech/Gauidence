"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";

type ShareRow = {
  id: string;
  token: string;
  expires_at: string;
  include_file: boolean;
  created_at: string;
};

type Props = {
  documentId: string;
  fileName: string;
};

export default function ShareDocumentButton({ documentId, fileName }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [expiresInDays, setExpiresInDays] = useState<1 | 7 | 30>(7);
  const [includeFile, setIncludeFile] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`);
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        shares?: ShareRow[];
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't load shares.");
        setShares([]);
        return;
      }
      setShares(body.shares ?? []);
    } catch {
      setError("Couldn't load shares.");
    } finally {
      setLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const createShare = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiresInDays, includeFile }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
        share?: ShareRow;
      };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create link.");
        return;
      }
      const absolute =
        body.url?.startsWith("http")
          ? body.url
          : `${window.location.origin}${body.url ?? `/share/${body.share?.token}`}`;
      setLastUrl(absolute);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (shareId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareId }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't revoke link.");
        return;
      }
      setLastUrl(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Couldn't copy — select and copy the link manually.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Share ${fileName}`}
        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <Link2 className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-doc-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="share-doc-title" className="text-base font-semibold">
                  Share document
                </h2>
                <p className="mt-1 text-xs text-ink-muted truncate max-w-[16rem]">
                  {fileName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-full p-1.5 text-ink-muted hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-ink-muted">
              Anyone with the link can view the summary and facts until it
              expires or you revoke it. The rest of your vault stays private.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                <span className="font-medium">Expires in</span>
                <select
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(Number(e.target.value) as 1 | 7 | 30)
                  }
                  className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none ring-brand focus:ring-2"
                >
                  <option value={1}>1 day</option>
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                </select>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeFile}
                  onChange={(e) => setIncludeFile(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  <span className="font-medium">Include the file</span>
                  <span className="block text-xs text-ink-muted">
                    Off by default — share summary and facts only.
                  </span>
                </span>
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => void createShare()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4" />
                )}
                Create link
              </button>
            </div>

            {lastUrl && (
              <div className="mt-4 rounded-xl border border-brand/20 bg-brand-light/50 p-3">
                <p className="text-xs font-medium text-brand-dark">New link</p>
                <p className="mt-1 break-all text-xs text-foreground">{lastUrl}</p>
                <button
                  type="button"
                  onClick={() => void copy(lastUrl)}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:text-brand-dark"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            )}

            <div className="mt-5 border-t border-stone-100 pt-4">
              <p className="text-xs font-medium text-ink-muted">Active links</p>
              {loading ? (
                <p className="mt-2 text-xs text-ink-muted">Loading…</p>
              ) : shares.length === 0 ? (
                <p className="mt-2 text-xs text-ink-muted">No active links.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {shares.map((s) => {
                    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/share/${s.token}`;
                    return (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-2.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            Expires{" "}
                            {new Date(s.expires_at).toLocaleDateString()}
                            {s.include_file ? " · with file" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            onClick={() => void copy(url)}
                            className="rounded-full px-2 py-1 font-medium text-brand hover:bg-white"
                          >
                            Copy
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void revoke(s.id)}
                            className="rounded-full px-2 py-1 font-medium text-red-700 hover:bg-white"
                          >
                            Revoke
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
