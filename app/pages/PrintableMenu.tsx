"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { X, Printer } from "lucide-react";
import { MenuItem } from "../lib/dynamodb";

/**
 * Printable, print-optimized version of the live menu. Categories are kept in
 * alphabetical order and split across at most two balanced printed pages.
 */

function formatPrice(price: string): string {
  const trimmed = (price ?? "").toString().trim();
  if (!trimmed) return "";
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

/** The small coral sprig used as a decorative accent. */
function CoralSprig({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/coral-icon.png" alt="" className={className} aria-hidden />
  );
}

/** Stylized wave accent, drawn inline so it prints crisply. */
function WaveAccent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 40" className={className} aria-hidden fill="none">
      <path
        d="M2 26 C 14 14, 26 14, 38 24 S 66 34, 78 22"
        stroke="#6b8cae"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M2 34 C 14 22, 26 22, 38 32 S 66 42, 78 30"
        stroke="#9db6d1"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Short coral flourish flanking the page heading. */
function Flourish({ flip }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 90 20"
      className="pm-flourish"
      aria-hidden
      style={flip ? { transform: "scaleX(-1)" } : undefined}
    >
      <path
        d="M4 12 C 20 2, 34 2, 48 11 C 58 17, 70 17, 86 9"
        stroke="#e08a5f"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Soft watercolor wave band along the bottom of each page. */
function WaveBand() {
  return (
    <svg className="pm-waveband" viewBox="0 0 800 70" preserveAspectRatio="none" aria-hidden>
      <path d="M0 40 C 150 18, 280 54, 430 36 S 680 20, 800 42 L800 70 L0 70 Z" fill="#cdddea" />
      <path d="M0 50 C 160 30, 300 62, 450 46 S 690 34, 800 52 L800 70 L0 70 Z" fill="#9db6d1" />
    </svg>
  );
}

function BrandHeader() {
  return (
    <div className="pm-brand">
      <CoralSprig className="pm-brand-icon" />
      <div className="pm-brand-name">CORAL</div>
      <div className="pm-brand-sub">REEF &amp; BEEF</div>
    </div>
  );
}

function SectionBlock({ title, items, showDescription }: { title: string; items: MenuItem[]; showDescription?: boolean }) {
  return (
    <div className="pm-section">
      <div className="pm-section-pill">
        <span>{title}</span>
      </div>
      <ul className="pm-items">
        {items.map((item) => (
          <li key={item.id} className="pm-item">
            <div className="pm-item-line">
              <span className="pm-item-name">{item.name}</span>
              <span className="pm-leader" aria-hidden />
              <span className="pm-item-price">{formatPrice(item.price)}</span>
            </div>
            {showDescription && item.description && (
              <div className="pm-item-desc">{item.description}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PrintableMenu({
  items,
  onClose,
}: {
  items: MenuItem[];
  onClose: () => void;
}) {
  const categories = useMemo(() => {
    const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });
    const groups = new Map<string, MenuItem[]>();

    for (const item of items) {
      const category = item.category?.trim() || "SIN CATEGORÍA";
      groups.set(category, [...(groups.get(category) ?? []), item]);
    }

    return [...groups.entries()]
      .sort(([a], [b]) => collator.compare(a, b))
      .map(([category, categoryItems]) => ({
        category,
        items: [...categoryItems].sort((a, b) => collator.compare(a.name, b.name)),
      }));
  }, [items]);

  const pages = useMemo(() => {
    const itemTarget = Math.ceil(categories.reduce((total, group) => total + group.items.length, 0) / 2);
    const firstPage: typeof categories = [];
    const secondPage: typeof categories = [];
    let firstPageItems = 0;

    for (const group of categories) {
      // Do not split a category across pages. Once the first page has reached
      // its item target, remaining categories continue on page two.
      if (firstPage.length === 0 || firstPageItems < itemTarget) {
        firstPage.push(group);
        firstPageItems += group.items.length;
      } else {
        secondPage.push(group);
      }
    }

    return secondPage.length > 0 ? [firstPage, secondPage] : [firstPage];
  }, [categories]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overlay = (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Printable menu">
      <div className="pm-toolbar">
        <button type="button" className="pm-btn pm-btn-primary" onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir
        </button>
        <button type="button" className="pm-btn" onClick={onClose} aria-label="Cerrar">
          <X size={16} />
          Cerrar
        </button>
      </div>

      <div className="pm-scroll">
        {pages.map((pageCategories) => (
          <div className="pm-page" key={pageCategories.map(({ category }) => category).join("|")}>
            <div className="pm-frame">
              <BrandHeader />
              <div className="pm-pagehead">
                <Flourish />
                <h1 className="pm-pagetitle">MENÚ</h1>
                <Flourish flip />
              </div>

              <CoralSprig className="pm-accent pm-accent-tl" />
              <WaveAccent className="pm-accent pm-accent-wave" />
              {pageCategories.map(({ category, items: categoryItems }) => (
                <SectionBlock
                  key={category}
                  title={category.toLocaleUpperCase("es")}
                  items={categoryItems}
                  showDescription={category.toLocaleLowerCase("es") === "combos"}
                />
              ))}

              <div className="pm-footer">
                <span className="pm-rule" />
                <span className="pm-footer-text">Precios en MXN</span>
                <span className="pm-rule" />
              </div>
              <WaveBand />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
