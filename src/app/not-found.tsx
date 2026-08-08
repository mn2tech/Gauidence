import type { Metadata } from "next";
import ErrorPageShell, {
  ErrorPagePrimaryAction,
  ErrorPageSecondaryAction,
} from "@/components/ErrorPageShell";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <ErrorPageShell
      code="404"
      title="This page isn't in your vault"
      description="The link may be broken, expired, or the page may have been moved. Head back to Guardian and try again."
      actions={
        <>
          <ErrorPagePrimaryAction href="/">Go home</ErrorPagePrimaryAction>
          <ErrorPageSecondaryAction href="/help">Help center</ErrorPageSecondaryAction>
        </>
      }
    />
  );
}
