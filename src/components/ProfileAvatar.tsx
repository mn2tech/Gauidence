"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  AVATAR_PRESETS,
  matchingPresetId,
} from "@/lib/profiles/avatar-presets";
import {
  isOrgStyleProfile,
  profileAvatarLabel,
  type GuardianProfile,
} from "@/lib/profiles/types";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(["image/jpeg", "image/png", "image/webp"]);

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

type Props = {
  profile: GuardianProfile;
  size?: Size;
  editable?: boolean;
  onUpdated?: () => void | Promise<void>;
  onError?: (message: string) => void;
};

function initialFor(profile: GuardianProfile): string {
  const name = profile.display_name.trim();
  if (!name) return "?";
  return name.charAt(0).toUpperCase();
}

export default function ProfileAvatar({
  profile,
  size = "md",
  editable = false,
  onUpdated,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const label = profileAvatarLabel(profile.profile_type);
  const src = preview ?? profile.avatar_url;
  const selectedPreset = matchingPresetId(src);
  const isOrg = isOrgStyleProfile(profile.profile_type);

  useEffect(() => {
    setPreview(null);
  }, [profile.id, profile.avatar_url]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const saveAvatarUrl = async (avatarUrl: string | null) => {
    setBusy(true);
    onError?.("");
    try {
      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onError?.(body.error ?? "Couldn't save profile picture.");
        return false;
      }
      setPreview(avatarUrl);
      await onUpdated?.();
      setOpen(false);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const pickPreset = async (presetSrc: string) => {
    await saveAvatarUrl(presetSrc);
  };

  const clearAvatar = async () => {
    await saveAvatarUrl(null);
  };

  const upload = async (file: File) => {
    if (!ACCEPTED.has(file.type)) {
      onError?.("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      onError?.("That image is larger than 2 MB. Choose a smaller file.");
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      onError?.("Couldn't connect to storage.");
      return;
    }

    setBusy(true);
    onError?.("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        onError?.("You need to be signed in.");
        return;
      }

      const ext =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
      const path = `${user.id}/${profile.id}/avatar.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, {
          contentType: file.type,
          upsert: true,
        });
      if (uploadError) {
        onError?.(
          uploadError.message?.includes("Bucket not found")
            ? "Avatar storage isn't set up yet — run migration 0019 in Supabase."
            : "Couldn't upload that image. Try again."
        );
        return;
      }

      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`;

      const res = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        onError?.(body.error ?? "Couldn't save profile picture.");
        return;
      }

      setPreview(avatarUrl);
      await onUpdated?.();
      setOpen(false);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const shell = (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 font-semibold text-ink-muted ${SIZE_CLASS[size]}`}
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={56}
          height={56}
          className="h-full w-full object-cover"
          unoptimized
        />
      ) : (
        <span aria-hidden>{initialFor(profile)}</span>
      )}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-white/70">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" />
        </span>
      ) : null}
    </span>
  );

  if (!editable) return shell;

  const personPresets = AVATAR_PRESETS.filter((p) => !p.id.startsWith("mark-"));
  const markPresets = AVATAR_PRESETS.filter((p) => p.id.startsWith("mark-"));
  const primaryPresets = isOrg ? markPresets : personPresets;
  const secondaryPresets = isOrg ? personPresets : markPresets;

  return (
    <div className="relative inline-flex" ref={rootRef}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Change ${label.toLowerCase()} for ${profile.display_name}`}
        className="group relative rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60"
      >
        {shell}
        <span className="absolute -bottom-0.5 -right-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-stone-200 bg-white text-brand shadow-sm group-hover:bg-brand-light">
          <Camera className="h-3 w-3" />
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      {open ? (
        <div
          role="dialog"
          aria-label={`Choose ${label.toLowerCase()}`}
          className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border border-stone-200 bg-white p-3 shadow-lg"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">
              Choose {label.toLowerCase()}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="rounded-md p-0.5 text-ink-muted hover:bg-stone-100 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {primaryPresets.map((preset) => {
              const selected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void pickPreset(preset.src)}
                  aria-label={preset.label}
                  aria-pressed={selected}
                  className={`rounded-full p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
                    selected ? "ring-2 ring-brand ring-offset-1" : ""
                  }`}
                >
                  <Image
                    src={preset.src}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                    unoptimized
                  />
                </button>
              );
            })}
          </div>

          <p className="mb-1.5 mt-3 text-[11px] font-medium uppercase tracking-wide text-ink-muted">
            More styles
          </p>
          <div className="grid grid-cols-4 gap-2">
            {secondaryPresets.map((preset) => {
              const selected = selectedPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void pickPreset(preset.src)}
                  aria-label={preset.label}
                  aria-pressed={selected}
                  className={`rounded-full p-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-60 ${
                    selected ? "ring-2 ring-brand ring-offset-1" : ""
                  }`}
                >
                  <Image
                    src={preset.src}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                    unoptimized
                  />
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-col gap-1.5 border-t border-stone-100 pt-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex items-center justify-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium hover:bg-stone-50 disabled:opacity-60"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Upload {label.toLowerCase()}
            </button>
            {src ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void clearAvatar()}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-ink-muted hover:bg-stone-50 hover:text-foreground disabled:opacity-60"
              >
                Use initials instead
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
