"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type Props = {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

function storageKey(id: string) {
  return `guardian:vault-section:${id}`;
}

export default function VaultSection({
  id,
  title,
  defaultOpen = true,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey(id));
      if (saved === "0") setOpen(false);
      else if (saved === "1") setOpen(true);
    } catch {
      /* ignore */
    }
    setReady(true);
  }, [id]);

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
    <section className="space-y-2">
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
