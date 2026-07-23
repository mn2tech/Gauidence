"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Camera, LogOut, Menu, Search, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import { useActiveProfile } from "@/components/ProfileProvider";
import GlobalVaultSearch from "@/components/GlobalVaultSearch";
import { DOCUMENTS_PATH } from "@/lib/routes";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { active, profiles, loading: profilesLoading } = useActiveProfile();
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => {
      setSignedIn(!!data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const needsSetup = signedIn && !profilesLoading && profiles.length === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "k") return;
      if (!signedIn || needsSetup) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [signedIn, needsSetup]);

  async function handleSignOut() {
    const supabase = createClient();
    if (!supabase) return;
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const cameraHref = needsSetup
    ? "/ask"
    : active
      ? `/dashboard?camera=1#documents-${active.id}`
      : "/dashboard?camera=1";
  const askHref = "/ask";
  const researchHref = needsSetup ? "/ask" : "/research";

  const linkClass =
    "block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-stone-100 sm:inline sm:rounded-none sm:px-0 sm:py-0 sm:font-normal sm:text-ink-muted sm:hover:bg-transparent sm:hover:text-foreground";

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link
          href={signedIn ? "/ask" : "/"}
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          Guardian
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm text-ink-muted sm:flex">
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/security" className="hover:text-foreground">
            Security Principles
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Help
          </Link>
          {signedIn ? (
            <>
              <ProfileSwitcher />
              {!needsSetup ? (
                <>
                  <button
                    type="button"
                    onClick={() => setSearchOpen(true)}
                    aria-label="Search vaults"
                    title="Search (Ctrl+K)"
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50"
                  >
                    <Search className="h-4 w-4 text-brand" />
                    <span className="hidden lg:inline">Search</span>
                    <kbd className="hidden rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted xl:inline">
                      ⌘K
                    </kbd>
                  </button>
                  <Link
                    href={cameraHref}
                    aria-label="Scan with camera"
                    title="Scan with camera"
                    className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50"
                  >
                    <Camera className="h-4 w-4 text-brand" />
                    <span className="hidden lg:inline">Scan</span>
                  </Link>
                </>
              ) : null}
              <Link href={askHref} className="hover:text-foreground">
                Ask Gideon
              </Link>
              <Link href={researchHref} className="hover:text-foreground">
                Research
              </Link>
              <Link href="/work-memory" className="hover:text-foreground">
                Work Memory
              </Link>
              <Link href="/experts" className="hover:text-foreground">
                Experts
              </Link>
              <Link href={DOCUMENTS_PATH} className="hover:text-foreground">
                Documents
              </Link>
              <Link
                href="/settings"
                className="rounded-full border border-stone-300 bg-white px-4 py-2 font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50"
              >
                Settings
              </Link>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="hover:text-foreground">
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
              >
                Get started
              </Link>
            </>
          )}
        </nav>

        {/* Mobile: scan + menu */}
        <div className="flex items-center gap-1 sm:hidden">
          {signedIn && !needsSetup ? (
            <>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search vaults"
                className="inline-flex items-center justify-center rounded-full p-2 text-brand hover:bg-brand-light"
              >
                <Search className="h-5 w-5" />
              </button>
              <Link
                href={cameraHref}
                aria-label="Scan with camera"
                className="inline-flex items-center justify-center rounded-full p-2 text-brand hover:bg-brand-light"
              >
                <Camera className="h-5 w-5" />
              </Link>
            </>
          ) : null}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full p-2 text-foreground hover:bg-stone-100"
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          id="mobile-nav"
          className="border-t border-stone-200 bg-white px-4 py-3 sm:hidden"
        >
          <nav className="flex flex-col gap-1">
            <Link href="/pricing" className={linkClass}>
              Pricing
            </Link>
            <Link href="/security" className={linkClass}>
              Security Principles
            </Link>
            <Link href="/help" className={linkClass}>
              Help &amp; Quick Start
            </Link>
            {signedIn ? (
              <>
                <div className="px-3 py-2">
                  <ProfileSwitcher />
                </div>
                {!needsSetup ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        setSearchOpen(true);
                      }}
                      className={linkClass}
                    >
                      Search vaults
                    </button>
                    <Link href={cameraHref} className={linkClass}>
                      Scan with camera
                    </Link>
                  </>
                ) : null}
                <Link href={askHref} className={linkClass}>
                  Ask Gideon
                </Link>
                <Link href={researchHref} className={linkClass}>
                  Research
                </Link>
                <Link href="/work-memory" className={linkClass}>
                  Work Memory
                </Link>
                <Link href="/experts" className={linkClass}>
                  Experts
                </Link>
                <Link href={DOCUMENTS_PATH} className={linkClass}>
                  Documents
                </Link>
                <Link href="/settings" className={linkClass}>
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-stone-100"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className={linkClass}>
                  Log in
                </Link>
                <Link
                  href="/signup"
                  className="mt-1 rounded-full bg-brand px-3 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Get started
                </Link>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
      {signedIn && !needsSetup ? (
        <GlobalVaultSearch
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      ) : null}
    </>
  );
}
