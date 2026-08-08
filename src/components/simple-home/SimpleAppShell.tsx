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
import SimpleSecondaryNavLinks from "@/components/simple-home/SimpleSecondaryNavLinks";
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
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-md transition-colors ${
          menuOpen
            ? "border-brand/15 bg-brand-light/50"
            : "border-border-subtle bg-surface/90"
        }`}
      >
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
          <Link
            href={SIMPLE_HOME_PATH}
            className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
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
                  aria-label="Search spaces and content"
                  className="rounded-full p-2 text-brand transition hover:bg-brand-light"
                >
                  <Search className="h-5 w-5" />
                </button>
                <Link
                  href={cameraHref}
                  aria-label="Scan with camera"
                  className="rounded-full p-2 text-brand transition hover:bg-brand-light"
                >
                  <Camera className="h-5 w-5" />
                </Link>
              </>
            ) : null}
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-controls="simple-profile-menu"
              aria-label={
                menuOpen
                  ? "Close account and tools menu"
                  : "Open account and tools menu"
              }
              onClick={() => setMenuOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${
                menuOpen
                  ? "border-brand/30 bg-brand text-white"
                  : "border-border-subtle bg-surface text-foreground hover:bg-brand-light/50"
              }`}
            >
              {menuOpen ? (
                <X className="h-4 w-4" />
              ) : (
                <>
                  <Menu className="h-4 w-4" />
                  <span>Account &amp; tools</span>
                </>
              )}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div
            id="simple-profile-menu"
            className="border-t border-brand/10 bg-surface px-4 py-4 shadow-card"
          >
            <div className="mb-3 rounded-xl border border-border-subtle bg-background p-3">
              <ProfileSwitcher />
            </div>
            <nav className="flex flex-col gap-0.5">
              <SimpleSecondaryNavLinks onNavigate={() => setMenuOpen(false)} />
              <Link
                href="/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-brand-light/50"
              >
                <Settings className="h-4 w-4 text-brand" />
                Settings
              </Link>
              <Link
                href="/help"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-brand-light/50"
              >
                Help
              </Link>
              <Link
                href="/dashboard?docs=1"
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-brand-light/50"
              >
                Classic dashboard
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:bg-brand-light/50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </nav>
          </div>
        ) : null}
      </header>

      <main className="min-h-[calc(100dvh-3.5rem)] pb-simple-nav-page">
        {children}
      </main>

      {!needsSetup ? (
        <>
          <SimpleNavigation />
          <GlobalVaultSearch
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            defaultScope="global"
          />
        </>
      ) : null}
    </>
  );
}
