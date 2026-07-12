"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronDown,
  Download,
  Eye,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  SOURCE_LABELS,
  ANALYSIS_STATUS_LABELS,
  GUARDIAN_STATUS_LABELS,
  type Fact,
  type AnalysisStatus,
  type GuardianStatus,
} from "@/lib/analysis";
import { DOCUMENT_CATEGORIES } from "@/lib/categories";
import { GUARDIAN_TIME_ZONE } from "@/lib/timezone";
import DocumentChatPanel from "@/components/DocumentChatPanel";
import CameraCaptureModal from "@/components/CameraCaptureModal";

type DocumentRow = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
  category: string | null;
  analysis_status: AnalysisStatus;
};

type SortKey = "newest" | "oldest" | "name" | "largest";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "largest", label: "Largest first" },
];

type Analysis = {
  summary: string;
  facts: Fact[];
  model: string | null;
  title?: string | null;
  documentType?: string | null;
  guardianStatus?: GuardianStatus | null;
  overallConfidence?: number | null;
  classificationConfidence?: number | null;
};

const ACCEPTED_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};
const MAX_SIZE_BYTES = 15 * 1024 * 1024;

const SOURCE_BADGE_STYLES: Record<Fact["source"], string> = {
  document: "bg-brand-light text-brand-dark",
  calculated: "bg-sky-50 text-sky-700",
  ai_generated: "bg-violet-50 text-violet-700",
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: GUARDIAN_TIME_ZONE,
  });
}

export function notifyAlertsUpdated() {
  window.dispatchEvent(new Event("guardian:alerts-updated"));
}

