"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { Employee } from "../lib/dynamodb";
import { getObjectUrl } from "../lib/receipts";

const SIZE_KEY = "coral-doc-viewer-size";
const MIN_W = 420;
const MIN_H = 360;
type Size = { w: number; h: number };

function clampSize(s: Size): Size {
  return {
    w: Math.min(Math.max(s.w, MIN_W), window.innerWidth - 16),
    h: Math.min(Math.max(s.h, MIN_H), window.innerHeight - 16),
  };
}

function defaultSize(): Size {
  return clampSize({ w: 896, h: Math.round(window.innerHeight * 0.85) });
}

/** Slideshow of an employee's documents (images inline, PDFs embedded). */
export function EmployeeDocumentsViewer({
  employee,
  onClose,
}: {
  employee: Employee | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [size, setSize] = useState<Size | null>(null);
  const drag = useRef<{ x: number; y: number; start: Size } | null>(null);

  const docs = employee?.documents ?? [];
  const doc = docs[Math.min(index, Math.max(docs.length - 1, 0))];

  // Pre-signed URLs expire after 5 minutes, so fetch lazily per slide.
  useEffect(() => {
    if (!doc || urls[doc.key] || failed[doc.key]) return;
    let cancelled = false;
    getObjectUrl(doc.key)
      .then((url) => !cancelled && setUrls((u) => ({ ...u, [doc.key]: url })))
      .catch((err) => {
        console.error("Failed to load document:", err);
        if (!cancelled) setFailed((f) => ({ ...f, [doc.key]: true }));
      });
    return () => {
      cancelled = true;
    };
  }, [doc, urls, failed]);

  useEffect(() => {
    if (!employee || docs.length < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % docs.length);
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + docs.length) % docs.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [employee, docs.length]);

  // Restore the last size (if any) whenever the viewer opens.
  const isOpen = !!employee;
  useEffect(() => {
    if (!isOpen) return;
    let saved: Size | null = null;
    try {
      saved = JSON.parse(localStorage.getItem(SIZE_KEY) ?? "null");
    } catch {
      saved = null;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSize(clampSize(saved && saved.w && saved.h ? saved : defaultSize()));
  }, [isOpen]);

  // The dialog is centered, so growing by the pointer delta on both sides keeps
  // the dragged corner under the cursor.
  function onResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!size) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: size };
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    setSize(clampSize({ w: d.start.w + (e.clientX - d.x) * 2, h: d.start.h + (e.clientY - d.y) * 2 }));
  }
  function onResizeEnd() {
    if (!drag.current) return;
    drag.current = null;
    if (size) {
      try {
        localStorage.setItem(SIZE_KEY, JSON.stringify(size));
      } catch {
        // storage unavailable; the size just won't persist
      }
    }
  }
  function resetSize() {
    const next = defaultSize();
    setSize(next);
    try {
      localStorage.removeItem(SIZE_KEY);
    } catch {
      // ignore
    }
  }

  function handleOpenChange(open: boolean) {
    if (open) return;
    setIndex(0);
    setUrls({});
    setFailed({});
    onClose();
  }

  const url = doc ? urls[doc.key] : undefined;
  const isImage = !!doc && doc.contentType.startsWith("image/");
  const isPdf = !!doc && doc.contentType === "application/pdf";

  return (
    <Dialog open={!!employee} onOpenChange={handleOpenChange}>
      <DialogContent
        className="grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
        style={size ? { width: size.w, height: size.h, maxWidth: "none", maxHeight: "none" } : { width: 896, maxWidth: "calc(100% - 2rem)" }}
      >
        <DialogHeader>
          <DialogTitle>
            {t("employees.documentsOf", { name: employee?.fullName ?? "" })}
          </DialogTitle>
        </DialogHeader>

        {!doc ? (
          <p className="py-10 text-center text-sm text-[var(--text-muted)]">{t("employees.noDocuments")}</p>
        ) : (
          <div className="flex min-h-0 flex-col gap-3">
            <div className="flex items-center justify-between gap-2" style={{ flexDirection: "row" }}>
              <div className="min-w-0">
                <div className="font-medium">{t(`employees.doc_${doc.type}`)}</div>
                <div className="truncate text-xs text-[var(--text-muted)]">{doc.name}</div>
              </div>
              <div className="flex items-center gap-2" style={{ flexDirection: "row" }}>
                <span className="text-sm text-[var(--text-muted)]">
                  {Math.min(index, docs.length - 1) + 1} / {docs.length}
                </span>
                {url && (
                  <Button variant="outline" size="sm" onClick={() => window.open(url, "_blank", "noopener")}>
                    <ExternalLink data-icon="inline-start" />
                    {t("employees.open")}
                  </Button>
                )}
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--table-head)]">
              {failed[doc.key] ? (
                <p className="text-sm text-[#E48664]">{t("employees.loadError")}</p>
              ) : !url ? (
                <p className="text-sm text-[var(--text-muted)]">{t("employees.loading")}</p>
              ) : isImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={doc.name} className="max-h-full max-w-full object-contain" />
              ) : isPdf ? (
                <iframe src={url} title={doc.name} className="h-full w-full border-0 bg-white" />
              ) : (
                <div className="flex flex-col items-center gap-2 text-sm text-[var(--text-muted)]">
                  <FileText size={40} />
                  {t("employees.noPreview")}
                </div>
              )}

              {docs.length > 1 && (
                <>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute left-2 top-1/2 -translate-y-1/2"
                    onClick={() => setIndex((i) => (i - 1 + docs.length) % docs.length)}
                    aria-label={t("employees.prevDoc")}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setIndex((i) => (i + 1) % docs.length)}
                    aria-label={t("employees.nextDoc")}
                  >
                    <ChevronRight />
                  </Button>
                </>
              )}
            </div>

            {docs.length > 1 && (
              <div className="flex shrink-0 flex-wrap justify-center gap-2" style={{ flexDirection: "row" }}>
                {docs.map((d, i) => (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={t(`employees.doc_${d.type}`)}
                    aria-current={i === index}
                    className={`rounded-full border px-3 py-1 text-xs cursor-pointer ${
                      i === index
                        ? "border-[#3D4F9B] bg-[#3D4F9B] text-white"
                        : "border-[var(--line)] bg-transparent text-[var(--ink)]"
                    }`}
                  >
                    {t(`employees.doc_${d.type}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div
          role="separator"
          aria-label={t("employees.resize")}
          title={t("employees.resizeHint")}
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          onPointerCancel={onResizeEnd}
          onDoubleClick={resetSize}
          className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-nwse-resize touch-none select-none"
          style={{
            background:
              "linear-gradient(135deg, transparent 50%, var(--text-muted) 50%, var(--text-muted) 58%, transparent 58%, transparent 70%, var(--text-muted) 70%, var(--text-muted) 78%, transparent 78%)",
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
