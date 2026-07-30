"use client";

import QRCode from "react-qr-code";
import { QrCode } from "lucide-react";

type Props = {
  shareUrl: string;
};

export default function ShareGuardianCard({ shareUrl }: Props) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-light text-brand">
          <QrCode className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Share Guardian</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Have someone scan this code to try Guardian — they&apos;ll go straight
            to a free signup.
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <div
          className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
          aria-label={`QR code linking to ${shareUrl}`}
        >
          <QRCode
            value={shareUrl}
            size={200}
            level="M"
            bgColor="#ffffff"
            fgColor="#1c1917"
            title="Try Guardian signup link"
          />
        </div>
        <p className="mt-4 text-center text-sm font-medium text-foreground">
          Scan to try Guardian
        </p>
        <p className="mt-1 max-w-xs text-center text-xs text-ink-muted">
          Point a phone camera at the code, or open the Camera app and tap the
          link that appears.
        </p>
      </div>
    </section>
  );
}
