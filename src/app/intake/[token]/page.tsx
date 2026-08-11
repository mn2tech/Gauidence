import type { Metadata } from "next";
import ContractorIntakePortal from "@/components/intake/ContractorIntakePortal";

export const metadata: Metadata = {
  title: "Secure Information Request — Guardian",
  description: "Submit onboarding information securely.",
};

type PageProps = { params: Promise<{ token: string }> };

export default async function IntakePage({ params }: PageProps) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-stone-950">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <ContractorIntakePortal token={token} />
      </main>
      <footer className="border-t border-stone-800 py-6 text-center text-xs text-stone-600">
        Secure intake powered by Guardian
      </footer>
    </div>
  );
}
