"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MessageCircle, FolderOpen, Plus } from "lucide-react";
import {
  ASK_GIDEON_PATH,
  SIMPLE_HOME_PATH,
  VAULTS_PATH,
} from "@/lib/simple-home/routing";

type SimpleNavigationProps = {
  onNewClick: () => void;
};

const ITEMS = [
  { href: SIMPLE_HOME_PATH, label: "Home", icon: Home, exact: true },
  { href: ASK_GIDEON_PATH, label: "Ask Gideon", icon: MessageCircle, exact: false },
  { href: VAULTS_PATH, label: "Vaults", icon: FolderOpen, exact: false },
] as const;

function isActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SimpleNavigation({ onNewClick }: SimpleNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex h-16 max-w-2xl items-stretch justify-around px-2">
        {ITEMS.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition ${
                active ? "text-brand" : "text-ink-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onNewClick}
          className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium text-ink-muted transition hover:text-foreground"
        >
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
            <Plus className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span>New</span>
        </button>
      </div>
    </nav>
  );
}
