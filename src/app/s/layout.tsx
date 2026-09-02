import {
  GUARDIAN_START_SPLASH_ACTIVE_CLASS,
  GUARDIAN_START_SPLASH_SEEN_CLASS,
} from "@/lib/branding/startSplash";

/** Hide the SSR splash boot cover immediately on public summit pages. */
const SUMMIT_BOOT_SCRIPT = `(function(){try{document.documentElement.classList.add(${JSON.stringify(GUARDIAN_START_SPLASH_SEEN_CLASS)});document.documentElement.classList.remove(${JSON.stringify(GUARDIAN_START_SPLASH_ACTIVE_CLASS)});}catch(e){}})();`;

export default function SummitPublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: SUMMIT_BOOT_SCRIPT }} />
      {children}
    </>
  );
}
