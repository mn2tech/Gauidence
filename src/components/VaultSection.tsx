"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  id: string;
  title: string;
  /** When false, section starts collapsed unless opened via hash or jump nav. */
  defaultOpen?: boolean;
  children: ReactNode;
};

function storageKey(id: string) {
  return `guardian:vault-section:v2:${id}`;
}

export default function VaultSection({
  id,
  title,
  defaultOpen = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  const openSection = useCallback((scroll = true) => {
    setOpen(true);
    try {
      localStorage.setItem(storageKey(id), "1");
    } catch {
      /* ignore */
    }
    if (!scroll) return;
    window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [id]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(id));
      if (saved === "0") setOpen(false);
      else if (saved === "1") setOpen(true);
      else setOpen(defaultOpen);
    } catch {
      setOpen(defaultOpen);
    }
    setReady(true);
  }, [id, defaultOpen]);

  useEffect(() => {
    const applyDeepLink = () => {
      if (typeof window === "undefined") return;
      const hashMatch = window.location.hash === `#${id}`;
      const cameraDocs =
        id.startsWith("documents-") &&
        new URLSearchParams(window.location.search).get("camera") === "1";
      const logDeepLink =
        id.startsWith("daily-log-") &&
        new URLSearchParams(window.location.search).has("logId");
      if (!hashMatch && !cameraDocs && !logDeepLink) return;
      openSection();
    };

    const onJump = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === id) openSection();
    };

    applyDeepLink();
    window.addEventListener("hashchange", applyDeepLink);
    window.addEventListener("guardian:vault-section-open", onJump);
    return () => {
      window.removeEventListener("hashchange", applyDeepLink);
      window.removeEventListener("guardian:vault-section-open", onJump);
    };
  }, [id, openSection]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey(id), next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <section id={id} className="scroll-mt-36 space-y-2">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-xl px-1 py-1.5 text-left transition hover:bg-stone-100/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {ready && open ? children : null}
      {!ready && defaultOpen ? children : null}
    </section>
  );
}

export function openVaultSection(sectionId: string) {
  if (typeof window === "undefined") return;
  const nextHash = `#${sectionId}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = sectionId;
    return;
  }
  window.dispatchEvent(
    new CustomEvent("guardian:vault-section-open", {
      detail: { id: sectionId },
    })
  );
}
