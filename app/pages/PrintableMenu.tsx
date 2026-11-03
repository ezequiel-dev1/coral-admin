"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import QRCode from "qrcode";
import { X, Printer } from "lucide-react";
import { MenuItem } from "../lib/dynamodb";

/**
 * Facebook page the page-2 QR code encodes. Edit this to point at the real
 * restaurant page — the QR regenerates automatically.
 */
const FACEBOOK_URL = "https://facebook.com/coralreefandbeef";

/**
 * Renders a "Follow us" QR card styled after the social-media sticker look:
 * a rounded tile with a blue Facebook gradient, white rounded QR modules, and a
 * "Follow us" label with a Facebook icon badge. Drawn as inline SVG so it scales
 * and prints crisply.
 */
function FollowUsQR({ url }: { url: string }) {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
      const size = qr.modules.size;
      const data = qr.modules.data;
      const rows: boolean[][] = [];
      for (let r = 0; r < size; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < size; c++) row.push(!!data[r * size + c]);
        rows.push(row);
      }
      return { size, rows };
    } catch (err) {
      console.error("Failed to build QR matrix:", err);
      return null;
    }
  }, [url]);

  if (!matrix) return null;

  const { size, rows } = matrix;
  const quiet = 2; // quiet-zone modules
  const total = size + quiet * 2;
  const cell = 8; // px per module in the SVG coordinate space
  const qrPx = total * cell;
  // Card padding around the QR, and extra room at the bottom for the label.
  const padX = 22;
  const padTop = 22;
  const labelH = 52;
  const cardW = qrPx + padX * 2;
  const cardH = qrPx + padTop + labelH;
  const radius = cell * 0.42; // rounded module corners

  return (
    <svg
      className="pm-qr"
      viewBox={`0 0 ${cardW} ${cardH}`}
      role="img"
      aria-label="Síguenos en Facebook (código QR)"
    >
      <defs>
        <linearGradient id="pmFbGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a8bf2" />
          <stop offset="1" stopColor="#1559c6" />
        </linearGradient>
      </defs>

      {/* Card */}
      <rect x="0" y="0" width={cardW} height={cardH} rx="26" fill="url(#pmFbGrad)" />

      {/* White QR modules (light dots on the colored card) */}
      <g transform={`translate(${padX}, ${padTop})`}>
        {rows.flatMap((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect
                key={`${r}-${c}`}
                x={(c + quiet) * cell}
                y={(r + quiet) * cell}
                width={cell}
                height={cell}
                rx={radius}
                ry={radius}
                fill="#ffffff"
              />
            ) : null
          )
        )}
      </g>

      {/* Follow us label */}
      <g transform={`translate(${padX}, ${padTop + qrPx + 6})`}>
        <circle cx="16" cy="16" r="16" fill="#ffffff" />
        <path
          d="M19.6 16.2h-2.3V26h-3.6v-9.8h-1.6v-3h1.6v-1.9c0-1.6.8-4 4-4l2.6.01v2.9h-1.9c-.3 0-.7.3-.7.9v2h2.6l-.3 3z"
          fill="#1877f2"
        />
        <text x="40" y="22" className="pm-qr-follow" fill="#ffffff">
          Follow us
        </text>
      </g>
    </svg>
  );
}

/**
 * Printable, print-optimized version of the menu that mirrors the branded
 * "Menu Impreso" reference. Data is live from DynamoDB (passed in via `items`);
 * the layout groups categories into the printed sections and paginates them
 * across two Letter-size pages.
 */

type Section = {
  /** Heading shown on the coral brush-stroke pill. */
  title: string;
  /** DynamoDB category values that feed this section, in order. */
  categories: string[];
  /** Show the description line under each item (used for combos). */
  showDescription?: boolean;
};

// Page 1: Entradas y Sopas, Tacos, Bebidas
const PAGE_ONE: Section[] = [
  { title: "ENTRADAS Y SOPAS", categories: ["Entradas y Sopas", "Entradas", "Sopas"] },
  { title: "TACOS", categories: ["Tacos"] },
  { title: "BEBIDAS", categories: ["Bebidas"] },
];

// Page 2: Especialidades, Combos (combos carry a description line)
const PAGE_TWO: Section[] = [
  { title: "ESPECIALIDADES", categories: ["Especialidades"] },
  { title: "COMBOS", categories: ["Combos"], showDescription: true },
];

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

function SectionBlock({
  section,
  items,
}: {
  section: Section;
  items: MenuItem[];
}) {
  const sectionItems = useMemo(() => {
    const rows: MenuItem[] = [];
    for (const cat of section.categories) {
      const matches = items
        .filter((i) => i.category === cat)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      rows.push(...matches);
    }
    return rows;
  }, [section, items]);

  if (sectionItems.length === 0) return null;

  return (
    <div className="pm-section">
      <div className="pm-section-pill">
        <span>{section.title}</span>
      </div>
      <ul className="pm-items">
        {sectionItems.map((item) => (
          <li key={item.id} className="pm-item">
            <div className="pm-item-line">
              <span className="pm-item-name">{item.name}</span>
              <span className="pm-leader" aria-hidden />
              <span className="pm-item-price">{formatPrice(item.price)}</span>
            </div>
            {section.showDescription && item.description && (
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
        {/* Page 1 */}
        <div className="pm-page">
          <div className="pm-frame">
            <BrandHeader />
            <div className="pm-pagehead">
              <Flourish />
              <h1 className="pm-pagetitle">MENÚ</h1>
              <Flourish flip />
            </div>

            <CoralSprig className="pm-accent pm-accent-tl" />
            <WaveAccent className="pm-accent pm-accent-wave" />

            {PAGE_ONE.map((s) => (
              <SectionBlock key={s.title} section={s} items={items} />
            ))}

            <div className="pm-footer">
              <span className="pm-rule" />
              <span className="pm-footer-text">Precios en MXN</span>
              <span className="pm-rule" />
            </div>
            <WaveBand />
          </div>
        </div>

        {/* Page 2 */}
        <div className="pm-page">
          <div className="pm-frame">
            <BrandHeader />
            <div className="pm-pagehead">
              <Flourish />
              <h1 className="pm-pagetitle pm-pagetitle-sm">ESPECIALIDADES Y COMBOS</h1>
              <Flourish flip />
            </div>

            <CoralSprig className="pm-accent pm-accent-tl" />
            <WaveAccent className="pm-accent pm-accent-wave2" />

            {PAGE_TWO.map((s) => (
              <SectionBlock key={s.title} section={s} items={items} />
            ))}

            <div className="pm-social">
              <FollowUsQR url={FACEBOOK_URL} />
              <div className="pm-social-text">
                <Flourish />
                <div className="pm-social-sub">
                  Escanea para conocer
                  <br />
                  novedades y promociones
                </div>
              </div>
              <CoralSprig className="pm-social-coral" />
            </div>

            <div className="pm-footer">
              <span className="pm-rule" />
              <span className="pm-footer-text">Precios en MXN</span>
              <span className="pm-rule" />
            </div>
            <WaveBand />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
