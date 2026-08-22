import type { Metadata } from "next";
import PublicCrossroadsAssistant from "./PublicCrossroadsAssistant";

export const metadata: Metadata = {
  title: "Crossroads Connect Assistant — Guardian",
  description:
    "Ask about approved Crossroads Connect event and organization information.",
};

export default function CrossroadsConnectPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-12 md:py-20">
      <PublicCrossroadsAssistant />
    </main>
  );
}
