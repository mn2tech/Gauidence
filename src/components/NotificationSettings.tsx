"use client";

import { useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  pushSupported,
  subscribeToGuardianPush,
  unsubscribeFromGuardianPush,
} from "@/lib/push/client";

type Props = {
  userId: string;
  initialPushEnabled: boolean;
};

export default function NotificationSettings({
  userId,
  initialPushEnabled,
}: Props) {
  const supabase = createClient();

  const [pushEnabled, setPushEnabled] = useState(initialPushEnabled);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  async function enablePush() {
    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);
    try {
      const result = await subscribeToGuardianPush();
      if (!result.ok) {
        setPushError(result.error ?? "Couldn't enable notifications.");
        return;
      }
      setPushEnabled(true);
      setPushNotice("Browser notifications are on for this device.");
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    setPushBusy(true);
    setPushError(null);
    setPushNotice(null);
    try {
      await unsubscribeFromGuardianPush();
      if (supabase) {
        await supabase
          .from("profiles")
          .update({ push_notifications_enabled: false })
          .eq("id", userId);
      }
      setPushEnabled(false);
      setPushNotice("Browser notifications turned off.");
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand" />
            <h2 className="text-base font-semibold">Browser notifications</h2>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Get notified on this device when you earn an award or when a
            deadline is due tomorrow. Works best after adding Guardian to your
            home screen.
          </p>
          {pushError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {pushError}
            </p>
          )}
          {pushNotice && (
            <p role="status" className="mt-2 text-sm text-brand-dark">
              {pushNotice}
            </p>
          )}
          {!pushSupported() && (
            <p className="mt-2 text-sm text-ink-muted">
              Notifications aren&apos;t supported in this browser.
            </p>
          )}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {pushEnabled ? (
          <button
            type="button"
            onClick={() => void disablePush()}
            disabled={pushBusy || !pushSupported()}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
          >
            {pushBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Turn off on this device
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void enablePush()}
            disabled={pushBusy || !pushSupported()}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
          >
            {pushBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Enable notifications
          </button>
        )}
      </div>
    </section>
  );
}
