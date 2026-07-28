"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Loader2, X } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import {
  canEditGuardianProfile,
  subVaultCreateOptions,
  type GuardianProfile,
  type SubVaultCreateOption,
} from "@/lib/profiles/types";
import { dispatchAwardsFromResponse } from "@/lib/awards/client";

type MenuState = {
  parent: GuardianProfile;
  x: number;
  y: number;
} | null;

type CreateState = {
  parent: GuardianProfile;
  option: SubVaultCreateOption;
} | null;

export function useVaultSubVaultMenu() {
  const { refresh } = useActiveProfile();
  const [menu, setMenu] = useState<MenuState>(null);
  const [create, setCreate] = useState<CreateState>(null);
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const closeCreate = useCallback(() => {
    setCreate(null);
    setDisplayName("");
    setError(null);
  }, []);

  const handleContextMenu = useCallback(
    (e: MouseEvent, parent: GuardianProfile) => {
      if (!canEditGuardianProfile(parent)) return;
      const options = subVaultCreateOptions(parent);
      if (options.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenu({ parent, x: e.clientX, y: e.clientY });
    },
    []
  );

  const pickOption = useCallback(
    (parent: GuardianProfile, option: SubVaultCreateOption) => {
      setCreate({ parent, option });
      setDisplayName("");
      setError(null);
      setMenu(null);
    },
    []
  );

  const submitCreate = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!create || !displayName.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          optionId: create.option.optionId,
          displayName: displayName.trim(),
          parentProfileId: create.parent.id,
          switchTo: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Couldn't create sub-vault.");
        return;
      }
      dispatchAwardsFromResponse(body);
      await refresh();
      window.dispatchEvent(new CustomEvent("guardian:profile-changed"));
      closeCreate();
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!menu) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-vault-sub-menu]")) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu, closeMenu]);

  useEffect(() => {
    if (!create) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) closeCreate();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [create, busy, closeCreate]);

  const menuOptions = menu ? subVaultCreateOptions(menu.parent) : [];

  const overlay = (
    <>
      {menu ? (
        <div
          data-vault-sub-menu
          role="menu"
          aria-label={`Add under ${menu.parent.display_name}`}
          className="fixed z-[100] min-w-[11rem] max-w-[16rem] rounded-xl border border-stone-200 bg-white py-1 shadow-lg"
          style={{
            left: Math.min(menu.x, window.innerWidth - 208),
            top: Math.min(menu.y, window.innerHeight - 280),
          }}
        >
          <p className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Add under {menu.parent.display_name}
          </p>
          {menuOptions.map((opt) => (
            <button
              key={opt.optionId}
              type="button"
              role="menuitem"
              className="block w-full px-3 py-2 text-left text-sm text-foreground hover:bg-stone-50"
              onClick={() => pickOption(menu.parent, opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      {create ? (
        <div
          className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sub-vault-create-title"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) closeCreate();
          }}
        >
          <form
            onSubmit={(e) => void submitCreate(e)}
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl"
            data-vault-sub-menu
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3
                  id="sub-vault-create-title"
                  className="text-base font-semibold text-foreground"
                >
                  {create.option.label}
                </h3>
                <p className="mt-1 text-xs text-ink-muted">
                  Under {create.parent.display_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && closeCreate()}
                disabled={busy}
                aria-label="Close"
                className="rounded-full p-1 text-ink-muted hover:bg-stone-100 hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-ink-muted">
              {create.option.nameLabel}
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={120}
                disabled={busy}
                autoFocus
                className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm text-foreground outline-none ring-brand focus:ring-2 disabled:opacity-50"
              />
            </label>
            {error ? (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !busy && closeCreate()}
                disabled={busy}
                className="rounded-full px-4 py-2 text-sm font-medium text-ink-muted hover:bg-stone-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !displayName.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Create
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );

  return { handleContextMenu, overlay };
}
