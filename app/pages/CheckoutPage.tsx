"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useAuth } from "../auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Receipt,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  QrCode,
  Copy,
  Check,
  Landmark,
  SplitSquareHorizontal,
  RotateCcw,
  Banknote,
  Printer,
  Paperclip,
  ClipboardPaste,
  Camera,
  X,
  DollarSign,
  Smartphone,
  Inbox,
} from "lucide-react";
import {
  fetchOrders,
  updateOrderStatus,
  deleteOrder,
  getOrder,
  fetchOpenChecks,
  saveCashReconciliation,
  fetchCashReconciliations,
  markCashReconciliationReviewed,
  type CashReconciliation,
  type CashEvidence,
  saveOpenCheck,
  setOpenCheckTip,
  closeCheckPaid,
  getExchangeRate,
  setExchangeRate,
  type Currency,
  type ExchangeRate,
  splitCheckByItem,
  unsplitCheck,
  Order,
  OrderLineItem,
  OrderStatus,
  PaymentMethod,
} from "../lib/dynamodb";
import { uploadCorteEvidence, uploadTransferEvidence, getObjectUrl } from "../lib/receipts";
import { PaymentQR } from "./PaymentQR";
import { SeatingChart } from "./SeatingChart";
import { tableName } from "../lib/tableName";
import { authedFetch } from "../lib/apiFetch";
import type { CardPresentPayment } from "../lib/cardPresent";
import { printAgent, canUsePrintAgent, toPrinterText, PRINT_COLUMNS } from "../lib/printAgent";
import { buildSaleTickets } from "../lib/saleTicket";
import { useIsTouchDevice } from "./IngredientPicker";
import { SplitCheckDialog, type SplitBucketResult } from "./SplitCheckDialog";

/** Phases of the card-via-QR payment flow. */
type CardPayPhase = "idle" | "creating" | "awaiting" | "paid";

/** Bank details shown to the customer when paying by transfer. */
const TRANSFER_DETAILS = {
  account: "Coral Reef and Beef",
  bank: "BBVA",
  clabe: "012028001266858382",
};

/** Word-wrap text to the thermal printer width. */
function wrapPrintText(text: string, width = PRINT_COLUMNS): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Menu prices already include IVA, so no tax is added on top.
const TAX_RATE = 0;

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type CartLine = OrderLineItem;

