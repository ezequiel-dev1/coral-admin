"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, ImageOff } from "lucide-react";
import { MenuItem } from "../lib/dynamodb";
import { getObjectUrl } from "../lib/receipts";

/**
 * Printable promotional flyer. Mirrors the branded "COMBOS DEL MAR" reference:
 * a navy-framed cream page with the Coral lockup, a large category title with a
 * coral eyebrow, a two-column body (image column on the left, item list on the
 * right), and a navy footer pill over a wave band.
 *
 * Data is live from DynamoDB. Every menu item is shown, paginated by category;
 * each page shows images for only the first few items (the rest list as text),
 * matching the reference where fewer images than items appear per page.
 */

/** Flyer-wide header title + coral eyebrow. */
const FLYER_TITLE = "MENÚ";
const FLYER_EYEBROW = "DEL MAR";

/** Section heading shown above each category's item list. */
const CATEGORY_SUBHEAD: Record<string, string> = {
  "Entradas y Sopas": "ENTRADAS Y SOPAS",
  Entradas: "ENTRADAS",
  Sopas: "SOPAS",
  Tacos: "NUESTROS TACOS",
  Bebidas: "BEBIDAS",
  Especialidades: "ESPECIALIDADES",
  Combos: "COMBOS ESPECIALES",
};

// Order categories appear in the flyer.
const CATEGORY_ORDER = [
  "Entradas y Sopas",
  "Entradas",
  "Sopas",
  "Tacos",
  "Especialidades",
  "Combos",
  "Bebidas",
];

// Capacity model: a page holds a fixed number of "rows". A section header costs
// SECTION_COST rows, each item costs ITEM_COST. Packing several categories onto
// one page keeps the flyer short.
const PAGE_CAPACITY = 22;
const SECTION_COST = 3;
const ITEM_COST = 2;
const IMAGES_PER_PAGE = 3; // max images shown per page (the "few images" rule)

const FOOTER_TAGLINE = "SABORES DEL MAR Y LA PARRILLA";

type FlyerSection = {
  category: string;
  items: MenuItem[];
};

type FlyerPage = {
  sections: FlyerSection[];
};

function formatPrice(price: string): string {
  const trimmed = (price ?? "").toString().trim();
  if (!trimmed) return "";
  return trimmed.startsWith("$") ? trimmed : `$${trimmed}`;
}

/**
 * Build the ordered flyer pages, packing as many category sections per page as
 * the capacity model allows. A category that overflows the current page
 * continues (with a repeated header) onto the next page.
 */
function buildPages(items: MenuItem[]): FlyerPage[] {
  const byCategory = new Map<string, MenuItem[]>();
  for (const item of items) {
    const list = byCategory.get(item.category) ?? [];
    list.push(item);
    byCategory.set(item.category, list);
  }

  // Categories in preferred order, then any leftover categories alphabetically.
  const ordered = [
    ...CATEGORY_ORDER.filter((c) => byCategory.has(c)),
    ...[...byCategory.keys()].filter((c) => !CATEGORY_ORDER.includes(c)).sort(),
  ];

  const pages: FlyerPage[] = [];
  let current: FlyerSection[] = [];
  let used = 0;

  const flush = () => {
    if (current.length) {
      pages.push({ sections: current });
      current = [];
      used = 0;
    }
  };

  for (const category of ordered) {
    const catItems = (byCategory.get(category) ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    let index = 0;
    while (index < catItems.length) {
      // If even a header + one item won't fit on the current page, start a new one.
      if (used + SECTION_COST + ITEM_COST > PAGE_CAPACITY && current.length) {
        flush();
      }
      const remaining = PAGE_CAPACITY - used - SECTION_COST;
      const fit = Math.max(1, Math.floor(remaining / ITEM_COST));
      const slice = catItems.slice(index, index + fit);
      current.push({ category, items: slice });
      used += SECTION_COST + slice.length * ITEM_COST;
      index += slice.length;
      if (used >= PAGE_CAPACITY) flush();
    }
  }
  flush();
  return pages;
}

/** Square dish image on a rounded salmon tile; falls back to a placeholder. */
function FlyerImage({ imageKey }: { imageKey: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!imageKey) return;
    let active = true;
    getObjectUrl(imageKey)
      .then((u) => active && setUrl(u))
      .catch((err) => console.error("Failed to load image:", err));
    return () => {
      active = false;
    };
  }, [imageKey]);

  return (
    <div className="pf-imgtile">
      <div className="pf-imgsquare">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" />
        ) : (
          <ImageOff className="pf-imgfallback" />
        )}
      </div>
    </div>
  );
}

function CoralSprig({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/coral-icon.png" alt="" className={className} aria-hidden />
  );
}

function WaveBand() {
  return (
    <svg className="pf-waveband" viewBox="0 0 800 70" preserveAspectRatio="none" aria-hidden>
      <path d="M0 40 C 150 18, 280 54, 430 36 S 680 20, 800 42 L800 70 L0 70 Z" fill="#cdddea" />
      <path d="M0 50 C 160 30, 300 62, 450 46 S 690 34, 800 52 L800 70 L0 70 Z" fill="#9db6d1" />
    </svg>
  );
}

function FlyerPageView({ page, pageNumber }: { page: FlyerPage; pageNumber: number }) {
  // Images: a few per page, drawn from items across all sections on the page.
  const imageItems = page.sections
    .flatMap((s) => s.items)
    .filter((i) => i.imageKey)
    .slice(0, IMAGES_PER_PAGE);

  // Alternate the image column's side: on even pages it sits on the right.
  const imagesOnRight = pageNumber % 2 === 0;

  return (
    <div className="pf-page">
      <div className="pf-frame">
        {/* Header */}
        <div className="pf-brand">
          <CoralSprig className="pf-brand-icon" />
          <div className="pf-brand-name">CORAL</div>
          <div className="pf-brand-sub">REEF &amp; BEEF</div>
        </div>
        <h1 className="pf-title">{FLYER_TITLE}</h1>
        <div className="pf-eyebrow">{FLYER_EYEBROW}</div>
        <div className="pf-titlerule" />

        {/* Body: image column + sectioned item list */}
        <div className={`pf-body${imagesOnRight ? " pf-body--right" : ""}`}>
          <div className="pf-images">
            {imageItems.map((item) => (
              <FlyerImage key={item.id} imageKey={item.imageKey} />
            ))}
          </div>

          <div className="pf-list">
            {page.sections.map((section, sIdx) => (
              <div key={`${section.category}-${sIdx}`} className="pf-sectiongroup">
                <div className="pf-subhead">
                  {CATEGORY_SUBHEAD[section.category] ?? section.category.toUpperCase()}
                </div>
                {section.items.map((item) => (
                  <div key={item.id} className="pf-item">
                    <div className="pf-item-top">
                      <span className="pf-item-name">{item.name.toUpperCase()}</span>
                      <span className="pf-item-price">{formatPrice(item.price)}</span>
                    </div>
                    {item.description && (
                      <div className="pf-item-desc">{item.description}</div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Footer pill */}
        <div className="pf-footer">
          <div className="pf-footer-tagline">{FOOTER_TAGLINE}</div>
          <div className="pf-footer-sub">Precios en MXN</div>
        </div>
        <WaveBand />
      </div>
    </div>
  );
}

export function PrintableFlyer({
  items,
  onClose,
}: {
  items: MenuItem[];
  onClose: () => void;
}) {
  const pages = useMemo(() => buildPages(items), [items]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const overlay = (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label="Printable flyer">
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
        {pages.map((page, idx) => (
          <FlyerPageView key={idx} page={page} pageNumber={idx + 1} />
        ))}
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
