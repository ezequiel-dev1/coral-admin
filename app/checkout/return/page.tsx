"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

/**
 * Stripe Checkout return page (local proof-of-concept).
 *
 * The customer lands here on their own phone after paying, so it doubles as a
 * thank-you screen: an order rating and social-follow links.
 *
 * IMPORTANT: fulfillment (marking the order paid, recording the real fee/net)
 * happens in the webhook handler, never here — a customer may pay and never
 * reach this page.
 */

// Social channels to invite the customer to follow. Edit to the real handles.
const SOCIALS = [
  { label: "Facebook", url: "https://facebook.com/coralreefandbeef", icon: "f" },
  { label: "Instagram", url: "https://instagram.com/coralreefandbeef", icon: "📷" },
];

// Google Business Profile review link.
const GOOGLE_REVIEW_URL = "https://g.page/r/CdrhQvPaBG3IEBM/review";

const CORAL = "#E48664";
const INK = "#1b2a4a";

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const active = (hover || value) >= n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} ${n > 1 ? "estrellas" : "estrella"}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 36,
              lineHeight: 1,
              padding: 2,
              color: active ? CORAL : "#d1d5db",
              transition: "color .12s ease, transform .12s ease",
              transform: active ? "scale(1.05)" : "none",
            }}
          >
            ★
          </button>
        );
      })}
    </div>
  );
}

function ReturnContent() {
  const params = useSearchParams();
  const status = params.get("status");
  const sessionId = params.get("session_id");
  const success = status === "success";

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submitRating() {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, rating, comment }),
      });
      setSubmitted(true);
    } catch {
      // Even if logging fails, thank the customer — their payment went through.
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  const card: React.CSSProperties = {
    maxWidth: 440,
    width: "100%",
    textAlign: "center",
    border: "1px solid #e9e6e1",
    borderRadius: 18,
    padding: "2rem 1.75rem",
    boxShadow: "0 10px 40px rgba(27,42,74,0.06)",
    background: "#fff",
  };

  return (
    <div
      lang="es"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        background: "linear-gradient(180deg,#faf7f4 0%,#f3f4f8 100%)",
      }}
    >
      <div style={card}>
        {/* Brand mark */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/coral-icon.png"
          alt="Coral Reef & Beef"
          width={56}
          height={56}
          style={{ margin: "0 auto 0.75rem", display: "block" }}
        />

        {!success ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 0.5rem", color: INK }}>
              Pago cancelado
            </h1>
            <p style={{ color: "#6b7280", margin: "0 0 1.5rem", fontSize: 14 }}>
              No se realizó ningún cargo. Puedes volver e intentarlo de nuevo.
            </p>
            <Link
              href="/"
              style={{
                display: "inline-block",
                background: INK,
                color: "white",
                padding: "0.65rem 1.3rem",
                borderRadius: 10,
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              Volver al cobro
            </Link>
          </>
        ) : (
          <>
            <div style={{ fontSize: 40, marginBottom: 4 }}>🙌</div>
            <h1 style={{ fontSize: 23, fontWeight: 700, margin: "0 0 0.35rem", color: INK }}>
              ¡Gracias por cenar con nosotros!
            </h1>
            <p style={{ color: "#6b7280", margin: "0 0 1.5rem", fontSize: 14 }}>
              Tu pago fue exitoso. Nos encantaría saber cómo te fue.
            </p>

            {/* Rating */}
            {!submitted ? (
              <div style={{ marginBottom: "1.75rem" }}>
                <p style={{ fontSize: 13, color: INK, margin: "0 0 0.5rem", fontWeight: 600 }}>
                  Califica tu pedido
                </p>
                <StarRating value={rating} onChange={setRating} />
                <textarea
                  // iOS/browser extensions inject attributes (e.g. __gcruniqueid)
                  // before hydration; ignore that harmless mismatch.
                  suppressHydrationWarning
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Deja un comentario (opcional)"
                  rows={3}
                  style={{
                    marginTop: "0.9rem",
                    width: "100%",
                    boxSizing: "border-box",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "0.6rem 0.7rem",
                    fontSize: 14,
                    resize: "vertical",
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={submitRating}
                  disabled={rating < 1 || submitting}
                  style={{
                    marginTop: "0.8rem",
                    width: "100%",
                    background: rating < 1 ? "#d1d5db" : CORAL,
                    color: "white",
                    border: "none",
                    padding: "0.7rem",
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: rating < 1 ? "not-allowed" : "pointer",
                  }}
                >
                  {submitting ? "Enviando..." : "Enviar calificación"}
                </button>
              </div>
            ) : (
              <div
                style={{
                  marginBottom: "1.75rem",
                  padding: "0.9rem",
                  borderRadius: 12,
                  background: "#f0fdf4",
                  color: "#15803d",
                  fontSize: 14,
                  fontWeight: 500,
                }}
              >
                ¡Gracias por tus comentarios! ⭐
              </div>
            )}

            {/* Google review */}
            <div style={{ marginBottom: "1.75rem" }}>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 0.7rem" }}>
                ¿Te gustó tu experiencia? Cuéntale al mundo en Google
              </p>
              <a
                href={GOOGLE_REVIEW_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  boxSizing: "border-box",
                  border: `1px solid ${CORAL}`,
                  borderRadius: 10,
                  padding: "0.7rem",
                  textDecoration: "none",
                  color: INK,
                  fontSize: 14,
                  fontWeight: 600,
                }}
              >
                <span aria-hidden="true">⭐</span>
                Déjanos una reseña en Google
              </a>
            </div>

            {/* Social follow */}
            <div style={{ borderTop: "1px solid #eee", paddingTop: "1.25rem" }}>
              <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 0.7rem" }}>
                Síguenos para conocer promociones y eventos
              </p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                {SOCIALS.map((s) => (
                  <a
                    key={s.label}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #e5e7eb",
                      borderRadius: 10,
                      padding: "0.5rem 0.9rem",
                      textDecoration: "none",
                      color: INK,
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    <span aria-hidden="true">{s.icon}</span>
                    {s.label}
                  </a>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={null}>
      <ReturnContent />
    </Suspense>
  );
}
