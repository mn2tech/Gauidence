"use client";

import { useState } from "react";
import { Bell, Loader2, Smartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  pushSupported,
  subscribeToGuardianPush,
  unsubscribeFromGuardianPush,
} from "@/lib/push/client";
import { normalizePhoneE164 } from "@/lib/sms/phone";

type Props = {
  userId: string;
  initialPushEnabled: boolean;
  initialSmsEnabled: boolean;
  initialPhone: string;
};

export default function NotificationSettings({
  userId,
  initialPushEnabled,
  initialSmsEnabled,
  initialPhone,
}: Props) {
  const supabase = createClient();

  const [pushEnabled, setPushEnabled] = useState(initialPushEnabled);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushNotice, setPushNotice] = useState<string | null>(null);

  const [phone, setPhone] = useState(initialPhone);
  const [smsEnabled, setSmsEnabled] = useState(initialSmsEnabled);
  const [smsBusy, setSmsBusy] = useState(false);
  const [smsError, setSmsError] = useState<string | null>(null);
  const [phoneSaved, setPhoneSaved] = useState(false);

  const inputClass =
    "mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

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

  async function savePhone() {
    if (!supabase) return;
    setSmsBusy(true);
    setSmsError(null);
    setPhoneSaved(false);
    const normalized = phone.trim() ? normalizePhoneE164(phone) : null;
    if (phone.trim() && !normalized) {
      setSmsError("Enter a valid mobile number (US: 10 digits).");
      setSmsBusy(false);
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({
        phone_e164: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      setSmsError("Couldn't save your phone number.");
    } else {
      setPhoneSaved(true);
      if (normalized) setPhone(normalized);
    }
    setSmsBusy(false);
  }

  async function toggleSms() {
    if (!supabase || smsBusy) return;
    const next = !smsEnabled;
    const normalized = normalizePhoneE164(phone);
    if (next && !normalized) {
      setSmsError("Save a valid mobile number before enabling SMS.");
      return;
    }
    setSmsBusy(true);
    setSmsError(null);
    setSmsEnabled(next);
    const { error } = await supabase
      .from("profiles")
      .update({
        sms_notifications_enabled: next,
        phone_e164: normalized,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) {
      setSmsEnabled(!next);
      setSmsError("Couldn't save SMS preference.");
    }
    setSmsBusy(false);
  }

  return (
    <>
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

      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-brand" />
          <h2 className="text-base font-semibold">Text messages (SMS)</h2>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Optional texts when you earn an award or when a document deadline is
          due tomorrow. Standard message rates may apply.
        </p>
        <label htmlFor="smsPhone" className="mt-4 block text-sm font-medium">
          Mobile number
        </label>
        <input
          id="smsPhone"
          type="tel"
          autoComplete="tel"
          placeholder="+1 555 123 4567"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPhoneSaved(false);
          }}
          className={inputClass}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void savePhone()}
            disabled={smsBusy}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-stone-50 disabled:opacity-50"
          >
            {smsBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Save number
          </button>
          {phoneSaved && (
            <span className="text-sm text-brand-dark">Number saved.</span>
          )}
        </div>
        {smsError && (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {smsError}
          </p>
        )}
        <div className="mt-5 flex items-start justify-between gap-4 border-t border-stone-100 pt-5">
          <p className="text-sm text-ink-muted">
            Send SMS alerts to this number
          </p>
          <button
            type="button"
            role="switch"
            aria-checked={smsEnabled}
            aria-label="SMS notifications"
            onClick={() => void toggleSms()}
            disabled={smsBusy}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
              smsEnabled ? "bg-brand" : "bg-stone-300"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                smsEnabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </section>
    </>
  );
}
