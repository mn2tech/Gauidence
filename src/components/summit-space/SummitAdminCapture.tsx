"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Plus, Upload } from "lucide-react";

type Props = {
  summitSlug: string;
};

export default function SummitAdminCapture({ summitSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [noteContent, setNoteContent] = useState("");

  async function uploadFile(file: File, draftType: string) {
    setLoading(true);
    setMessage(null);
    const form = new FormData();
    form.append("file", file);
    form.append("draftType", draftType);
    const res = await fetch(`/api/summit/${summitSlug}/intelligence`, {
      method: "POST",
      body: form,
    });
    const json = await res.json();
    setLoading(false);
    if (res.ok) {
      setMessage(
        "Captured! Review required before this becomes publicly visible."
      );
    } else {
      setMessage(json.error ?? "Upload failed");
    }
  }

  async function submitNote() {
    if (!noteContent.trim()) return;
    setLoading(true);
    setMessage(null);
    const res = await fetch(`/api/summit/${summitSlug}/intelligence`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftType: "note", content: noteContent }),
    });
    const json = await res.json();
    setLoading(false);
    if (res.ok) {
      setNoteContent("");
      setMessage(
        "Note captured! Review required before this becomes publicly visible."
      );
    } else {
      setMessage(json.error ?? "Could not save note");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-white shadow-lg hover:bg-brand-dark"
      >
        <Plus className="h-5 w-5" />
        Add Summit Intelligence
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Add Summit Intelligence</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Uploaded content requires your review before it becomes publicly
          visible.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 p-4 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            <Camera className="h-6 w-6 text-brand" />
            Upload Photo
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.accept = ".pdf,.ppt,.pptx";
              input.onchange = () => {
                const file = input.files?.[0];
                if (file) void uploadFile(file, "presentation");
              };
              input.click();
            }}
            className="flex flex-col items-center gap-2 rounded-xl border border-stone-200 p-4 text-sm font-medium hover:bg-stone-50 disabled:opacity-60"
          >
            <Upload className="h-6 w-6 text-brand" />
            Upload Presentation
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void uploadFile(file, "photo");
          }}
        />

        <div className="mt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" />
            Add Note
          </label>
          <textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            rows={3}
            placeholder="Session notes, observations, follow-up items…"
            className="mt-2 w-full rounded-xl border border-stone-200 p-3 text-sm"
          />
          <button
            type="button"
            disabled={loading || !noteContent.trim()}
            onClick={() => void submitNote()}
            className="mt-2 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"
          >
            Save Note
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm">{message}</p>
        ) : null}

        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-4 w-full rounded-xl border border-stone-200 py-2.5 text-sm font-medium hover:bg-stone-50"
        >
          Close
        </button>
      </div>
    </div>
  );
}
