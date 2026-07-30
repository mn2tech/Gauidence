"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Camera,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import GlobalVaultSearch from "@/components/GlobalVaultSearch";
import SimpleNavigation from "@/components/simple-home/SimpleNavigation";
import SimpleNewMenu from "@/components/simple-home/SimpleNewMenu";
import { useActiveProfile } from "@/components/ProfileProvider";
import { SIMPLE_HOME_PATH } from "@/lib/simple-home/routing";

export default function SimpleAppShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const needsSetup = !profilesLoading && profiles.length === 0;
  const cameraHref = active
    ? `/dashboard?camera=1#documents-${active.id}`
    : "/dashboard?camera=1";

  async function handleSignOut() {
    const supabase = createClient();
    if (!supabase) return;
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Link
            href={SIMPLE_HOME_PATH}
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            Guardian
          </Link>

          <div className="flex items-center gap-1">
            {!needsSetup ? (
              <>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search vaults"
                  className="rounded-full p-2 text-brand hover:bg-brand-light"
                >
                  <Search className="h-5 w-5" />
                </button>
                <Link
                  href={cameraHref}
                  aria-label="Scan with camera"
                  className="rounded-full p-2 text-brand hover:bg-brand-light"
                >
                  <Camera className="h-5 w-5" />
                </Link>
              </>
            ) : null}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="simple-profile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded-full p-2 text-foreground hover:bg-stone-100"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="simple-profile-menu"
            className="border-t border-stone-200 bg-white px-4 py-3"
          >
            <div className="mb-3">
              <ProfileSwitcher />
            </div>
            <nav className="flex flex-col gap-1">
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-100"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
              <Link
                href="/help"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-100"
              >
                Help
              </Link>
              <Link
                href="/dashboard?docs=1"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-stone-100"
              >
                Classic dashboard
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-100"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="min-h-[calc(100dvh-3.5rem)]">{children}</main>

      {!needsSetup ? (
        <>
          <SimpleNavigation onNewClick={() => setNewOpen(true)} />
          <SimpleNewMenu open={newOpen} onClose={() => setNewOpen(false)} />
          <GlobalVaultSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
          />
        </>
      ) : null}
    </>
  );
}