export default function DocumentManager({ userId }: { userId: string }) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{
    url: string;
    fileName: string;
    mimeType: string;
  } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [savingRename, setSavingRename] = useState(false);

  const loadDocuments = useCallback(async () => {
    if (!supabase) return;
    const [docsRes, analysesRes] = await Promise.all([
      supabase
        .from("documents")
        .select(
          "id, file_name, file_path, mime_type, size_bytes, created_at, category, analysis_status"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("extracted_data")
        .select(
          "document_id, summary, facts, model, title, document_type, guardian_status, overall_confidence, classification_confidence"
        ),
    ]);
    if (docsRes.error) {
      setError("We couldn't load your documents. Refresh the page to try again.");
    } else {
      setDocuments(
        (docsRes.data ?? []).map((d) => ({
          ...d,
          analysis_status: (d.analysis_status as AnalysisStatus) ?? "uploaded",
        }))
      );
      const map: Record<string, Analysis> = {};
      for (const row of analysesRes.data ?? []) {
        map[row.document_id] = {
          summary: row.summary ?? "",
          facts: (row.facts as Fact[]) ?? [],
          model: row.model,
          title: row.title,
          documentType: row.document_type,
          guardianStatus: row.guardian_status as GuardianStatus | null,
          overallConfidence: row.overall_confidence,
          classificationConfidence: row.classification_confidence,
        };
      }
      setAnalyses(map);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  async function handleFiles(files: FileList | File[] | null) {
    const list = files
      ? Array.isArray(files)
        ? files
        : Array.from(files)
      : [];
    if (list.length === 0 || !supabase) return;
    const file = list[0];
    if (!file) return;
    setError(null);

    if (!ACCEPTED_TYPES[file.type]) {
      setError("That file type isn't supported. Upload a PDF, JPG, PNG, or WebP file.");
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError("That file is larger than 15 MB. Please upload a smaller file.");
      return;
    }

    setUploading(true);
    const safeName = file.name.replace(/[^\w.\- ]/g, "_");
    const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type });
      if (uploadError) {
        setError(
          uploadError.message?.includes("Bucket not found")
            ? "Document storage isn't set up yet on this project — the site owner needs to run the latest database migration."
            : "The upload didn't finish. Check your connection and try again."
        );
        setUploading(false);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("documents")
        .insert({
          user_id: userId,
          file_name: file.name,
          file_path: path,
          mime_type: file.type,
          size_bytes: file.size,
          analysis_status: "uploaded",
        })
        .select("id, file_name, file_path, mime_type, size_bytes, created_at, category, analysis_status")
        .single();
      if (insertError || !inserted) {
        // Don't leave an orphaned file behind if the record failed.
        await supabase.storage.from("documents").remove([path]);
        setError("We couldn't save the document record. Please try again.");
        setUploading(false);
        return;
      }

      await loadDocuments();
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      // Auto-analyze once after upload — not on every page load.
      void handleAnalyze({
        ...inserted,
        analysis_status: (inserted.analysis_status as AnalysisStatus) ?? "uploaded",
      });
      return;
    } catch {
      setError("Something went wrong during upload. Check your connection and try again.");
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  function openCamera() {
    setError(null);
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      setCameraOpen(true);
      return;
    }
    cameraInputRef.current?.click();
  }

  async function handleDownload(doc: DocumentRow) {
    if (!supabase) return;
    setError(null);
    setDownloadingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60, { download: doc.file_name });
      if (error || !data?.signedUrl) {
        setError("We couldn't prepare the download. Please try again.");
      } else {
        const a = document.createElement("a");
        a.href = data.signedUrl;
        a.download = doc.file_name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch {
      setError("We couldn't prepare the download. Check your connection and try again.");
    }
    setDownloadingId(null);
  }

  async function handleView(doc: DocumentRow) {
    if (!supabase) return;
    setError(null);
    setViewingId(doc.id);
    try {
      const { data, error } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 60);
      if (error || !data?.signedUrl) {
        setError("We couldn't open the document. Please try again.");
      } else {
        setViewer({
          url: data.signedUrl,
          fileName: doc.file_name,
          mimeType: doc.mime_type,
        });
      }
    } catch {
      setError("We couldn't open the document. Check your connection and try again.");
    }
    setViewingId(null);
  }

  useEffect(() => {
    if (!viewer) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setViewer(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  async function handleDelete(doc: DocumentRow) {
    if (!supabase) return;
    setError(null);
    setDeletingId(doc.id);
    try {
      // Remove the stored file first so nothing lingers, then the record.
      // extracted_data and alerts cascade-delete with the record.
      const { error: storageError } = await supabase.storage
        .from("documents")
        .remove([doc.file_path]);
      if (storageError) {
        setError("We couldn't delete the stored file. Please try again.");
        setDeletingId(null);
        return;
      }

      const { error: dbError } = await supabase
        .from("documents")
        .delete()
        .eq("id", doc.id);
      if (dbError) {
        setError(
          "The file was removed but its record couldn't be deleted. Try deleting it again."
        );
      } else {
        setDocuments((docs) => docs.filter((d) => d.id !== doc.id));
        setAnalyses((prev) => {
          const next = { ...prev };
          delete next[doc.id];
          return next;
        });
        notifyAlertsUpdated();
      }
    } catch {
      setError("Something went wrong while deleting. Please try again.");
    }
    setDeletingId(null);
    setConfirmDeleteId(null);
  }

  function startRename(doc: DocumentRow) {
    setRenamingId(doc.id);
    setRenameValue(doc.file_name);
  }

  async function handleRename(doc: DocumentRow) {
    if (!supabase) return;
    const newName = renameValue.trim();
    if (!newName || newName === doc.file_name) {
      setRenamingId(null);
      return;
    }
    setSavingRename(true);
    const { error: renameError } = await supabase
      .from("documents")
      .update({ file_name: newName })
      .eq("id", doc.id);
    if (renameError) {
      setError("We couldn't rename the document. Please try again.");
    } else {
      setDocuments((docs) =>
        docs.map((d) => (d.id === doc.id ? { ...d, file_name: newName } : d))
      );
    }
    setSavingRename(false);
    setRenamingId(null);
  }

  async function handleSetCategory(doc: DocumentRow, category: string) {
    if (!supabase) return;
    const value = category === "" ? null : category;
    const previous = doc.category;
    setDocuments((docs) =>
      docs.map((d) => (d.id === doc.id ? { ...d, category: value } : d))
    );
    const { error: categoryError } = await supabase
      .from("documents")
      .update({ category: value })
      .eq("id", doc.id);
    if (categoryError) {
      setDocuments((docs) =>
        docs.map((d) => (d.id === doc.id ? { ...d, category: previous } : d))
      );
      setError("We couldn't save the category. Please try again.");
    }
  }

  async function handleAnalyze(doc: DocumentRow) {
    setError(null);
    setAnalyzingId(doc.id);
    setProgressLabel(ANALYSIS_STATUS_LABELS.extracting);
    setDocuments((docs) =>
      docs.map((d) =>
        d.id === doc.id ? { ...d, analysis_status: "extracting" } : d
      )
    );

    const stages: AnalysisStatus[] = [
      "extracting",
      "classifying",
      "analyzing",
      "validating",
    ];
    let stageIdx = 0;
    const progressTimer = window.setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      setProgressLabel(ANALYSIS_STATUS_LABELS[stages[stageIdx]]);
    }, 2500);

    try {
      const res = await fetch("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          timeZone: GUARDIAN_TIME_ZONE,
        }),
      });
      let body: {
        error?: string;
        summary?: string;
        facts?: Analysis["facts"];
        model?: string;
        title?: string;
        documentType?: string;
        guardianStatus?: string;
        overallConfidence?: number;
        classificationConfidence?: number;
        category?: string | null;
        analysisStatus?: AnalysisStatus;
      } = {};
      try {
        body = await res.json();
      } catch {
        setError(
          res.ok
            ? "Analysis finished but returned an unexpected response. Please try again."
            : "The analysis service failed. Please try again in a moment."
        );
        setDocuments((docs) =>
          docs.map((d) =>
            d.id === doc.id ? { ...d, analysis_status: "failed" } : d
          )
        );
        return;
      }
      if (!res.ok) {
        setError(body.error ?? "Analysis failed. Please try again.");
        setDocuments((docs) =>
          docs.map((d) =>
            d.id === doc.id ? { ...d, analysis_status: "failed" } : d
          )
        );
      } else {
        setAnalyses((prev) => ({
          ...prev,
          [doc.id]: {
            summary: body.summary ?? "",
            facts: body.facts ?? [],
            model: body.model ?? null,
            title: body.title,
            documentType: body.documentType,
            guardianStatus: body.guardianStatus as GuardianStatus | undefined,
            overallConfidence: body.overallConfidence,
            classificationConfidence: body.classificationConfidence,
          },
        }));
        if (body.category && !doc.category) {
          const category = body.category;
          setDocuments((docs) =>
            docs.map((d) =>
              d.id === doc.id
                ? {
                    ...d,
                    category,
                    analysis_status: body.analysisStatus ?? "completed",
                  }
                : d
            )
          );
        } else {
          setDocuments((docs) =>
            docs.map((d) =>
              d.id === doc.id
                ? { ...d, analysis_status: body.analysisStatus ?? "completed" }
                : d
            )
          );
        }
        setExpandedId(doc.id);
        notifyAlertsUpdated();
      }
    } catch {
      setError("We couldn't reach the analysis service. Check your connection and try again.");
      setDocuments((docs) =>
        docs.map((d) =>
          d.id === doc.id ? { ...d, analysis_status: "failed" } : d
        )
      );
    } finally {
      window.clearInterval(progressTimer);
      setProgressLabel(null);
      setAnalyzingId(null);
    }
  }

  const categoriesInUse = DOCUMENT_CATEGORIES.filter((c) =>
    documents.some((d) => d.category === c)
  );
  const hasUncategorized = documents.some((d) => !d.category);

  const visibleDocuments = documents
    .filter((d) => {
      if (query && !d.file_name.toLowerCase().includes(query.toLowerCase().trim()))
        return false;
      if (categoryFilter === "all") return true;
      if (categoryFilter === "uncategorized") return !d.category;
      return d.category === categoryFilter;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return a.created_at.localeCompare(b.created_at);
        case "name":
          return a.file_name.localeCompare(b.file_name, undefined, {
            sensitivity: "base",
          });
        case "largest":
          return b.size_bytes - a.size_bytes;
        default:
          return b.created_at.localeCompare(a.created_at);
      }
    });

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
      active
        ? "border-brand bg-brand text-white"
        : "border-stone-300 bg-white text-ink-muted hover:border-stone-400 hover:text-foreground"
    }`;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Your documents</h2>
        <span className="text-xs text-ink-muted">
          {documents.length} {documents.length === 1 ? "document" : "documents"}
        </span>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`mt-4 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragActive
            ? "border-brand bg-brand-light"
            : "border-stone-300 bg-stone-50/60"
        }`}
      >
        <UploadCloud className="h-8 w-8 text-brand" />
        <p className="text-sm text-ink-muted">
          Drag and drop, choose a file, or scan with your camera
        </p>
        <p className="max-w-sm text-xs text-ink-muted">
          Business cards, receipts, invoices, IDs, and other paper documents
          work well as photos.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            {uploading ? "Uploading…" : "Choose a file"}
          </button>
          <button
            type="button"
            onClick={openCamera}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-5 py-2 text-sm font-semibold text-foreground transition hover:border-stone-400 hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera className="h-4 w-4 text-brand" />
            Take photo
          </button>
        </div>
        <p className="text-xs text-ink-muted">PDF, JPG, PNG, or WebP — up to 15 MB</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <CameraCaptureModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(file) => void handleFiles([file])}
      />

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}

      {/* Toolbar: search, category filter, sort */}
      {!loading && documents.length > 0 && (
        <div className="mt-6 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documents…"
                aria-label="Search documents by name"
                className="w-full rounded-full border border-stone-300 bg-white py-2 pl-9 pr-4 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort documents"
              className="rounded-full border border-stone-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {(categoriesInUse.length > 0 || hasUncategorized) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={chipClass(categoryFilter === "all")}
              >
                All
              </button>
              {categoriesInUse.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoryFilter(c)}
                  className={chipClass(categoryFilter === c)}
                >
                  {c}
                </button>
              ))}
              {hasUncategorized && categoriesInUse.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter("uncategorized")}
                  className={chipClass(categoryFilter === "uncategorized")}
                >
                  Uncategorized
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-6 text-sm text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your documents…
        </div>
      ) : documents.length === 0 ? (
        <p className="mt-6 py-4 text-center text-sm text-ink-muted">
          Nothing here yet. Your uploads are private to you.
        </p>
      ) : visibleDocuments.length === 0 ? (
        <p className="mt-6 py-4 text-center text-sm text-ink-muted">
          No documents match your search.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-stone-100">
          {visibleDocuments.map((doc) => {
            const analysis = analyses[doc.id];
            const expanded = expandedId === doc.id;
            return (
              <li key={doc.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-light text-brand">
                    {doc.mime_type === "application/pdf" ? (
                      <FileText className="h-4 w-4" />
                    ) : (
                      <FileImage className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    {renamingId === doc.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRename(doc);
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          autoFocus
                          aria-label="New document name"
                          className="w-full min-w-0 rounded-lg border border-stone-300 bg-white px-2 py-1 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(doc)}
                          disabled={savingRename}
                          aria-label="Save name"
                          className="rounded-full p-1.5 text-brand transition hover:bg-brand-light focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                        >
                          {savingRename ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingId(null)}
                          aria-label="Cancel rename"
                          className="rounded-full p-1.5 text-ink-muted transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="truncate text-sm font-medium">{doc.file_name}</p>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                      <span>
                        {ACCEPTED_TYPES[doc.mime_type] ?? doc.mime_type} ·{" "}
                        {formatSize(doc.size_bytes)} · {formatDate(doc.created_at)}
                      </span>
                      <select
                        value={doc.category ?? ""}
                        onChange={(e) => handleSetCategory(doc, e.target.value)}
                        aria-label={`Category for ${doc.file_name}`}
                        className={`max-w-36 cursor-pointer rounded-full border px-2 py-0.5 text-[11px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
                          doc.category
                            ? "border-brand/30 bg-brand-light text-brand-dark"
                            : "border-stone-300 bg-white text-ink-muted"
                        }`}
                      >
                        <option value="">Uncategorized</option>
                        {DOCUMENT_CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {confirmDeleteId === doc.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDelete(doc)}
                        disabled={deletingId === doc.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-50"
                      >
                        {deletingId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Delete permanently
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        aria-label="Cancel delete"
                        className="rounded-full border border-stone-300 p-1.5 text-ink-muted transition hover:bg-stone-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (analysis && doc.analysis_status !== "failed") {
                            setExpandedId(expanded ? null : doc.id);
                          } else {
                            handleAnalyze(doc);
                          }
                        }}
                        disabled={analyzingId === doc.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-light px-3 py-1.5 text-xs font-semibold text-brand-dark transition hover:border-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                      >
                        {analyzingId === doc.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        {analyzingId === doc.id
                          ? progressLabel ?? "Analyzing…"
                          : doc.analysis_status === "failed"
                            ? "Try Again"
                            : analysis
                              ? "View Analysis"
                              : "Analyze"}
                        {analysis && doc.analysis_status !== "failed" && (
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startRename(doc)}
                        aria-label={`Rename ${doc.file_name}`}
                        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleView(doc)}
                        disabled={viewingId === doc.id}
                        aria-label={`View ${doc.file_name}`}
                        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                      >
                        {viewingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        aria-label={`Download ${doc.file_name}`}
                        className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                      >
                        {downloadingId === doc.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(doc.id)}
                        aria-label={`Delete ${doc.file_name}`}
                        className="rounded-full p-2 text-ink-muted transition hover:bg-red-50 hover:text-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Analysis panel */}
                {expanded && analysis && (
                  <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-4 sm:ml-12">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      {analysis.guardianStatus && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-brand-dark ring-1 ring-brand/20">
                          {GUARDIAN_STATUS_LABELS[analysis.guardianStatus]}
                        </span>
                      )}
                      {analysis.documentType && (
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-ink-muted ring-1 ring-stone-200">
                          {analysis.documentType.replace(/_/g, " ")}
                        </span>
                      )}
                      {(analysis.classificationConfidence != null &&
                        analysis.classificationConfidence < 0.8) ||
                      analysis.guardianStatus === "needs_verification" ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                          Needs verification
                        </span>
                      ) : null}
                    </div>
                    {analysis.title && (
                      <p className="text-sm font-semibold">{analysis.title}</p>
                    )}
                    <p className="mt-1 text-sm leading-relaxed">{analysis.summary}</p>
                    {analysis.facts.length > 0 && (
                      <ul className="mt-3 space-y-2">
                        {analysis.facts.map((fact, i) => (
                          <li
                            key={`${fact.label}-${i}`}
                            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm"
                          >
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_BADGE_STYLES[fact.source]}`}
                            >
                              {SOURCE_LABELS[fact.source]}
                            </span>
                            <span className="font-medium">{fact.label}:</span>
                            <span className="text-ink-muted">{fact.value}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-ink-muted">
                        AI can make mistakes — verify important details against the
                        original document.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleAnalyze(doc)}
                        disabled={analyzingId === doc.id}
                        className="text-xs font-semibold text-brand hover:text-brand-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
                      >
                        Re-analyze
                      </button>
                    </div>
                    <DocumentChatPanel
                      documentId={doc.id}
                      enabled={
                        doc.analysis_status === "completed" ||
                        doc.analysis_status === "needs_verification"
                      }
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {viewer && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={viewer.fileName}
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 p-4"
          onClick={() => setViewer(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
              <p className="truncate text-sm font-semibold">{viewer.fileName}</p>
              <button
                type="button"
                onClick={() => setViewer(null)}
                aria-label="Close viewer"
                className="rounded-full p-2 text-ink-muted transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-stone-100 p-2">
              {viewer.mimeType === "application/pdf" ? (
                <iframe
                  title={viewer.fileName}
                  src={viewer.url}
                  className="h-[75vh] w-full rounded-lg bg-white"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={viewer.url}
                  alt={viewer.fileName}
                  className="mx-auto max-h-[75vh] max-w-full object-contain"
                />
              )}
            </div>
            <p className="border-t border-stone-200 px-4 py-2 text-xs text-ink-muted">
              This preview link expires in about a minute. Download the file to keep a copy.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
