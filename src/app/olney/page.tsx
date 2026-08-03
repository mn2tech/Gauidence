import type { Metadata } from "next";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OlneyNnoLanding from "@/components/campaigns/OlneyNnoLanding";

export const metadata: Metadata = {
  title: "Olney National Night Out — Guardian",
  description:
    "Complimentary Guardian access for Olney National Night Out — private document vault, deadline alerts, and Ask Gideon in plain language.",
};

export default function OlneyNnoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-12 sm:py-16">
        <OlneyNnoLanding />
      </main>
      <SiteFooter />
    </div>
  );
}
