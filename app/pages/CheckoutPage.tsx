"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useAuth } from "../auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Search,
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
} from "lucide-react";
import {
  fetchMenuItems,
  fetchOrders,
  updateOrderStatus,
  deleteOrder,
  getOrder,
  fetchOpenChecks,
  saveOpenCheck,
  setOpenCheckTip,
  closeCheckPaid,
  splitCheckByItem,
  unsplitCheck,
  MenuItem,
  Order,
  OrderLineItem,
  OrderStatus,
  PaymentMethod,
} from "../lib/dynamodb";
import { PaymentQR } from "./PaymentQR";
import { SeatingChart } from "./SeatingChart";
import { SplitCheckDialog, type SplitBucketResult } from "./SplitCheckDialog";

/** Phases of the card-via-QR payment flow. */
type CardPayPhase = "idle" | "creating" | "awaiting" | "paid";

/** Bank details shown to the customer when paying by transfer. */
const TRANSFER_DETAILS = {
  account: "Coral Reef and Beef",
  bank: "BBVA",
  clabe: "012028001266858382",
};

// Tax rate applied to in-person orders (8% IVA — Tijuana border region)
const TAX_RATE = 0.08;

/** Parse a menu price string like "$12.00" or "12" into a number. */
function parsePrice(price: string): number {
  const num = parseFloat((price || "").replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

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

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
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
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Checkout dialog
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Card-via-QR payment flow
  const [cardPhase, setCardPhase] = useState<CardPayPhase>("idle");
  const [cardPayUrl, setCardPayUrl] = useState<string | null>(null);
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Tip: "" = no tip; otherwise a peso amount as a string
  const [tipInput, setTipInput] = useState("");

  // Transfer bank details: brief "copied" feedback on the CLABE.
  const [clabeCopied, setClabeCopied] = useState(false);

  // Custom-percentage tip: whether the % field is shown, and its value.
  const [customPctMode, setCustomPctMode] = useState(false);
  const [customPctInput, setCustomPctInput] = useState("");

  // Split-check dialog
  const [showSplit, setShowSplit] = useState(false);
  // When a split table is tapped, show its sub-checks to pay one at a time.
  const [splitPickerTable, setSplitPickerTable] = useState<string | null>(null);

  // Recent orders view
  const [showOrders, setShowOrders] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [items, ords, checks] = await Promise.all([
        fetchMenuItems(),
        fetchOrders(),
        fetchOpenChecks(),
      ]);
      setMenuItems(items.filter((i) => i.available));
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

  const categories = useMemo(() => {
    const set = new Set<string>();
    menuItems.forEach((i) => i.category && set.add(i.category));
    return ["all", ...Array.from(set).sort()];
  }, [menuItems]);

  const visibleItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return menuItems.filter((i) => {
      const matchesCategory = activeCategory === "all" || i.category === activeCategory;
      const matchesSearch =
        !term ||
        i.name.toLowerCase().includes(term) ||
        i.description.toLowerCase().includes(term);
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, search]);

  function addToCart(item: MenuItem) {
    // Items must belong to a table's check — require a table first.
    if (!selectedTable) return;
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          menuItemId: item.id,
          name: item.name,
          unitPrice: parsePrice(item.price),
          quantity: 1,
        },
      ];
    });
  }

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
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }

  function clearCart() {
    setCart([]);
    setSelectedTable(null);
    setCurrentCheckId(null);
    setOrderNotes("");
    setPaymentMethod("cash");
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

  async function handleSubmitOrder() {
    if (cart.length === 0 || !selectedTable) return;

    if (paymentMethod === "card") {
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

        const res = await fetch("/api/checkout", {
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
      await closeCheckPaid(checkId, { tip, total, paymentMethod });
      setShowCheckout(false);
      clearCart();
      await loadData();
    } catch (err) {
      console.error("Failed to record order:", err);
    } finally {
      setSubmitting(false);
    }
  }

  /** Close the checkout dialog and reset the card/QR flow. */
  function closeCheckout() {
    setShowCheckout(false);
    setCardPhase("idle");
    setCardPayUrl(null);
    setPendingOrderId(null);
    setPendingSessionId(null);
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
        await fetch("/api/checkout/cancel", {
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
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("checkout.title")}</h1>
          <p className="page-subtitle">{t("checkout.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => setShowOrders(true)}>
          <Receipt data-icon="inline-start" />
          {t("checkout.recentOrders")}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px] lg:items-start">
        {/* Left column: seating chart + menu picker */}
        <div className="flex flex-col gap-3">
          {/* Seating chart — same width as the menu items */}
          <div className="flex flex-col gap-2 rounded-xl border border-input bg-[var(--surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <Label className="mb-0">{t("checkout.seatingChart")}</Label>
                <span className="text-xs text-[var(--text-muted)]">
                  {selectedTable
                    ? `${t("checkout.tableSelected")} ${selectedTable}`
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

          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <Input
              className="pl-9"
              placeholder={t("checkout.searchItems")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={
                  "rounded-full border px-3 py-1 text-sm transition-colors " +
                  (activeCategory === cat
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-input text-[var(--text-muted)] hover:bg-[var(--surface-muted)]")
                }
              >
                {cat === "all" ? t("checkout.allCategories") : cat}
              </button>
            ))}
          </div>

          {!selectedTable && !loading && (
            <p className="rounded-lg border border-dashed border-input bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--text-muted)]">
              {t("checkout.selectTablePrompt")}
            </p>
          )}

          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">{t("checkout.loading")}</p>
          ) : visibleItems.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("checkout.noItems")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  disabled={!selectedTable}
                  className="flex flex-col items-start gap-1 rounded-xl border border-input bg-[var(--surface)] p-3 text-left transition-all hover:border-primary hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-input disabled:hover:shadow-none"
                >
                  <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                  {item.category && (
                    <span className="text-xs text-[var(--text-muted)]">{item.category}</span>
                  )}
                  <span className="mt-auto pt-1 text-sm font-semibold text-primary">
                    {formatMoney(parsePrice(item.price))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart */}
        <div className="flex h-fit flex-col gap-3 rounded-xl border border-input bg-[var(--surface)] p-4 lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <ShoppingCart size={18} className="text-primary" />
            <h2 className="text-base font-semibold">
              {selectedTable
                ? `${t("checkout.table")} ${selectedTable}`
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
                <div className="flex justify-between text-[var(--text-muted)]">
                  <span>{t("checkout.tax")} ({Math.round(TAX_RATE * 100)}%)</span>
                  <span>{formatMoney(tax)}</span>
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
        <DialogContent className="sm:max-w-md">
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
                <span>{t("checkout.tax")} ({Math.round(TAX_RATE * 100)}%)</span>
                <span>{formatMoney(tax)}</span>
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
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">{t("checkout.payCash")}</option>
                <option value="card">{t("checkout.payCard")}</option>
                <option value="transfer">{t("checkout.payTransfer")}</option>
                <option value="other">{t("checkout.payOther")}</option>
              </select>
            </div>

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
                <Button onClick={handleSubmitOrder} disabled={submitting}>
                  {submitting ? (
                    t("checkout.saving")
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

      {/* Split sub-check picker */}
      <Dialog
        open={splitPickerTable != null}
        onOpenChange={(open) => !open && setSplitPickerTable(null)}
      >
        <DialogContent className="sm:max-w-md">
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

      {/* Recent orders dialog */}
      <Dialog open={showOrders} onOpenChange={setShowOrders}>
        <DialogContent className="sm:max-w-2xl">
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
                          {t("checkout.table")} {order.tableLabel}
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
