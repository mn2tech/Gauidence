"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Home, MessageCircle, FolderOpen, Plus } from "lucide-react";
import { useActiveProfile } from "@/components/ProfileProvider";
import { DOCUMENTS_PATH, documentsHref } from "@/lib/routes";
import { ASK_GIDEON_PATH, SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

type SimpleNavigationProps = {
  onNewClick: () => void;
};

const STATIC_ITEMS = [
  { id: "home", href: SIMPLE_HOME_PATH, label: "Home", icon: Home, exact: true },
  {
    id: "ask",
    href: ASK_GIDEON_PATH,
    label: "Ask Gideon",
    icon: MessageCircle,
    exact: false,
  },
] as const;

function isPathActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function isVaultWorkspaceActive(
  pathname: string,
  searchParams: URLSearchParams
) {
  if (pathname !== "/dashboard") return false;
  return (
    searchParams.has("docs") ||
    searchParams.has("camera") ||
    searchParams.has("documentId") ||
    searchParams.has("logId") ||
    searchParams.has("profileId")
  );
}

export default function SimpleNavigation({ onNewClick }: SimpleNavigationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { active } = useActiveProfile();
  const vaultHref = active ? documentsHref(active.id) : DOCUMENTS_PATH;
  const vaultActive = isVaultWorkspaceActive(pathname, searchParams);

  return (
    <nav aria-label="Primary" className="simple-nav-bar fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex h-[4.25rem] max-w-2xl items-stretch justify-around px-3 pb-[env(safe-area-inset-bottom)]">
        {STATIC_ITEMS.map((item) => {
          const itemActive = isPathActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition ${
                itemActive ? "text-brand" : "text-ink-muted hover:text-foreground"
              }`}
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
                  itemActive ? "bg-brand-light" : ""
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="truncate text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
        <Link
          href={vaultHref}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition ${
            vaultActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
              vaultActive ? "bg-brand-light" : ""
            }`}
          >
            <FolderOpen className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">Vault</span>
        </Link>
        <button
          type="button"
          onClick={onNewClick}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-ink-muted transition hover:text-foreground"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white shadow-sm ring-4 ring-brand-light/80">
            <Plus className="h-4 w-4" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">New</span>
        </button>
      </div>
    </nav>
  );
}
