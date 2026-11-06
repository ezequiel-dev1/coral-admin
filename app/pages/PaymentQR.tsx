"use client";

import { useMemo } from "react";
import QRCode from "qrcode";

/**
 * Renders a scannable QR code for a Stripe Checkout URL as inline SVG
 * (black modules on white, high contrast for reliable phone scanning).
 * The customer scans it to open the hosted Checkout page on their own device.
 */
export function PaymentQR({ url, size = 220 }: { url: string; size?: number }) {
  const matrix = useMemo(() => {
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
      const modules = qr.modules.size;
      const data = qr.modules.data;
      const rows: boolean[][] = [];
      for (let r = 0; r < modules; r++) {
        const row: boolean[] = [];
        for (let c = 0; c < modules; c++) row.push(!!data[r * modules + c]);
        rows.push(row);
      }
      return { modules, rows };
    } catch (err) {
      console.error("Failed to build payment QR:", err);
      return null;
    }
  }, [url]);

  if (!matrix) return null;

  const { modules, rows } = matrix;
  const quiet = 4; // quiet-zone modules (QR spec minimum is 4)
  const total = modules + quiet * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label="Stripe payment QR code"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={total} height={total} fill="#ffffff" />
      <g transform={`translate(${quiet}, ${quiet})`}>
        {rows.flatMap((row, r) =>
          row.map((on, c) =>
            on ? (
              <rect
                key={`${r}-${c}`}
                x={c}
                y={r}
                width={1}
                height={1}
                fill="#000000"
              />
            ) : null
          )
        )}
      </g>
    </svg>
  );
}
