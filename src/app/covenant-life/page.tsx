import type { Metadata } from "next";
import PublicCovenantLifeAssistant from "./PublicCovenantLifeAssistant";

export const metadata: Metadata = {
  title: "Ask about Covenant Life School — Guardian",
  description:
    "Ask Gideon about approved public Covenant Life School information for families.",
};

export default function CovenantLifePublicPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-5 py-12 md:py-20">
      <PublicCovenantLifeAssistant />
    </main>
  );
}
