"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { History, LayoutGrid, MessageCircle } from "lucide-react";
import GuardianIcon from "@/components/brand/GuardianIcon";
import { MY_WORLD_NAV_LABEL } from "@/lib/profiles/containerLabels";
import {
  ASK_GIDEON_PATH,
  HISTORY_PATH,
  SIMPLE_HOME_PATH,
  VAULTS_PATH,
  WORLD_PATH,
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
  const historyActive =
    isPathActive(pathname, HISTORY_PATH, false) ||
    pathname === "/daily-log" ||
    pathname === "/remember";
  const worldActive =
    isPathActive(pathname, WORLD_PATH, false) ||
    pathname === VAULTS_PATH ||
    pathname.startsWith(`${VAULTS_PATH}/`) ||
    (pathname === "/dashboard" && searchParams.has("docs"));

  return (
    <nav aria-label="Primary" className="simple-nav-bar fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto flex h-[4.25rem] max-w-2xl items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)] sm:px-3">
        <Link
          href={SIMPLE_HOME_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 transition ${
            homeActive ? "text-foreground" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition sm:w-14 ${
              homeActive ? "bg-stone-100" : ""
            }`}
          >
            <GuardianIcon size={20} alt="" />
          </span>
          <span className="truncate text-[10px] font-semibold">Today</span>
        </Link>
        <Link
          href={ASK_GIDEON_PATH}
          prefetch={false}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 transition ${
            askActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition sm:w-14 ${
              askActive ? "bg-brand-light" : ""
            }`}
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">Ask Gideon</span>
        </Link>
        <Link
          href={WORLD_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 transition ${
            worldActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition sm:w-14 ${
              worldActive ? "bg-brand-light" : ""
            }`}
          >
            <LayoutGrid className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">
            {MY_WORLD_NAV_LABEL}
          </span>
        </Link>
        <Link
          href={HISTORY_PATH}
          className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 transition ${
            historyActive ? "text-brand" : "text-ink-muted hover:text-foreground"
          }`}
        >
          <span
            className={`flex h-8 w-12 items-center justify-center rounded-2xl transition sm:w-14 ${
              historyActive ? "bg-brand-light" : ""
            }`}
          >
            <History className="h-5 w-5" aria-hidden />
          </span>
          <span className="truncate text-[10px] font-semibold">History</span>
        </Link>
      </div>
    </nav>
  );
}
