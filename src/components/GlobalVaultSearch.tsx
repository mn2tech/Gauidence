"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  MessageCircle,
  NotebookPen,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  groupSearchResults,
  type SearchResult,
  type SearchResultKind,
  withSearchTerm,
} from "@/lib/search";

const KIND_META: Record<
  SearchResultKind,
  { label: string; icon: typeof Search }
> = {
  profile: { label: "People & spaces", icon: UserRound },
  daily_log: { label: "Daily Logs", icon: NotebookPen },
  document: { label: "Documents", icon: FileText },
  chat: { label: "Gideon conversations", icon: MessageCircle },
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function GlobalVaultSearch({ open, onClose }: Props) {
  const router = useRouter();
  const { switchProfile, active } = useActiveProfile();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setError(null);
    setActiveIndex(0);
    // Prefer immediate focus so iOS still treats it as part of the tap gesture.
    inputRef.current?.focus({ preventScroll: true });
    const t = window.setTimeout(() => {
      inputRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/vault/search?q=${encodeURIComponent(q)}`
        );
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          results?: SearchResult[];
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(body.error ?? "Search failed.");
          setResults([]);
          return;
        }
        setResults(body.results ?? []);
        setActiveIndex(0);
      } catch {
        if (!cancelled) {
          setError("Search failed. Check your connection.");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, open]);

  const flat = results;
  const grouped = useMemo(() => groupSearchResults(flat), [flat]);

  const openResult = useCallback(
    async (result: SearchResult) => {
      if (navigating) return;
      setNavigating(true);
      try {
        if (active?.id !== result.profileId) {
          const ok = await switchProfile(result.profileId);
          if (!ok) {
            setError("Couldn't open that vault.");
            return;
          }
        }
        onClose();
        router.push(withSearchTerm(result.href, query));
        router.refresh();
      } finally {
        setNavigating(false);
      }
    },
    [active?.id, navigating, onClose, query, router, switchProfile]
  );

  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = flat[activeIndex];
      if (hit) void openResult(hit);
    }
  };

  if (!open || !mounted) return null;

  const sections: { key: SearchResultKind; items: SearchResult[] }[] = [
    { key: "profile", items: grouped.profiles },
    { key: "daily_log", items: grouped.dailyLogs },
    { key: "document", items: grouped.documents },
    { key: "chat", items: grouped.chats },
  ];

  let runningIndex = -1;

  const overlay = (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-center bg-stone-900/50 p-0 sm:items-start sm:p-6 sm:pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Search your vaults"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[100dvh] w-full max-w-none flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[min(70vh,560px)] sm:max-w-xl sm:rounded-2xl sm:border sm:border-stone-200"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-stone-200 px-3 py-3 sm:px-4 sm:py-2.5">
          <Search className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search people, logs, documents…"
            enterKeyHint="search"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-muted sm:text-sm"
          />
          {loading || navigating ? (
            <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-muted hover:bg-stone-100 hover:text-foreground"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div
          id={listId}
          role="listbox"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2 sm:px-3"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          {error ? (
            <p className="px-2 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}

          {query.trim().length > 0 && query.trim().length < 2 ? (
            <p className="px-2 py-3 text-sm text-ink-muted">
              Type at least 2 characters.
            </p>
          ) : null}

          {!loading &&
          query.trim().length >= 2 &&
          flat.length === 0 &&
          !error ? (
            <p className="px-2 py-3 text-sm text-ink-muted">
              No matches for &ldquo;{query.trim()}&rdquo; in your vaults.
            </p>
          ) : null}

          {query.trim().length < 2 && !error ? (
            <p className="px-2 py-3 text-sm text-ink-muted">
              Find a person, a note like &ldquo;Sephora,&rdquo; a document, or a
              Gideon chat — we&apos;ll show which vault it lives in.
            </p>
          ) : null}

          {sections.map(({ key, items }) => {
            if (items.length === 0) return null;
            const meta = KIND_META[key];
            const Icon = meta.icon;
            return (
              <div key={key} className="mb-3">
                <p className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {meta.label}
                </p>
                <ul className="space-y-0.5">
                  {items.map((item) => {
                    runningIndex += 1;
                    const index = runningIndex;
                    const selected = index === activeIndex;
                    return (
                      <li key={`${item.kind}-${item.id}`}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => void openResult(item)}
                          className={`flex w-full flex-col rounded-xl px-3 py-2.5 text-left transition active:bg-brand-light ${
                            selected
                              ? "bg-brand-light text-brand-dark"
                              : "hover:bg-stone-50"
                          }`}
                        >
                          <span className="truncate text-sm font-medium text-foreground">
                            {item.title}
                          </span>
                          <span className="truncate text-[11px] text-ink-muted">
                            {item.profilePath}
                          </span>
                          {item.snippet ? (
                            <span className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                              {item.snippet}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
