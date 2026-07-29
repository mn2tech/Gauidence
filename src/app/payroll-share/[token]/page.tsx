import type { Metadata } from "next";
import ExternalPayrollPortal from "@/components/payroll/ExternalPayrollPortal";

export const metadata: Metadata = {
  title: "Secure Payroll Report — Guardian",
  description: "View your approved payroll report securely.",
};

type PageProps = { params: Promise<{ token: string }> };

export default async function PayrollSharePage({ params }: PageProps) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-stone-950">
      <main className="mx-auto max-w-4xl px-6 py-12">
        <ExternalPayrollPortal token={token} />
      </main>
      <footer className="border-t border-stone-800 py-6 text-center text-xs text-stone-600">
        Secure Payroll Report powered by Guardian
      </footer>
    </div>
  );
}
