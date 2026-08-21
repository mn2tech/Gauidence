import Image from "next/image";
import Link from "next/link";

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-stone-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted sm:flex-row">
        <p>© {year} NM2TECH LLC. All rights reserved.</p>
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link href="/ai-disclaimer" className="hover:text-foreground">
            AI Disclaimer
          </Link>
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
          <a
            href="mailto:support@nm2tech.com"
            className="hover:text-foreground"
          >
            Contact
          </a>
          <Link href="/pricing" className="hover:text-foreground">
            Pricing
          </Link>
          <Link href="/help" className="hover:text-foreground">
            Help
          </Link>
        </nav>
      </div>
      <div className="border-t border-stone-100">
        <div className="mx-auto flex max-w-6xl items-center justify-center gap-3 px-6 py-5">
          <span className="text-xs uppercase tracking-widest text-ink-muted">
            Designed by
          </span>
          <a
            href="https://nm2tech.com"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="NM2TECH — Next Move"
            className="flex items-center rounded-xl bg-black px-3 py-1.5 transition hover:opacity-80"
          >
            <Image
              src="/nm2tech-logo.png"
              alt="NM2TECH — Next Move"
              width={96}
              height={64}
              className="h-10 w-auto"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
