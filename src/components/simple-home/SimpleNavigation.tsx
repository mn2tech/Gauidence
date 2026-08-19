"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { MessageCircle, LayoutGrid } from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import { SPACES_NAV_LABEL } from "@/lib/profiles/types";
import {
  ASK_GIDEON_PATH,
  SIMPLE_HOME_PATH,
  VAULTS_PATH,
} from "@/lib/simple-home/routing";

function isPathActive(pathname: string, href: string, exact: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SimpleNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const homeActive = isPathActive(pathname, SIMPLE_HOME_PATH, true);
  const askActive = isPathActive(pathname, ASK_GIDEON_PATH, false);
  const spacesActive =
    pathname === VAULTS_PATH ||
    pathname.startsWith(`${VAULTS_PATH}/`) ||
    (pathname === "/dashboard" && searchParams.has("docs"));

  return (
    <nav aria-label="Primary" className="simple-nav-bar fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex h-[4.25rem] max-w-2xl items-stretch justify-around px-3 pb-[env(safe-area-inset-bottom)]">
        <Link
          href={SIMPLE_HOME_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition ${
            homeActive ? "text-foreground" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
              homeActive ? "bg-stone-100" : ""
            }`}
          >
            <GuardianIcon size={20} surface="black" alt="" />
          </span>
          <span className="truncate text-[10px] font-semibold">Home</span>
        </Link>
        <Link
          href={ASK_GIDEON_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition ${
            askActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
              askActive ? "bg-brand-light" : ""
            }`}
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">Ask Gideon</span>
        </Link>
        <Link
          href={VAULTS_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 transition ${
            spacesActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-14 items-center justify-center rounded-2xl transition ${
              spacesActive ? "bg-brand-light" : ""
            }`}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">{SPACES_NAV_LABEL}</span>
        </Link>
      </div>
    </nav>
  );
}