export function CheckoutPage() {
  const { t, lang } = useTranslation();
  const { user } = useAuth();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  // Current check being built, scoped to the selected table.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  // DB id of the open check for the selected table (null until first save).
  const [currentCheckId, setCurrentCheckId] = useState<string | null>(null);
  // All open checks, keyed for floor-plan occupancy + resuming a table's cart.
  const [openChecks, setOpenChecks] = useState<Order[]>([]);
  const [checkSaving, setCheckSaving] = useState(false);

  // Checkout dialog
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Card charged by hand in the Stripe Dashboard app (Tap to Pay). Recorded as a
  // "card" payment; `tapPayments` are recent in-person Stripe payments we poll for
  // so the cashier can match one to this check by amount.
  const [stripeApp, setStripeApp] = useState(false);
  const [tapPayments, setTapPayments] = useState<CardPresentPayment[]>([]);
  const [tapError, setTapError] = useState(false);

  // Card-via-QR payment flow
  const [cardPhase, setCardPhase] = useState<CardPayPhase>("idle");
  const [cardPayUrl, setCardPayUrl] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Currency the customer pays in (cash only for USD) and cash handed over, in that currency.
  const [currency, setCurrency] = useState<Currency>("MXN");
  const [amountReceived, setAmountReceived] = useState("");

  // Shared MXN-per-USD rate + its update dialog.
  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [showRate, setShowRate] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [rateSaving, setRateSaving] = useState(false);
  const [rateError, setRateError] = useState("");

  // Result of the last automatic receipt print.
  const [receiptMsg, setReceiptMsg] = useState<{ ok: boolean; text: string; orderId?: string } | null>(null);

  // Tip: "" = no tip; otherwise a peso amount as a string
  const [tipInput, setTipInput] = useState("");

  // Transfer bank details: brief "copied" feedback on the CLABE.
  const [clabeCopied, setClabeCopied] = useState(false);
  // Printing the bank details on the thermal printer (via the Print Agent).
  const [printingBank, setPrintingBank] = useState(false);
  const [bankPrintMsg, setBankPrintMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Proof of the bank transfer (screenshot pasted from the clipboard), uploaded when the check is paid.
  const [transferProof, setTransferProof] = useState<{ file: File; url: string } | null>(null);
  const [proofMsg, setProofMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Custom-percentage tip: whether the % field is shown, and its value.
  const [customPctMode, setCustomPctMode] = useState(false);
  const [customPctInput, setCustomPctInput] = useState("");

  // Split-check dialog
  const [showSplit, setShowSplit] = useState(false);
  // When a split table is tapped, show its sub-checks to pay one at a time.
  const [splitPickerTable, setSplitPickerTable] = useState<string | null>(null);

  // Recent orders view
  const [showOrders, setShowOrders] = useState(false);

  // End-of-day cash reconciliation (Corte de Caja)
  const [showReconcile, setShowReconcile] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [reconcileComments, setReconcileComments] = useState("");
  const [reconcileSaving, setReconcileSaving] = useState(false);
  // Files picked for the corte; uploaded to S3 when saving.
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Transfer proof pickers: photo library and tablet camera.
  const proofGalleryInputRef = useRef<HTMLInputElement>(null);
  const proofCameraInputRef = useRef<HTMLInputElement>(null);
  const isTouchDevice = useIsTouchDevice();
  // "new" = fill in today's corte; "history" = review saved ones.
  const [reconcileView, setReconcileView] = useState<"new" | "history">("new");
  const [reconciliations, setReconciliations] = useState<CashReconciliation[]>([]);
  const [expandedCorte, setExpandedCorte] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    getExchangeRate()
      .then(setRate)
      .catch((err) => console.error("Failed to load exchange rate:", err));
  }, []);

  async function openRateDialog() {
    setRateError("");
    setRateInput(rate ? String(rate.rate) : "");
    setShowRate(true);
    // Another tablet may have changed it since this page loaded.
    try {
      const fresh = await getExchangeRate();
      if (fresh) {
        setRate(fresh);
        setRateInput(String(fresh.rate));
      }
    } catch (err) {
      console.error("Failed to refresh exchange rate:", err);
    }
  }

  async function saveRate() {
    const value = parseFloat(rateInput.replace(/[^0-9.]/g, ""));
    if (isNaN(value) || value <= 0) {
      setRateError(t("checkout.exchangeRateInvalid"));
      return;
    }
    setRateSaving(true);
    try {
      setRate(await setExchangeRate(Math.round(value * 10000) / 10000, user?.name || user?.email || ""));
      setShowRate(false);
    } catch (err) {
      console.error("Failed to save exchange rate:", err);
      setRateError(t("checkout.exchangeRateSaveFailed"));
    } finally {
      setRateSaving(false);
    }
  }

  /** Pulse the cash drawer on its own (no receipt). */
  async function openCashDrawer() {
    if (!canUsePrintAgent()) {
      setReceiptMsg({ ok: false, text: t("checkout.drawerNoPrinter") });
      return;
    }
    const result = await printAgent.openDrawer();
    setReceiptMsg(
      result.ok
        ? { ok: true, text: t("checkout.drawerOpened") }
        : { ok: false, text: t("saleTicket.drawerFailed") },
    );
  }

  /**
   * Print the customer copy and the restaurant's record copy for a paid order.
   * With `openDrawer` (cash sales) the drawer pulses with the first copy; if that
   * print fails, the drawer is still opened on its own so the cashier can give change.
   */
  async function printSaleReceipt(orderId: string, openDrawer = false) {
    if (!canUsePrintAgent()) return;
    let drawerPending = openDrawer;
    try {
      const order = await getOrder(orderId);
      if (!order) throw new Error("Order not found");
      const jobs = buildSaleTickets(
        order,
        t,
        { cashier: user?.name || user?.email || "", exchangeRate: rate?.rate },
        openDrawer
      );
      // One at a time so the copies come out in order; stop at the first failure.
      for (const job of jobs) {
        const result = await printAgent.print(job);
        if (result.ok && job.openDrawer) drawerPending = false;
        if (!result.ok) {
          const reason =
            result.error === "network"
              ? t("printer.errNetwork")
              : result.error === "timeout"
                ? t("printer.errTimeout")
                : result.error === "unsupported"
                  ? t("printer.errUnsupported")
                  : result.message || `HTTP ${result.status}`;
          throw new Error(reason);
        }
      }
      setReceiptMsg({ ok: true, text: t("saleTicket.printSent") });
    } catch (err) {
      console.error("Failed to print sale receipt:", err);
      const reason = err instanceof Error ? err.message : String(err);
      let text = `${t("saleTicket.printFailed")} ${reason}`;
      if (drawerPending) {
        // A failed print (or a 502 that may not have reached the printer) must not keep the drawer shut.
        const drawer = await printAgent.openDrawer();
        if (!drawer.ok) text += ` ${t("saleTicket.drawerFailed")}`;
      }
      // Keep the order id so the banner can offer a retry (reprints only, never reopens the drawer).
      setReceiptMsg({ ok: false, text, orderId });
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const [ords, checks] = await Promise.all([fetchOrders(), fetchOpenChecks()]);
      setOrders(ords);
      setOpenChecks(checks);
    } catch (err) {
      console.error("Failed to load checkout data:", err);
    } finally {
      setLoading(false);
    }
  }

  /** Reload just the open checks (after a table is paid/closed). */
  async function reloadOpenChecks() {
    try {
      setOpenChecks(await fetchOpenChecks());
    } catch (err) {
      console.error("Failed to reload open checks:", err);
    }
  }

  /**
   * Select a table: load its open check into the cart, or start an empty cart
   * if the table is free. Tapping the already-selected table deselects it.
   */
  function selectTable(tableId: string) {
    if (selectedTable === tableId) {
      setSelectedTable(null);
      setCurrentCheckId(null);
      setCart([]);
      return;
    }
    const checks = openChecks.filter((o) => o.tableLabel === tableId);
    // A split table has multiple open sub-checks: let the user pick one to pay.
    if (checks.length > 1) {
      setSplitPickerTable(tableId);
      return;
    }
    const existing = checks[0];
    setSelectedTable(tableId);
    setCurrentCheckId(existing?.id ?? null);
    setCart(existing ? existing.items : []);
  }

  /** Open takeout orders (they share one label, so they're picked by id). */
  const takeoutChecks = useMemo(
    () => openChecks.filter((o) => o.serviceType === "takeout"),
    [openChecks]
  );

  /** Select (or deselect) a takeout order to pay out. */
  function selectTakeout(order: Order) {
    if (currentCheckId === order.id) {
      setSelectedTable(null);
      setCurrentCheckId(null);
      setCart([]);
      return;
    }
    setSelectedTable(order.tableLabel);
    setCurrentCheckId(order.id);
    setCart(order.items);
  }

  /** Load a specific sub-check (by id) into the working cart for payout. */
  function openSubCheck(order: Order) {
    setSplitPickerTable(null);
    setSelectedTable(order.tableLabel);
    setCurrentCheckId(order.id);
    setCart(order.items);
  }

  /**
   * Undo a split: merge the table's open checks back into one, so the user can
   * start the split over. Loads the merged check into the cart.
   */
  async function clearSplit(tableLabel: string) {
    try {
      const merged = await unsplitCheck(
        tableLabel,
        user?.name || user?.email || "",
        TAX_RATE
      );
      setSplitPickerTable(null);
      await loadData();
      if (merged) {
        setSelectedTable(tableLabel);
        setCurrentCheckId(merged.id);
        setCart(merged.items);
      }
    } catch (err) {
      console.error("Failed to clear split:", err);
    }
  }

  // While awaiting a card payment, poll the order until the Stripe webhook
  // flips it to `paid` (or `cancelled`). Stops on resolution or unmount.
  useEffect(() => {
    if (cardPhase !== "awaiting" || !pendingOrderId) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const order = await getOrder(pendingOrderId);
        if (cancelled || !order) return;
        if (order.status === "paid") {
          setCardPhase("paid");
          printSaleReceipt(order.id);
          fetchOrders()
            .then((ords) => {
              if (!cancelled) setOrders(ords);
            })
            .catch(() => {});
        } else if (order.status === "cancelled") {
          // Payment expired/failed: close out the QR flow.
          setCardPhase("idle");
          setCardPayUrl(null);
          setPendingOrderId(null);
        }
      } catch (err) {
        console.error("Failed to poll order status:", err);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [cardPhase, pendingOrderId]);

  function changeQuantity(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l
        )
        .filter((l) => l.quantity > 0)
    );
  }

  function removeLine(menuItemId: string) {
    if (!confirm(t("checkout.confirmRemoveItem"))) return;
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }

  function clearCart() {
    setCart([]);
    setSelectedTable(null);
    setCurrentCheckId(null);
    setOrderNotes("");
    setPaymentMethod("cash");
    setStripeApp(false);
    setCurrency("MXN");
    setAmountReceived("");
    setTipInput("");
    setCustomPctMode(false);
    setCustomPctInput("");
  }

  const subtotal = useMemo(
    () => cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0),
    [cart]
  );
  const tax = useMemo(() => Math.round(subtotal * TAX_RATE * 100) / 100, [subtotal]);
  const tip = useMemo(() => {
    const num = parseFloat((tipInput || "").replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }, [tipInput]);
  const total = useMemo(
    () => Math.round((subtotal + tax + tip) * 100) / 100,
    [subtotal, tax, tip]
  );
  const itemCount = useMemo(() => cart.reduce((n, l) => n + l.quantity, 0), [cart]);

  // While the "Card (Stripe app)" option is showing, poll for in-person payments
  // so the one the cashier just took on the iPhone can be matched to this check.
  const tapWatching = showCheckout && stripeApp && paymentMethod === "card" && cardPhase === "idle";
  useEffect(() => {
    if (!tapWatching) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await authedFetch("/api/card-present");
        if (!res.ok) throw new Error(`card-present ${res.status}`);
        const data: { payments?: CardPresentPayment[] } = await res.json();
        if (cancelled) return;
        setTapPayments(data.payments ?? []);
        setTapError(false);
      } catch (err) {
        console.error("Failed to load card payments:", err);
        if (!cancelled) setTapError(true);
      }
    }
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tapWatching]);

  // Unclaimed payments whose amount equals this check's total (centavo-exact).
  const tapMatches = useMemo(() => {
    const used = new Set(
      orders.map((o) => o.stripePaymentIntentId).filter((id): id is string => !!id)
    );
    const cents = Math.round(total * 100);
    return tapPayments.filter((p) => !used.has(p.id) && Math.round(p.amount * 100) === cents);
  }, [tapPayments, orders, total]);

  // Amounts stay in MXN; for USD the customer is shown the total converted at the current rate.
  const payingUsd = paymentMethod === "cash" && currency === "USD";
  const totalInCurrency = useMemo(
    () => (payingUsd && rate ? Math.round((total / rate.rate) * 100) / 100 : total),
    [payingUsd, rate, total]
  );
  const received = useMemo(() => {
    const num = parseFloat((amountReceived || "").replace(/[^0-9.]/g, ""));
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }, [amountReceived]);
  const changeDue =
    paymentMethod === "cash" && received > 0 ? Math.max(Math.round((received - totalInCurrency) * 100) / 100, 0) : 0;
  const receivedShort = paymentMethod === "cash" && received > 0 && received < totalInCurrency;
  const usdNeedsRate = payingUsd && !rate;
  const formatCurrencyAmount = (v: number) =>
    v.toLocaleString("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Auto-save the selected table's cart to its open check (debounced), so an
  // in-progress check survives refresh/close and syncs across devices. Skips
  // while a card payment is awaiting (the order is locked for the webhook) and
  // avoids creating an empty check for a table that has none yet.
  useEffect(() => {
    if (!selectedTable) return;
    if (cardPhase !== "idle") return;
    if (cart.length === 0 && !currentCheckId) return;

    let cancelled = false;
    const handle = setTimeout(async () => {
      setCheckSaving(true);
      try {
        const id = await saveOpenCheck(currentCheckId, {
          tableLabel: selectedTable,
          server: user?.name || user?.email || "",
          items: cart,
          subtotal,
          tax,
          total: Math.round((subtotal + tax) * 100) / 100,
          notes: orderNotes.trim(),
        });
        if (cancelled) return;
        if (!currentCheckId) setCurrentCheckId(id);
        // Keep floor-plan occupancy in sync without a full reload.
        reloadOpenChecks();
      } catch (err) {
        console.error("Failed to save open check:", err);
      } finally {
        if (!cancelled) setCheckSaving(false);
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart, selectedTable]);

  // Set tip as a percentage of the pre-tax subtotal
  function setTipPercent(pct: number) {
    const amount = Math.round(subtotal * pct * 100) / 100;
    setTipInput(amount > 0 ? String(amount) : "");
  }

  // Apply a custom percentage typed into the "Custom %" field.
  function applyCustomPercent(raw: string) {
    setCustomPctInput(raw);
    const pct = parseFloat((raw || "").replace(/[^0-9.]/g, ""));
    if (isNaN(pct) || pct <= 0) {
      setTipInput("");
      return;
    }
    setTipPercent(pct / 100);
  }

  const tipPercentActive = useMemo(() => {
    if (subtotal <= 0 || tip <= 0) return null;
    const pct = (tip / subtotal) * 100;
    const match = [10, 15, 20].find((p) => Math.abs(p - pct) < 0.5);
    return match ?? null;
  }, [tip, subtotal]);

  // Shared tip pool, across non-cancelled orders. Tips are pooled and shared
  // between kitchen and servers at Saturday payout — not tracked per person.
  const tipPool = useMemo(() => {
    // Start of the current tip week: the most recent Saturday 00:00 (local).
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    // getDay(): 0 = Sun ... 6 = Sat. Days since the last Saturday.
    const daysSinceSaturday = (now.getDay() + 1) % 7;
    weekStart.setDate(weekStart.getDate() - daysSinceSaturday);

    let weekTips = 0;
    let weekOrders = 0;
    let allTimeTips = 0;
    let allTimeOrders = 0;

    for (const order of orders) {
      if (order.status === "cancelled") continue;
      const orderTip = order.tip ?? 0;
      if (orderTip <= 0) continue;

      allTimeTips = Math.round((allTimeTips + orderTip) * 100) / 100;
      allTimeOrders += 1;

      if (order.createdAt && new Date(order.createdAt) >= weekStart) {
        weekTips = Math.round((weekTips + orderTip) * 100) / 100;
        weekOrders += 1;
      }
    }

    return { weekStart, weekTips, weekOrders, allTimeTips, allTimeOrders };
  }, [orders]);

  // Card processing fees and net received, across non-cancelled card orders.
  const feeSummary = useMemo(() => {
    let weekFees = 0;
    let weekNet = 0;
    let allTimeFees = 0;
    let allTimeNet = 0;
    let cardOrders = 0;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setHours(0, 0, 0, 0);
    const daysSinceSaturday = (now.getDay() + 1) % 7;
    weekStart.setDate(weekStart.getDate() - daysSinceSaturday);

    for (const order of orders) {
      if (order.status === "cancelled") continue;
      const fee = order.processingFee ?? 0;
      if (order.paymentMethod !== "card" || fee <= 0) continue;
      const net = order.netAmount ?? 0;

      cardOrders += 1;
      allTimeFees = Math.round((allTimeFees + fee) * 100) / 100;
      allTimeNet = Math.round((allTimeNet + net) * 100) / 100;

      if (order.createdAt && new Date(order.createdAt) >= weekStart) {
        weekFees = Math.round((weekFees + fee) * 100) / 100;
        weekNet = Math.round((weekNet + net) * 100) / 100;
      }
    }

    return { weekFees, weekNet, allTimeFees, allTimeNet, cardOrders };
  }, [orders]);

  async function handleSplitConfirm(buckets: SplitBucketResult[]) {
    if (!selectedTable) return;
    try {
      // Ensure the current cart is persisted as the open check first, so the
      // split has a concrete original to replace.
      const originalId = await saveOpenCheck(currentCheckId, {
        tableLabel: selectedTable,
        server: user?.name || user?.email || "",
        items: cart,
        subtotal,
        tax,
        total: Math.round((subtotal + tax) * 100) / 100,
        notes: orderNotes.trim(),
      });

      // Recompute tax/total per bucket at the same rate.
      const splitBuckets = buckets.map((b) => {
        const bTax = Math.round(b.subtotal * TAX_RATE * 100) / 100;
        return {
          label: b.label,
          items: b.items,
          subtotal: b.subtotal,
          tax: bTax,
          total: Math.round((b.subtotal + bTax) * 100) / 100,
        };
      });

      await splitCheckByItem(
        originalId,
        selectedTable,
        user?.name || user?.email || "",
        splitBuckets
      );

      setShowSplit(false);
      // Clear the working cart; the table now holds sub-checks instead.
      setCart([]);
      setCurrentCheckId(null);
      setSelectedTable(null);
      await loadData();
    } catch (err) {
      console.error("Failed to split check:", err);
    }
  }

  async function copyClabe() {
    try {
      await navigator.clipboard.writeText(TRANSFER_DETAILS.clabe);
      setClabeCopied(true);
      setTimeout(() => setClabeCopied(false), 1500);
    } catch (err) {
      console.error("Failed to copy CLABE:", err);
    }
  }

  function setProofFile(file: File | null) {
    setTransferProof((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return file ? { file, url: URL.createObjectURL(file) } : null;
    });
  }

  function proofFromBlob(blob: Blob): File {
    const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
    return new File([blob], `transfer-${Date.now()}.${ext}`, { type: blob.type });
  }

  /** Gallery / camera inputs: take the chosen image as the transfer proof. */
  function onProofFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    setProofMsg(null);
    setProofFile(file.type.startsWith("image/") ? proofFromBlob(file) : null);
  }

  /** "Paste" button: read an image copied on the tablet (e.g. from WhatsApp) from the clipboard. */
  async function pasteTransferProof() {
    setProofMsg(null);
    try {
      if (!navigator.clipboard?.read) throw new Error("unsupported");
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((ty) => ty.startsWith("image/"));
        if (type) {
          setProofFile(proofFromBlob(await item.getType(type)));
          return;
        }
      }
      setProofMsg({ ok: false, text: t("checkout.pasteProofEmpty") });
    } catch (err) {
      console.error("Failed to read the clipboard:", err);
      setProofMsg({ ok: false, text: t("checkout.pasteProofDenied") });
    }
  }

  // Also accept a regular paste (long-press > Paste, or Ctrl+V) while the transfer section is showing.
  useEffect(() => {
    if (!showCheckout || paymentMethod !== "transfer") return;
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.kind === "file" && i.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      e.preventDefault();
      setProofMsg(null);
      setProofFile(proofFromBlob(file));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [showCheckout, paymentMethod]);

  // Release the preview URL when leaving the page.
  useEffect(() => {
    return () => {
      if (transferProof) URL.revokeObjectURL(transferProof.url);
    };
  }, [transferProof]);

  /** Print the bank details (and amount due) on the thermal printer via the Print Agent. */
  async function printBankInfo() {
    if (printingBank) return;
    setPrintingBank(true);
    setBankPrintMsg(null);
    // 48 columns at size 1 (24 at size 2). Customer-facing, so it goes to the register printer.
    const result = await printAgent.print({
      printer: "register",
      lines: [
        { text: "CORAL", align: "center", bold: true, size: 2 },
        { text: "REEF & BEEF", align: "center", bold: true, size: 2 },
        "",
        { text: toPrinterText(t("checkout.transferTitle")), align: "center", bold: true },
        "-".repeat(PRINT_COLUMNS),
        toPrinterText(`${t("checkout.transferBank")}: ${TRANSFER_DETAILS.bank}`),
        toPrinterText(`${t("checkout.transferAccount")}: ${TRANSFER_DETAILS.account}`),
        toPrinterText(`${t("checkout.transferClabe")}: ${TRANSFER_DETAILS.clabe}`),
        "-".repeat(PRINT_COLUMNS),
        { text: toPrinterText(`${t("checkout.total")}: ${formatMoney(total)}`), align: "right", bold: true },
        "",
        // Spanish proof-of-transfer notice (wrapped to the printer width).
        ...wrapPrintText(
          "Por favor envíe un comprobante por WhatsApp, o muestre la pantalla del teléfono con la confirmación de la transferencia.",
        ).map((text) => ({ text: toPrinterText(text), align: "center" as const })),
        { text: "WhatsApp: 664 800 7789", align: "center", bold: true },
      ],
      // Extra blank lines so the total clears the cutter before the paper is cut.
      feed: 7,
      cut: true,
    });
    const text = result.ok
      ? t("checkout.printBankInfoSent")
      : result.error === "timeout"
        ? t("printer.errTimeout")
        : result.error === "unsupported"
          ? t("printer.errUnsupported")
          : result.error === "other"
            ? result.message || t("printer.errNetwork")
            : t("printer.errNetwork");
    setBankPrintMsg({ ok: result.ok, text });
    setPrintingBank(false);
  }

  /**
   * Close the check. `tapPayment` is an in-person Stripe payment (Tap to Pay)
   * the cashier matched to this check; without it, "Card (Stripe app)" is
   * recorded manually.
   */
  async function handleSubmitOrder(tapPayment?: CardPresentPayment) {
    if (cart.length === 0 || !selectedTable) return;
    if (usdNeedsRate || receivedShort) return;

    if (tapPayment) {
      // The payment may have been claimed by another tablet since the last refresh.
      try {
        const fresh = await fetchOrders();
        setOrders(fresh);
        if (fresh.some((o) => o.stripePaymentIntentId === tapPayment.id)) return;
      } catch (err) {
        console.error("Failed to verify card payment:", err);
        return;
      }
    }

    if (paymentMethod === "card" && !stripeApp) {
      // Card payments are completed by the customer on their own phone: we
      // create a Stripe Checkout Session and show its URL as a QR code to
      // scan. The table's open check stays `open`; the Stripe webhook flips it
      // to `paid` and writes the real fee/net. We poll until that happens.
      setSubmitting(true);
      setCardPhase("creating");
      try {
        // Ensure the open check exists and persist the chosen tip onto it.
        const checkId = await saveOpenCheck(currentCheckId, {
          tableLabel: selectedTable,
          server: user?.name || user?.email || "",
          items: cart,
          subtotal,
          tax,
          total: Math.round((subtotal + tax) * 100) / 100,
          notes: orderNotes.trim(),
        });
        setCurrentCheckId(checkId);
        await setOpenCheckTip(checkId, tip, total);

        const res = await authedFetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: checkId,
            tableLabel: selectedTable,
            tax,
            tip,
            lines: cart.map((l) => ({
              name: l.name,
              unitPrice: l.unitPrice,
              quantity: l.quantity,
            })),
          }),
        });

        if (!res.ok) {
          throw new Error(`Checkout session failed (${res.status})`);
        }

        const data: { id?: string; url?: string } = await res.json();
        if (!data.url || !data.id) throw new Error("No checkout session returned");

        // Show the QR and start polling for payment confirmation.
        setPendingOrderId(checkId);
        setPendingSessionId(data.id);
        setCardPayUrl(data.url);
        setCardPhase("awaiting");
      } catch (err) {
        console.error("Failed to start card payment:", err);
        setCardPhase("idle");
        setCardPayUrl(null);
        setPendingOrderId(null);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Non-card (cash / transfer / other): close out the table's check as paid
    // immediately. No processing fee applies, so net equals the total. The
    // table frees up once the check is `paid`.
    setSubmitting(true);
    try {
      // Make sure the open check exists and holds the latest cart, then close
      // it with the final tip/total/payment method.
      const checkId = await saveOpenCheck(currentCheckId, {
        tableLabel: selectedTable,
        server: user?.name || user?.email || "",
        items: cart,
        subtotal,
        tax,
        total: Math.round((subtotal + tax) * 100) / 100,
        notes: orderNotes.trim(),
      });
      // Attach the transfer proof first; if the upload fails, stay here so it can be retried.
      let transferEvidenceKey: string | undefined;
      if (paymentMethod === "transfer" && transferProof) {
        try {
          transferEvidenceKey = await uploadTransferEvidence(transferProof.file);
        } catch (err) {
          console.error("Failed to upload transfer proof:", err);
          setProofMsg({ ok: false, text: t("checkout.proofUploadFailed") });
          return;
        }
      }
      const isCash = paymentMethod === "cash";
      await closeCheckPaid(checkId, {
        tip,
        total,
        paymentMethod,
        transferEvidenceKey,
        cashier: user?.name || user?.email || "",
        currency: payingUsd ? "USD" : "MXN",
        exchangeRate: rate?.rate,
        // Cash only: what the customer handed over (defaults to the exact total) and the change.
        amountTendered: isCash ? (received > 0 ? received : totalInCurrency) : undefined,
        change: isCash ? changeDue : undefined,
        // Matched Tap to Pay payment: keep the real Stripe fee/net for the books.
        stripePaymentIntentId: tapPayment?.id,
        processingFee: tapPayment ? tapPayment.fee : undefined,
        netAmount: tapPayment && tapPayment.net !== null ? tapPayment.net : undefined,
      });
      setProofFile(null);
      setProofMsg(null);
      setShowCheckout(false);
      clearCart();
      await loadData();
      // Customer copy + restaurant copy. Failure doesn't undo the payment.
      await printSaleReceipt(checkId, isCash);
    } catch (err) {
      console.error("Failed to record order:", err);
    } finally {
      setSubmitting(false);
    }
  }

  /** Close the checkout dialog and reset the card/QR flow. */
  function closeCheckout() {
    setShowCheckout(false);
    setProofFile(null);
    setProofMsg(null);
    setCardPhase("idle");
    setCardPayUrl(null);
    setPendingOrderId(null);
    setPendingSessionId(null);
    setTapPayments([]);
  }

  /** After a successful card payment: clear the cart and close out. */
  function finishCardPayment() {
    closeCheckout();
    clearCart();
    loadData();
  }

  /**
   * Cancel an awaiting card payment: expire the Stripe session (so the QR can
   * no longer be paid) and mark the order cancelled, then close the dialog.
   */
  async function cancelCardPayment() {
    if (pendingSessionId && pendingOrderId) {
      setCancelling(true);
      try {
        await authedFetch("/api/checkout/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: pendingSessionId,
            orderId: pendingOrderId,
          }),
        });
      } catch (err) {
        console.error("Failed to cancel card payment:", err);
      } finally {
        setCancelling(false);
      }
    }
    closeCheckout();
    loadData();
  }

  async function handleUpdateStatus(order: Order, status: OrderStatus) {
    try {
      await updateOrderStatus(order.id, status, order.paymentMethod);
      await loadData();
    } catch (err) {
      console.error("Failed to update order:", err);
    }
  }

  async function handleDeleteOrder(order: Order) {
    if (!confirm(t("checkout.confirmDelete"))) return;
    try {
      await deleteOrder(order.id);
      await loadData();
    } catch (err) {
      console.error("Failed to delete order:", err);
    }
  }

  function formatDate(iso: string): string {
    if (!iso) return "";
    return new Date(iso).toLocaleString(lang, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // Today's paid cash orders (local day), for the end-of-day cash count.
  const cashToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todays = orders.filter(
      (o) =>
        o.status === "paid" &&
        o.paymentMethod === "cash" &&
        new Date(o.paidAt || o.createdAt).getTime() >= start.getTime()
    );
    return {
      count: todays.length,
      sales: todays.reduce((s, o) => s + (o.total - (o.tip ?? 0)), 0),
      tips: todays.reduce((s, o) => s + (o.tip ?? 0), 0),
      total: todays.reduce((s, o) => s + o.total, 0),
    };
  }, [orders]);

  // CurrencyInput reports formatted strings like "$1,234.00"; strip to a number.
  const parseMoneyInput = (v: string) => parseFloat(v.replace(/[^0-9.]/g, "")) || 0;
  // Today's paid non-cash orders (card + bank transfer). These go to the bank,
  // not the drawer, so they're reported alongside the cash count but never
  // included in the expected cash.
  const bankToday = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const todays = orders.filter(
      (o) =>
        o.status === "paid" &&
        (o.paymentMethod === "card" || o.paymentMethod === "transfer") &&
        new Date(o.paidAt || o.createdAt).getTime() >= start.getTime()
    );
    const sum = (list: Order[], f: (o: Order) => number) =>
      list.reduce((s, o) => s + f(o), 0);
    const card = todays.filter((o) => o.paymentMethod === "card");
    const transfer = todays.filter((o) => o.paymentMethod === "transfer");
    return {
      cardCount: card.length,
      cardTotal: sum(card, (o) => o.total),
      cardFees: sum(card, (o) => o.processingFee ?? 0),
      cardNet: sum(card, (o) => o.netAmount ?? o.total),
      transferCount: transfer.length,
      transferTotal: sum(transfer, (o) => o.total),
      total: sum(todays, (o) => o.total),
    };
  }, [orders]);

  const expectedCash = parseMoneyInput(openingFloat) + cashToday.total;
  const cashDifference = parseMoneyInput(countedCash) - expectedCash;

  /** Print the reconciliation as a standalone receipt-style page in a popup. */
  function openPrintWindow(): Window | null {
    return window.open("", "_blank", "width=420,height=640");
  }

  /** `win` may be pre-opened (before an await) so popup blockers allow it. */
  function printReconciliation(rec: CashReconciliation, win?: Window | null) {
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const diff = rec.difference;
    const balanced = Math.abs(diff) < 0.005;
    const diffLabel = balanced
      ? t("checkout.balanced")
      : diff > 0
        ? t("checkout.over")
        : t("checkout.short");
    const row = (label: string, value: string, bold = false) =>
      `<div class="row${bold ? " bold" : ""}"><span>${esc(label)}</span><span>${esc(value)}</span></div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8" />
<title>${esc(t("checkout.cashReconciliation"))}</title>
<style>
  body{font:14px -apple-system,Helvetica,Arial,sans-serif;max-width:320px;margin:24px auto;color:#000}
  h1{font-size:18px;margin:0 0 4px;text-align:center}
  .sub{text-align:center;font-size:12px;color:#555;margin-bottom:12px}
  .row{display:flex;justify-content:space-between;padding:2px 0}
  .bold{font-weight:700;border-top:1px solid #000;margin-top:4px;padding-top:4px}
  .comments{margin-top:12px;white-space:pre-wrap;font-size:13px}
  .sig{margin-top:40px;border-top:1px solid #000;text-align:center;font-size:12px;padding-top:4px}
</style></head><body>
<h1>${esc(t("checkout.cashReconciliation"))}</h1>
<div class="sub">${esc(formatDate(rec.createdAt))} · ${rec.cashOrderCount} ${esc(t("checkout.ordersLabel"))}</div>
${row(t("checkout.openingFloat"), formatMoney(rec.openingFloat))}
${row(t("checkout.cashSales"), formatMoney(rec.cashSales))}
${row(t("checkout.cashTips"), formatMoney(rec.cashTips))}
${row(t("checkout.expectedCash"), formatMoney(rec.expectedCash), true)}
${row(t("checkout.countedCash"), formatMoney(rec.countedCash))}
${row(diffLabel, formatMoney(Math.abs(diff)), true)}
<div class="sub" style="margin-top:14px"><strong>${esc(t("checkout.bankTransactions"))}</strong></div>
${row(`${t("checkout.cardSales")} (${rec.cardCount})`, formatMoney(rec.cardTotal))}
${row(t("checkout.processingFee"), "− " + formatMoney(rec.cardFees))}
${row(`${t("checkout.transferSales")} (${rec.transferCount})`, formatMoney(rec.transferTotal))}
${row(t("checkout.totalBank"), formatMoney(rec.bankTotal), true)}
${
  rec.comments.trim()
    ? `<div class="comments"><strong>${esc(t("checkout.comments"))}:</strong><br/>${esc(rec.comments.trim())}</div>`
    : ""
}
${
  (rec.evidence ?? []).length > 0
    ? `<div class="comments"><strong>${esc(t("checkout.evidence"))} (${rec.evidence!.length}):</strong><br/>${rec.evidence!.map((e) => esc(e.name)).join("<br/>")}</div>`
    : ""
}
<div class="sig">${esc(rec.createdBy)}</div>
${
  rec.reviewedBy
    ? `<div class="sub" style="margin-top:8px">${esc(t("checkout.reviewedBy"))}: ${esc(rec.reviewedBy)} · ${esc(formatDate(rec.reviewedAt || ""))}</div>`
    : ""
}
</body></html>`;

    const w = win ?? openPrintWindow();
    if (!w) return; // popup blocked
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  }

  /** Save today's reconciliation so other managers can review it, then print. */
  async function saveAndPrintReconciliation() {
    // Open the print window now, inside the click, so it isn't popup-blocked.
    const printWin = openPrintWindow();
    setReconcileSaving(true);
    try {
      // Upload attached evidence first so the record only references stored files.
      const evidence: CashEvidence[] = [];
      for (const file of evidenceFiles) {
        const key = await uploadCorteEvidence(file);
        evidence.push({
          key,
          name: file.name,
          contentType: file.type || "application/octet-stream",
        });
      }
      const saved = await saveCashReconciliation({
        evidence,
        createdBy: user?.name || user?.email || "",
        openingFloat: parseMoneyInput(openingFloat),
        cashSales: cashToday.sales,
        cashTips: cashToday.tips,
        expectedCash,
        countedCash: parseMoneyInput(countedCash),
        difference: cashDifference,
        cashOrderCount: cashToday.count,
        cardCount: bankToday.cardCount,
        cardTotal: bankToday.cardTotal,
        cardFees: bankToday.cardFees,
        transferCount: bankToday.transferCount,
        transferTotal: bankToday.transferTotal,
        bankTotal: bankToday.total,
        comments: reconcileComments.trim(),
      });
      setReconciliations((prev) => [saved, ...prev]);
      // Reset the form for the next corte and show it in the history list.
      setOpeningFloat("");
      setCountedCash("");
      setReconcileComments("");
      setEvidenceFiles([]);
      setReconcileView("history");
      setExpandedCorte(saved.id);
      printReconciliation(saved, printWin);
    } catch (err) {
      printWin?.close();
      console.error("Failed to save cash reconciliation:", err);
      alert(t("checkout.corteSaveError"));
    } finally {
      setReconcileSaving(false);
    }
  }

  /** Open the dialog and load saved cortes for review. */
  async function openReconcile() {
    setShowReconcile(true);
    try {
      setReconciliations(await fetchCashReconciliations());
    } catch (err) {
      console.error("Failed to load cash reconciliations:", err);
    }
  }

  /** Add picked files (max 10 MB each) to the pending evidence list. */
  function addEvidenceFiles(list: FileList | null) {
    if (!list) return;
    const MAX_BYTES = 10 * 1024 * 1024;
    const picked = Array.from(list).filter((f) => f.size <= MAX_BYTES);
    if (picked.length < list.length) alert(t("checkout.evidenceTooLarge"));
    setEvidenceFiles((prev) => [...prev, ...picked]);
    // Allow re-picking the same file later.
    if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  /** Open a saved evidence file in a new tab via a short-lived signed URL. */
  async function openEvidence(ev: CashEvidence) {
    // Open the tab inside the click, then point it at the URL (avoids popup blocking).
    const w = window.open("", "_blank");
    try {
      const url = await getObjectUrl(ev.key);
      if (w) w.location.href = url;
    } catch (err) {
      w?.close();
      console.error("Failed to open evidence:", err);
    }
  }

  /** A manager marks a saved corte as reviewed. */
  async function reviewCorte(rec: CashReconciliation) {
    const reviewer = user?.name || user?.email || "";
    try {
      const reviewedAt = await markCashReconciliationReviewed(rec.id, reviewer);
      setReconciliations((prev) =>
        prev.map((r) =>
          r.id === rec.id ? { ...r, reviewedBy: reviewer, reviewedAt } : r
        )
      );
    } catch (err) {
      console.error("Failed to mark corte reviewed:", err);
    }
  }

  function formatDay(iso: string): string {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(lang, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function statusBadge(status: OrderStatus) {
    if (status === "paid")
      return <Badge variant="default">{t("checkout.statusPaid")}</Badge>;
    if (status === "cancelled")
      return <Badge variant="destructive">{t("checkout.statusCancelled")}</Badge>;
    return <Badge variant="outline">{t("checkout.statusOpen")}</Badge>;
  }

  return (
    <div className="page">
      <div className="page-header flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1>{t("checkout.title")}</h1>
          <p className="page-subtitle">{t("checkout.subtitle")}</p>
        </div>
        {/* Wraps onto extra rows on narrow screens (tablet portrait) instead of overflowing. */}
        <div style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 8 }}>
          <Button variant="outline" onClick={openRateDialog}>
            <DollarSign data-icon="inline-start" />
            {t("checkout.exchangeRateButton")}:{" "}
            {rate ? rate.rate.toFixed(2) : t("checkout.exchangeRateNotSet")}
          </Button>
          <Button variant="outline" onClick={openCashDrawer}>
            <Inbox data-icon="inline-start" />
            {t("checkout.openDrawer")}
          </Button>
          <Button variant="outline" onClick={openReconcile}>
            <Banknote data-icon="inline-start" />
            {t("checkout.cashReconciliation")}
          </Button>
          <Button variant="outline" onClick={() => setShowOrders(true)}>
            <Receipt data-icon="inline-start" />
            {t("checkout.recentOrders")}
          </Button>
        </div>
      </div>

      {receiptMsg && (
        <p
          role="status"
          className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
            receiptMsg.ok
              ? "border-emerald-600 bg-emerald-50 text-emerald-800"
              : "border-destructive text-destructive"
          }`}
        >
          <span className="min-w-0 flex-1 break-words">{receiptMsg.text}</span>
          {!receiptMsg.ok && receiptMsg.orderId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const id = receiptMsg.orderId!;
                setReceiptMsg(null);
                printSaleReceipt(id);
              }}
            >
              <Printer data-icon="inline-start" />
              {t("saleTicket.retry")}
            </Button>
          )}
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => setReceiptMsg(null)} aria-label={t("checkout.cancel")}>
            <X />
          </Button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Left column: seating chart + menu picker */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* Seating chart — same width as the menu items */}
          <div className="flex flex-col gap-2 rounded-xl border border-input bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <Label className="mb-0">{t("checkout.seatingChart")}</Label>
                <span className="text-xs text-[var(--text-muted)]">
                  {selectedTable
                    ? `${t("checkout.tableSelected")} ${tableName(t, selectedTable)}`
                    : t("checkout.selectTablePrompt")}
                </span>
              </div>
              <div className="flex items-center gap-3">
                {checkSaving && (
                  <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                    <Loader2 size={12} className="animate-spin" />
                    {t("checkout.savingCheck")}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!selectedTable}
                  onClick={() => setShowSplit(true)}
                >
                  <SplitSquareHorizontal data-icon="inline-start" />
                  {t("checkout.splitCheck")}
                </Button>
              </div>
            </div>
            <SeatingChart
              selected={selectedTable}
              occupied={(spotId) =>
                openChecks.some((o) => o.tableLabel === spotId)
              }
              onSelect={selectTable}
              seatsLabel={t("checkout.seats")}
            />
          </div>

          {/* Open takeout orders — not tied to a table */}
          <div className="flex flex-col gap-2 rounded-xl border border-input bg-[var(--surface)] p-4">
            <Label className="mb-0">{t("checkout.takeoutOrders")}</Label>
            {takeoutChecks.length === 0 ? (
              <span className="text-xs text-[var(--text-muted)]">
                {t("checkout.noTakeoutOrders")}
              </span>
            ) : (
              <div className="flex flex-wrap gap-2">
                {takeoutChecks.map((o) => (
                  <button
                    key={o.id}
                    onClick={() => selectTakeout(o)}
                    aria-pressed={currentCheckId === o.id}
                    className={
                      "flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
                      (currentCheckId === o.id
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input hover:bg-[var(--surface-muted)]")
                    }
                  >
                    <span className="font-medium">
                      {o.customerName || t("orders.takeout")}
                    </span>
                    <span className="text-xs opacity-80">
                      {formatMoney(o.total)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">{t("checkout.loading")}</p>
          ) : (
            !selectedTable && (
              <p className="rounded-lg border border-dashed border-input bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
                {t("checkout.selectTablePrompt")}
              </p>
            )
          )}
        </div>

        {/* Cart */}
        <div className="flex h-fit min-w-0 flex-col gap-3 rounded-xl border border-input bg-[var(--surface)] p-4 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" />
            <h2 className="text-base font-semibold">
              {selectedTable
                ? takeoutChecks.some((o) => o.id === currentCheckId)
                  ? t("orders.takeout")
                  : tableName(t, selectedTable)
                : t("checkout.currentOrder")}
            </h2>
            {itemCount > 0 && <Badge variant="secondary">{itemCount}</Badge>}
          </div>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              {t("checkout.emptyCart")}
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {cart.map((line) => (
                <div key={line.menuItemId} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{line.name}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {formatMoney(line.unitPrice)} × {line.quantity}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => changeQuantity(line.menuItemId, -1)}
                      aria-label={t("checkout.decrease")}
                    >
                      <Minus />
                    </Button>
                    <span className="w-5 text-center text-sm">{line.quantity}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => changeQuantity(line.menuItemId, 1)}
                      aria-label={t("checkout.increase")}
                    >
                      <Plus />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLine(line.menuItemId)}
                      aria-label={t("checkout.remove")}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <span className="w-20 text-right text-sm font-medium">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {cart.length > 0 && (
            <>
              <div className="flex flex-col gap-1 border-t border-[var(--border)] pt-3 text-sm">
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>{t("checkout.subtotal")}</span>
                  <span>{formatMoney(subtotal)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold">
                  <span>{t("checkout.total")}</span>
                  <span>{formatMoney(total)}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={clearCart}>
                  {t("checkout.clear")}
                </Button>
                <Button className="flex-1" onClick={() => setShowCheckout(true)}>
                  {t("checkout.checkout")}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Checkout confirmation dialog */}
      <Dialog
        open={showCheckout}
        onOpenChange={(open) => {
          // Don't let a click-away cancel an in-progress card payment.
          if (!open && (cardPhase === "awaiting" || cardPhase === "creating")) {
            return;
          }
          if (!open) closeCheckout();
          else setShowCheckout(true);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {cardPhase === "idle"
                ? t("checkout.completeOrder")
                : cardPhase === "paid"
                  ? t("checkout.paymentReceived")
                  : t("checkout.scanToPay")}
            </DialogTitle>
          </DialogHeader>

          {cardPhase === "paid" ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={56} className="text-emerald-500" />
              <p className="text-lg font-semibold">
                {t("checkout.paymentReceived")}
              </p>
              <p className="text-sm text-[var(--text-muted)]">
                {formatMoney(total)}
              </p>
            </div>
          ) : cardPhase === "awaiting" && cardPayUrl ? (
            <div className="flex flex-col items-center gap-4 py-2 text-center">
              <p className="text-sm text-[var(--text-muted)]">
                {t("checkout.scanInstructions")}
              </p>
              <div className="rounded-xl border border-input bg-white p-3">
                <PaymentQR url={cardPayUrl} size={240} />
              </div>
              <p className="text-base font-semibold">{formatMoney(total)}</p>
              <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <Loader2 size={16} className="animate-spin" />
                {t("checkout.waitingForPayment")}
              </div>
            </div>
          ) : cardPhase === "creating" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 size={32} className="animate-spin text-primary" />
              <p className="text-sm text-[var(--text-muted)]">
                {t("checkout.generatingQr")}
              </p>
            </div>
          ) : (
          <div className="grid gap-4 py-2">
            <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-sm">
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{t("checkout.subtotal")}</span>
                <span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-[var(--text-muted)]">
                <span>{t("checkout.tip")}</span>
                <span>{formatMoney(tip)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 text-base font-semibold">
                <span>{t("checkout.total")}</span>
                <span>{formatMoney(total)}</span>
              </div>
            </div>

            <div className="grid gap-2">
              <Label>{t("checkout.tip")}</Label>
              <div className="flex flex-wrap gap-2">
                {[10, 15, 20].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => {
                      setCustomPctMode(false);
                      setCustomPctInput("");
                      setTipPercent(pct / 100);
                    }}
                    className={
                      "flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors " +
                      (!customPctMode && tipPercentActive === pct
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input hover:bg-[var(--surface-muted)]")
                    }
                  >
                    {pct}%
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setCustomPctMode(true);
                    // Seed from the current implied % if there is one.
                    if (subtotal > 0 && tip > 0 && !customPctInput) {
                      setCustomPctInput(
                        String(Math.round((tip / subtotal) * 1000) / 10)
                      );
                    }
                  }}
                  className={
                    "flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors " +
                    (customPctMode
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-input hover:bg-[var(--surface-muted)]")
                  }
                >
                  {t("checkout.customPercent")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCustomPctMode(false);
                    setCustomPctInput("");
                    setTipInput("");
                  }}
                  className={
                    "flex-1 rounded-lg border px-2 py-1.5 text-sm transition-colors " +
                    (!customPctMode && tip <= 0
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-input hover:bg-[var(--surface-muted)]")
                  }
                >
                  {t("checkout.noTip")}
                </button>
              </div>

              {customPctMode && (
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={customPctInput}
                    onChange={(e) => applyCustomPercent(e.target.value)}
                    placeholder={t("checkout.customPercentPlaceholder")}
                    className="h-8 w-full rounded-lg border border-input bg-transparent pl-2.5 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
                    %
                  </span>
                </div>
              )}

              <CurrencyInput
                value={tipInput}
                onChange={(v) => {
                  // A manual peso amount overrides the custom-% field.
                  setCustomPctMode(false);
                  setCustomPctInput("");
                  setTipInput(v);
                }}
                step={10}
                placeholder={t("checkout.customTip")}
              />
            </div>

            <div className="grid gap-2">
              <Label>{t("checkout.paymentMethod")}</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={stripeApp ? "stripe_app" : paymentMethod}
                onChange={(e) => {
                  // "stripe_app" is a UI-only choice: stored as a regular "card" payment.
                  const isApp = e.target.value === "stripe_app";
                  const method = (isApp ? "card" : e.target.value) as PaymentMethod;
                  setStripeApp(isApp);
                  setPaymentMethod(method);
                  // USD is cash-only (card is charged in MXN through Stripe).
                  if (method !== "cash") {
                    setCurrency("MXN");
                    setAmountReceived("");
                  }
                }}
              >
                <option value="cash">{t("checkout.payCash")}</option>
                <option value="card">{t("checkout.payCard")}</option>
                <option value="stripe_app">{t("checkout.payStripeApp")}</option>
                <option value="transfer">{t("checkout.payTransfer")}</option>
                <option value="other">{t("checkout.payOther")}</option>
              </select>
            </div>

            {paymentMethod === "cash" && (
              <div className="grid gap-3 rounded-lg border border-input bg-[var(--surface-muted)] p-3">
                <div className="grid gap-1.5">
                  <Label>{t("checkout.currency")}</Label>
                  <select
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    value={currency}
                    onChange={(e) => {
                      setCurrency(e.target.value as Currency);
                      setAmountReceived("");
                    }}
                  >
                    <option value="MXN">{t("checkout.currencyMXN")}</option>
                    <option value="USD">{t("checkout.currencyUSD")}</option>
                  </select>
                </div>
                {payingUsd && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">
                      {t("checkout.exchangeRateLabel")}: {rate ? rate.rate.toFixed(2) : t("checkout.exchangeRateNotSet")}
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={openRateDialog}>
                      <DollarSign data-icon="inline-start" />
                      {t("checkout.exchangeRateButton")}
                    </Button>
                  </div>
                )}
                {usdNeedsRate && (
                  <p role="status" className="text-xs text-destructive">
                    {t("checkout.exchangeRateNeeded")}
                  </p>
                )}
                {!usdNeedsRate && (
                  <>
                    {payingUsd && (
                      <div className="flex justify-between text-sm font-semibold">
                        <span>{t("checkout.totalInCurrency", { currency })}</span>
                        <span>{formatCurrencyAmount(totalInCurrency)}</span>
                      </div>
                    )}
                    <div className="grid gap-1.5">
                      <Label>{t("checkout.amountReceived")}</Label>
                      <CurrencyInput
                        value={amountReceived}
                        onChange={setAmountReceived}
                        step={payingUsd ? 5 : 50}
                        placeholder={formatCurrencyAmount(totalInCurrency)}
                      />
                    </div>
                    {receivedShort ? (
                      <p role="status" className="text-xs text-destructive">
                        {t("checkout.amountShort")}
                      </p>
                    ) : (
                      received > 0 && (
                        <div className="flex justify-between text-sm font-semibold">
                          <span>{t("checkout.changeDue")}</span>
                          <span>{formatCurrencyAmount(changeDue)}</span>
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            )}

            {stripeApp && (
              <div className="grid gap-2 rounded-lg border border-input bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2">
                  <Smartphone size={16} className="text-primary" />
                  <Label className="mb-0">{t("checkout.stripeAppTitle")}</Label>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {t("checkout.stripeAppInstructions", { amount: formatMoney(total) })}
                </p>
                {tapMatches.length === 0 ? (
                  <div role="status" className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 size={16} className="animate-spin" />
                    {tapError ? t("checkout.stripeAppError") : t("checkout.stripeAppWaiting")}
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {tapMatches.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2"
                      >
                        <div className="text-sm">
                          <div className="font-semibold">
                            {formatMoney(p.amount)} {p.brand ? `· ${p.brand.toUpperCase()}` : ""}{" "}
                            {p.last4 ? `•••• ${p.last4}` : ""}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {new Date(p.createdAt).toLocaleTimeString(lang, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => handleSubmitOrder(p)} disabled={submitting}>
                          <CheckCircle2 data-icon="inline-start" />
                          {t("checkout.stripeAppConfirm")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {paymentMethod === "transfer" && (
              <div className="grid gap-2 rounded-lg border border-input bg-[var(--surface-muted)] p-3">
                <div className="flex items-center gap-2">
                  <Landmark size={16} className="text-primary" />
                  <Label className="mb-0">{t("checkout.transferTitle")}</Label>
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  {t("checkout.transferInstructions")}
                </p>
                <div className="grid gap-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">
                      {t("checkout.transferAccount")}
                    </span>
                    <span className="font-medium">{TRANSFER_DETAILS.account}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">
                      {t("checkout.transferBank")}
                    </span>
                    <span className="font-medium">{TRANSFER_DETAILS.bank}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[var(--text-muted)]">
                      {t("checkout.transferClabe")}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="font-mono font-medium tracking-wide">
                        {TRANSFER_DETAILS.clabe}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={copyClabe}
                        aria-label={t("checkout.copyClabe")}
                      >
                        {clabeCopied ? (
                          <Check className="text-emerald-500" />
                        ) : (
                          <Copy />
                        )}
                      </Button>
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={printBankInfo}
                  disabled={printingBank || !canUsePrintAgent()}
                  title={canUsePrintAgent() ? undefined : t("checkout.printTabletOnly")}
                >
                  <Printer data-icon="inline-start" />
                  {printingBank ? t("checkout.printingBankInfo") : t("checkout.printBankInfo")}
                </Button>
                {bankPrintMsg && (
                  <p
                    role="status"
                    className={`text-xs ${bankPrintMsg.ok ? "text-emerald-700" : "text-destructive"}`}
                  >
                    {bankPrintMsg.text}
                  </p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={pasteTransferProof}
                  disabled={submitting}
                >
                  <ClipboardPaste data-icon="inline-start" />
                  {transferProof ? t("checkout.replaceProof") : t("checkout.pasteProof")}
                </Button>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => proofGalleryInputRef.current?.click()}
                    disabled={submitting}
                  >
                    <Paperclip data-icon="inline-start" />
                    {t("checkout.proofFromGallery")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => proofCameraInputRef.current?.click()}
                    disabled={submitting}
                  >
                    <Camera data-icon="inline-start" />
                    {t("checkout.proofFromCamera")}
                  </Button>
                </div>
                <input
                  ref={proofGalleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onProofFilePicked}
                />
                <input
                  ref={proofCameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={onProofFilePicked}
                />
                {transferProof && (
                  <div className="flex items-start gap-2 rounded-lg border border-input bg-[var(--surface)] p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={transferProof.url}
                      alt={t("checkout.proofAlt")}
                      className="max-h-40 flex-1 rounded-md object-contain"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => {
                        if (!confirm(t("checkout.confirmRemoveProof"))) return;
                        setProofFile(null);
                        setProofMsg(null);
                      }}
                      aria-label={t("checkout.removeProof")}
                    >
                      <X />
                    </Button>
                  </div>
                )}
                {proofMsg && (
                  <p role="status" className={`text-xs ${proofMsg.ok ? "text-emerald-700" : "text-destructive"}`}>
                    {proofMsg.text}
                  </p>
                )}
                <p className="text-xs text-[var(--text-muted)]">{t("checkout.pasteProofHint")}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label>{t("checkout.notes")}</Label>
              <textarea
                className="w-full min-h-[70px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder={t("checkout.notesPlaceholder")}
              />
            </div>
          </div>
          )}

          <DialogFooter>
            {cardPhase === "paid" ? (
              <Button onClick={finishCardPayment}>{t("checkout.done")}</Button>
            ) : cardPhase === "awaiting" ? (
              <Button
                variant="outline"
                onClick={cancelCardPayment}
                disabled={cancelling}
              >
                {cancelling ? t("checkout.cancelling") : t("checkout.cancel")}
              </Button>
            ) : cardPhase === "creating" ? null : (
              <>
                <Button variant="outline" onClick={closeCheckout}>
                  {t("checkout.cancel")}
                </Button>
                <Button
                  variant={stripeApp && tapMatches.length > 0 ? "outline" : "default"}
                  onClick={() => handleSubmitOrder()}
                  disabled={submitting || usdNeedsRate || receivedShort}
                >
                  {submitting ? (
                    t("checkout.saving")
                  ) : stripeApp ? (
                    t("checkout.stripeAppManual")
                  ) : paymentMethod === "card" ? (
                    <>
                      <QrCode data-icon="inline-start" />
                      {t("checkout.payWithCard")}
                    </>
                  ) : (
                    t("checkout.recordPayment")
                  )}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exchange rate dialog */}
      <Dialog open={showRate} onOpenChange={setShowRate}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("checkout.exchangeRateTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <p className="text-sm text-[var(--text-muted)]">{t("checkout.exchangeRateHint")}</p>
            <Label>{t("checkout.exchangeRateLabel")}</Label>
            <CurrencyInput value={rateInput} onChange={setRateInput} step={0.1} placeholder="18.00" />
            {rate && (
              <p className="text-xs text-[var(--text-muted)]">
                {t("checkout.exchangeRateUpdated", {
                  when: new Date(rate.updatedAt).toLocaleString(lang),
                  who: rate.updatedBy || "-",
                })}
              </p>
            )}
            {rateError && (
              <p role="status" className="text-xs text-destructive">
                {rateError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRate(false)}>
              {t("checkout.cancel")}
            </Button>
            <Button onClick={saveRate} disabled={rateSaving}>
              {rateSaving ? t("checkout.saving") : t("checkout.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split sub-check picker */}
      <Dialog
        open={splitPickerTable != null}
        onOpenChange={(open) => !open && setSplitPickerTable(null)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("checkout.table")} {splitPickerTable} — {t("checkout.splitCheck")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <p className="text-sm text-[var(--text-muted)]">
              {t("checkout.pickSubCheck")}
            </p>
            {openChecks
              .filter((o) => o.tableLabel === splitPickerTable)
              .map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => openSubCheck(o)}
                  className="flex items-center justify-between rounded-lg border border-input p-3 text-left transition-colors hover:border-primary hover:bg-[var(--surface-muted)]"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {o.splitLabel || t("checkout.subCheck")}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {o.items.reduce((n, l) => n + l.quantity, 0)}{" "}
                      {t("checkout.itemsLabel")}
                    </p>
                  </div>
                  <span className="text-sm font-semibold">
                    {formatMoney(o.total)}
                  </span>
                </button>
              ))}
          </div>
          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => splitPickerTable && clearSplit(splitPickerTable)}
            >
              <RotateCcw data-icon="inline-start" />
              {t("checkout.clearSplit")}
            </Button>
            <Button
              variant="outline"
              onClick={() => setSplitPickerTable(null)}
            >
              {t("checkout.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Split-check dialog */}
      {selectedTable && (
        <SplitCheckDialog
          open={showSplit}
          onOpenChange={setShowSplit}
          tableLabel={selectedTable}
          items={cart}
          formatMoney={formatMoney}
          onConfirm={handleSplitConfirm}
          t={t}
        />
      )}

      {/* Cash reconciliation dialog */}
      <Dialog open={showReconcile} onOpenChange={setShowReconcile}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("checkout.cashReconciliation")}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--text-muted)]">
            {formatDay(new Date().toISOString())} · {cashToday.count}{" "}
            {t("checkout.ordersLabel")}
          </p>

          {/* Switch between filling in a new corte and reviewing saved ones */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={reconcileView === "new" ? "default" : "outline"}
              onClick={() => setReconcileView("new")}
            >
              {t("checkout.newCorte")}
            </Button>
            <Button
              size="sm"
              variant={reconcileView === "history" ? "default" : "outline"}
              onClick={() => setReconcileView("history")}
            >
              {t("checkout.savedCortes")} ({reconciliations.length})
            </Button>
          </div>

          {reconcileView === "history" ? (
            <div className="flex max-h-[55vh] flex-col gap-2 overflow-y-auto">
              {reconciliations.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                  {t("checkout.noCortes")}
                </p>
              )}
              {reconciliations.map((rec) => {
                const balanced = Math.abs(rec.difference) < 0.005;
                const expanded = expandedCorte === rec.id;
                return (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-input bg-[var(--surface)] p-3 text-sm"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between text-left"
                      onClick={() => setExpandedCorte(expanded ? null : rec.id)}
                    >
                      <span>
                        <span className="font-medium">{formatDate(rec.createdAt)}</span>
                        <span className="block text-xs text-[var(--text-muted)]">
                          {rec.createdBy}
                        </span>
                      </span>
                      <span className="flex flex-col items-end">
                        <span
                          className={`font-semibold ${balanced ? "text-primary" : "text-destructive"}`}
                        >
                          {balanced
                            ? t("checkout.balanced")
                            : `${rec.difference > 0 ? t("checkout.over") : t("checkout.short")} ${formatMoney(Math.abs(rec.difference))}`}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">
                          {rec.reviewedBy
                            ? `${t("checkout.reviewedBy")}: ${rec.reviewedBy}`
                            : t("checkout.pendingReview")}
                        </span>
                      </span>
                    </button>

                    {expanded && (
                      <div className="mt-2 border-t border-[var(--border)] pt-2">
                        {(
                          [
                            [t("checkout.openingFloat"), rec.openingFloat],
                            [t("checkout.cashSales"), rec.cashSales],
                            [t("checkout.cashTips"), rec.cashTips],
                            [t("checkout.expectedCash"), rec.expectedCash],
                            [t("checkout.countedCash"), rec.countedCash],
                            [`${t("checkout.cardSales")} (${rec.cardCount})`, rec.cardTotal],
                            [`${t("checkout.transferSales")} (${rec.transferCount})`, rec.transferTotal],
                            [t("checkout.totalBank"), rec.bankTotal],
                          ] as [string, number][]
                        ).map(([label, value]) => (
                          <div key={label} className="flex justify-between">
                            <span className="text-[var(--text-muted)]">{label}</span>
                            <span>{formatMoney(value)}</span>
                          </div>
                        ))}
                        {rec.comments && (
                          <p className="mt-2 whitespace-pre-wrap text-xs">
                            <strong>{t("checkout.comments")}:</strong> {rec.comments}
                          </p>
                        )}
                        {(rec.evidence ?? []).length > 0 && (
                          <div className="mt-2 flex flex-col gap-1">
                            <span className="text-xs font-semibold">{t("checkout.evidence")}</span>
                            {(rec.evidence ?? []).map((ev) => (
                              <button
                                key={ev.key}
                                type="button"
                                className="flex items-center gap-1 text-left text-xs text-primary underline"
                                onClick={() => openEvidence(ev)}
                              >
                                <Paperclip size={12} />
                                <span className="truncate">{ev.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="mt-2 flex justify-end gap-2">
                          {!rec.reviewedBy && (
                            <Button size="sm" variant="outline" onClick={() => reviewCorte(rec)}>
                              <CheckCircle2 data-icon="inline-start" />
                              {t("checkout.markReviewed")}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => printReconciliation(rec)}>
                            <Printer data-icon="inline-start" />
                            {t("checkout.print")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <Label>{t("checkout.openingFloat")}</Label>
              <CurrencyInput
                value={openingFloat}
                onChange={setOpeningFloat}
                step={50}
                placeholder="0.00"
              />
            </div>

            <div className="rounded-xl border border-input bg-[var(--surface-muted)] p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t("checkout.cashSales")}</span>
                <span>{formatMoney(cashToday.sales)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t("checkout.cashTips")}</span>
                <span>{formatMoney(cashToday.tips)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
                <span>{t("checkout.expectedCash")}</span>
                <span>{formatMoney(expectedCash)}</span>
              </div>
            </div>

            {/* Bank transactions: card + transfer sales (not part of the drawer) */}
            <div className="rounded-xl border border-input bg-[var(--surface-muted)] p-3 text-sm">
              <div className="mb-1 font-semibold">{t("checkout.bankTransactions")}</div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  {t("checkout.cardSales")} ({bankToday.cardCount})
                </span>
                <span>{formatMoney(bankToday.cardTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">{t("checkout.processingFee")}</span>
                <span>− {formatMoney(bankToday.cardFees)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">
                  {t("checkout.transferSales")} ({bankToday.transferCount})
                </span>
                <span>{formatMoney(bankToday.transferTotal)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-[var(--border)] pt-1 font-semibold">
                <span>{t("checkout.totalBank")}</span>
                <span>{formatMoney(bankToday.total)}</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <Label>{t("checkout.countedCash")}</Label>
              <CurrencyInput
                value={countedCash}
                onChange={setCountedCash}
                step={50}
                placeholder="0.00"
              />
            </div>

            {/* Difference between counted and expected cash */}
            {countedCash !== "" && (
              <div
                className={`flex justify-between rounded-xl border border-input p-3 text-base font-semibold ${
                  Math.abs(cashDifference) < 0.005
                    ? "text-primary"
                    : "text-destructive"
                }`}
              >
                <span>
                  {Math.abs(cashDifference) < 0.005
                    ? t("checkout.balanced")
                    : cashDifference > 0
                      ? t("checkout.over")
                      : t("checkout.short")}
                </span>
                <span>{formatMoney(Math.abs(cashDifference))}</span>
              </div>
            )}

            {/* Evidence (e.g. last-minute purchase receipts) explaining missing cash */}
            <div className="grid gap-2">
              <Label>{t("checkout.evidence")}</Label>
              <input
                ref={evidenceInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => addEvidenceFiles(e.target.files)}
              />
              {/* `capture` makes tablets/phones open the rear camera directly */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => addEvidenceFiles(e.target.files)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => evidenceInputRef.current?.click()}
                >
                  <Paperclip data-icon="inline-start" />
                  {t("checkout.attachEvidence")}
                </Button>
                {/* Camera capture only makes sense on touch devices (tablet/phone) */}
                {isTouchDevice && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cameraInputRef.current?.click()}
                  >
                    <Camera data-icon="inline-start" />
                    {t("checkout.takePhoto")}
                  </Button>
                )}
              </div>
              {evidenceFiles.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between rounded-lg border border-input px-2.5 py-1 text-sm"
                >
                  <span className="truncate">{f.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("checkout.removeEvidence")}
                    title={t("checkout.removeEvidence")}
                    onClick={() => {
                      if (!confirm(t("checkout.confirmRemoveEvidence"))) return;
                      setEvidenceFiles((prev) => prev.filter((_, j) => j !== i));
                    }}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>

            {/* Free-form notes explaining any difference; included in the printout */}
            <div className="grid gap-2">
              <Label>{t("checkout.comments")}</Label>
              <textarea
                className="w-full min-h-[70px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={reconcileComments}
                onChange={(e) => setReconcileComments(e.target.value)}
                placeholder={t("checkout.commentsPlaceholder")}
              />
            </div>
          </div>
          )}

          {reconcileView === "new" && (
            <DialogFooter>
              <Button
                onClick={saveAndPrintReconciliation}
                disabled={reconcileSaving || countedCash === ""}
              >
                {reconcileSaving ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Printer data-icon="inline-start" />
                )}
                {t("checkout.saveAndPrint")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Recent orders dialog */}
      <Dialog open={showOrders} onOpenChange={setShowOrders}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("checkout.recentOrders")}</DialogTitle>
          </DialogHeader>

          {tipPool.allTimeOrders > 0 && (
            <div className="rounded-xl border border-input bg-[var(--surface-muted)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t("checkout.tipPool")}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {t("checkout.sinceLabel")} {formatDay(tipPool.weekStart.toISOString())}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--surface)] p-2.5">
                  <p className="text-xs text-[var(--text-muted)]">{t("checkout.thisWeek")}</p>
                  <p className="text-lg font-semibold text-primary">
                    {formatMoney(tipPool.weekTips)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {tipPool.weekOrders} {t("checkout.ordersLabel")}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--surface)] p-2.5">
                  <p className="text-xs text-[var(--text-muted)]">{t("checkout.allTime")}</p>
                  <p className="text-lg font-semibold">{formatMoney(tipPool.allTimeTips)}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {tipPool.allTimeOrders} {t("checkout.ordersLabel")}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{t("checkout.tipPoolNote")}</p>
            </div>
          )}

          {feeSummary.cardOrders > 0 && (
            <div className="rounded-xl border border-input bg-[var(--surface-muted)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{t("checkout.feeSummary")}</span>
                <span className="text-xs text-[var(--text-muted)]">
                  {feeSummary.cardOrders} {t("checkout.cardOrdersLabel")}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-[var(--surface)] p-2.5">
                  <p className="text-xs text-[var(--text-muted)]">{t("checkout.thisWeek")}</p>
                  <p className="text-lg font-semibold text-destructive">
                    − {formatMoney(feeSummary.weekFees)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("checkout.netReceived")}: {formatMoney(feeSummary.weekNet)}
                  </p>
                </div>
                <div className="rounded-lg bg-[var(--surface)] p-2.5">
                  <p className="text-xs text-[var(--text-muted)]">{t("checkout.allTime")}</p>
                  <p className="text-lg font-semibold text-destructive">
                    − {formatMoney(feeSummary.allTimeFees)}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {t("checkout.netReceived")}: {formatMoney(feeSummary.allTimeNet)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-xs text-[var(--text-muted)]">{t("checkout.feeSummaryNote")}</p>
            </div>
          )}

          <div className="max-h-[60vh] overflow-y-auto">
            {orders.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                {t("checkout.noOrders")}
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-input bg-[var(--surface)] p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {statusBadge(order.status)}
                        <span className="text-sm font-medium">
                          {tableName(t, order.tableLabel)}
                        </span>
                      </div>
                      <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <Clock size={12} />
                        {formatDate(order.createdAt)}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-[var(--text-muted)]">
                      {order.items.map((l) => (
                        <div key={l.menuItemId} className="flex justify-between">
                          <span>
                            {l.quantity} × {l.name}
                          </span>
                          <span>{formatMoney(l.unitPrice * l.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    {(order.tip ?? 0) > 0 && (
                      <div className="mt-1 flex justify-between text-sm text-[var(--text-muted)]">
                        <span>{t("checkout.tip")}</span>
                        <span>{formatMoney(order.tip)}</span>
                      </div>
                    )}
                    {order.paymentMethod === "card" && (order.processingFee ?? 0) > 0 && (
                      <>
                        <div className="mt-1 flex justify-between text-sm text-[var(--text-muted)]">
                          <span>{t("checkout.processingFee")}</span>
                          <span>− {formatMoney(order.processingFee)}</span>
                        </div>
                        <div className="flex justify-between text-sm text-[var(--text-muted)]">
                          <span>{t("checkout.netReceived")}</span>
                          <span>{formatMoney(order.netAmount)}</span>
                        </div>
                      </>
                    )}
                    <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
                      <span className="text-sm font-semibold">
                        {t("checkout.total")}: {formatMoney(order.total)}
                      </span>
                      <div className="flex gap-1">
                        {order.status === "open" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleUpdateStatus(order, "paid")}
                            aria-label={t("checkout.markPaid")}
                            title={t("checkout.markPaid")}
                          >
                            <CheckCircle2 />
                          </Button>
                        )}
                        {order.status !== "cancelled" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleUpdateStatus(order, "cancelled")}
                            aria-label={t("checkout.markCancelled")}
                            title={t("checkout.markCancelled")}
                          >
                            <XCircle />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleDeleteOrder(order)}
                          aria-label={t("checkout.delete")}
                          title={t("checkout.delete")}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
