"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Camera, LogOut, Menu, ShieldCheck, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import { useActiveProfile } from "@/components/ProfileProvider";

export default function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { active } = useActiveProfile();
  const [signedIn, setSignedIn] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  async function handleSignOut() {
    const supabase = createClient();
    if (!supabase) return;
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const cameraHref = active
    ? `/dashboard?camera=1#documents-${active.id}`
    : "/dashboard?camera=1";

  const linkClass =
    "block rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition hover:bg-stone-100 sm:inline sm:rounded-none sm:px-0 sm:py-0 sm:font-normal sm:text-ink-muted sm:hover:bg-transparent sm:hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link
          href={signedIn ? "/dashboard" : "/"}
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="h-5 w-5" />
          </span>
          Guardian
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm text-ink-muted sm:flex">
          <Link href="/security" className="hover:text-foreground">
            Security Principles
          </Link>
          {signedIn ? (
            <>
              <ProfileSwitcher />
              <Link
                href={cameraHref}
                aria-label="Scan with camera"
                title="Scan with camera"
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 font-medium text-foreground transition hover:border-stone-400 hover:bg-stone-50"
              >
                <Camera className="h-4 w-4 text-brand" />
                <span className="hidden lg:inline">Scan</span>
              </Link>
              <Link href="/ask" className="hover:text-foreground">
                Ask Gideon
              </Link>
              <Link href="/dashboard" className="hover:text-foreground">
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
          {signedIn ? (
            <Link
              href={cameraHref}
              aria-label="Scan with camera"
              className="inline-flex items-center justify-center rounded-full p-2 text-brand hover:bg-brand-light"
            >
              <Camera className="h-5 w-5" />
            </Link>
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
            <Link href="/security" className={linkClass}>
              Security Principles
            </Link>
            {signedIn ? (
              <>
                <div className="px-3 py-2">
                  <ProfileSwitcher />
                </div>
                <Link href={cameraHref} className={linkClass}>
                  Scan with camera
                </Link>
                <Link href="/ask" className={linkClass}>
                  Ask Gideon
                </Link>
                <Link href="/dashboard" className={linkClass}>
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
  );
}
