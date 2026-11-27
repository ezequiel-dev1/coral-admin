"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useAuth } from "../auth/AuthProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Ban,
  ChevronRight,
  Loader2,
  Minus,
  Pause,
  Pencil,
  Printer,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Split,
  UtensilsCrossed,
  Bike,
  History,
  XCircle,
} from "lucide-react";
import {
  fetchMenuItems,
  fetchMenuIngredients,
  fetchOrders,
  getUberEatsEnabled,
  claimOrderTicketPrint,
  isMenuItemAvailable,
  type MenuIngredient,
  type MenuItem,
  type ModifierGroup,
  type Order,
  type OrderLineItem,
  type OrderModifier,
  type ServiceType,
} from "../lib/dynamodb";
import {
  TAKEOUT_LABEL,
  adjustmentsOf,
  blankOrder,
  cancelOrder,
  computeTotals,
  getModifierGroups,
  lineSignature,
  modifiersTotal,
  newLineId,
  normalizeLines,
  parsePrice,
  reopenOrder,
  round2,
  saveOrder,
  setHeld,
  splitOrder,
  voidLine,
  withTotals,
} from "../lib/orders";
import { SEATING_SPOTS } from "./SeatingChart";
import { MenuItemThumb } from "./MenuItemThumb";
import { tableName } from "../lib/tableName";
import { authedFetch } from "../lib/apiFetch";
import { printAgent, canUsePrintAgent } from "../lib/printAgent";
import { buildKitchenTicket } from "../lib/kitchenTicket";
import { buildSaleTicket } from "../lib/saleTicket";
import { fetchOrderAudit, recordOrderAudit, type AuditEvent } from "../lib/audit";

type T = (key: string, vars?: Record<string, string>) => string;

function formatMoney(value: number): string {
  return value.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClass =
  "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type DisplayStatus = Order["status"];

function displayStatus(o: Order): DisplayStatus {
  return o.status;
}

function statusVariant(status: DisplayStatus): "default" | "secondary" | "outline" | "destructive" {
  if (status === "open") return "default";
  if (status === "held") return "secondary";
  if (status === "cancelled") return "destructive";
  return "outline";
}

function statusLabel(t: T, status: DisplayStatus): string {
  return t(`orders.status.${status}`);
}

function seatCountFor(tableLabel: string): number {
  return SEATING_SPOTS.find((s) => s.id === tableLabel)?.seats ?? 0;
}

// ===========================================================================
// Page: order list + editor switch
// ===========================================================================

type Filter = "active" | "held" | "paid" | "cancelled";

export function OrdersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const server = user?.name || user?.email || "";

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uberEatsEnabled, setUberEatsEnabled] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<Order | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [editingItemsOnly, setEditingItemsOnly] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showReprint, setShowReprint] = useState(false);
  const [reprintCustomerCopy, setReprintCustomerCopy] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showSelectedSplit, setShowSelectedSplit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [auditCounts, setAuditCounts] = useState<Record<string, number>>({});
  const [timelineOrder, setTimelineOrder] = useState<Order | null>(null);
  const [timelineEvents, setTimelineEvents] = useState<AuditEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const [items, ingredients, ords] = await Promise.all([
        fetchMenuItems(),
        fetchMenuIngredients(),
        fetchOrders(),
      ]);
      setMenuItems(items.map((i) => ({ ...i, available: isMenuItemAvailable(i, ingredients) })));
      setIngredients(ingredients);
      setOrders(ords);
      setError("");
    } catch (err) {
      console.error("Failed to load orders:", err);
      setError(t("orders.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  async function refreshOrders() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    getUberEatsEnabled().then(setUberEatsEnabled).catch((err) => console.error("Failed to load Uber Eats setting:", err));
  }, []);

  const visible = useMemo(() => {
    return orders.filter((o) => {
      // Marketplace orders have their own dispatch board above. They remain in
      // DynamoDB with every other order for reporting, but do not duplicate
      // the restaurant team's operational queue.
      if (o.source === "uber-eats") return false;
      if (filter === "active") return o.status === "open";
      return o.status === filter;
    });
  }, [orders, filter]);

  const isManager = Boolean(user?.groups.some((group) => ["Manager", "Administrator", "Overlord"].includes(group)));

  useEffect(() => {
    if (!isManager) return;
    let active = true;
    Promise.all(visible.map(async (order) => [order.id, (await fetchOrderAudit(order.id)).length] as const))
      .then((counts) => {
        if (active) setAuditCounts(Object.fromEntries(counts));
      })
      .catch((error) => console.error("Failed to load audit counts:", error));
    return () => { active = false; };
  }, [isManager, visible]);

  async function openTimeline(order: Order) {
    setTimelineOrder(order);
    setTimelineLoading(true);
    try {
      setTimelineEvents(await fetchOrderAudit(order.id));
    } catch (error) {
      console.error("Failed to load order timeline:", error);
      setTimelineEvents([]);
    } finally {
      setTimelineLoading(false);
    }
  }

  const counts = useMemo(() => {
    const restaurantOrders = orders.filter((o) => o.source !== "uber-eats");
    const c = { active: 0, held: 0, paid: 0, cancelled: 0 };
    for (const o of restaurantOrders) {
      if (o.status === "open") c.active++;
      else if (o.status === "held") c.held++;
      else if (o.status === "paid") c.paid++;
      else if (o.status === "cancelled") c.cancelled++;
    }
    return c;
  }, [orders]);

  function changeFilter(nextFilter: Filter) {
    setFilter(nextFilter);
    const matches = orders.filter((order) => {
      if (order.source === "uber-eats") return false;
      return nextFilter === "active" ? order.status === "open" : order.status === nextFilter;
    });
    setSelectedOrder(matches.length === 1 ? { ...matches[0], items: normalizeLines(matches[0].items) } : null);
  }

  const occupiedLabels = useMemo(
    () => new Set(orders.filter((o) => o.status === "open").map((o) => o.tableLabel)),
    [orders]
  );

  function startNew() {
    setEditing(blankOrder("dine-in", "", server));
    setEditingIsNew(true);
    setEditingItemsOnly(false);
  }

  function startItemEdit(order: Order) {
    setEditing({ ...order, items: normalizeLines(order.items) });
    setEditingIsNew(false);
    setEditingItemsOnly(true);
  }

  const canEditSelectedOrder = Boolean(
    selectedOrder &&
      (selectedOrder.status === "open" || selectedOrder.status === "held") &&
      [user?.name, user?.email]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.trim().toLocaleLowerCase() === selectedOrder.server.trim().toLocaleLowerCase())
  );
  const canCancelSelectedOrder = canEditSelectedOrder;
  const canSplitSelectedOrder = Boolean(
    selectedOrder &&
      (selectedOrder.status === "open" || selectedOrder.status === "held") &&
      selectedOrder.items.reduce((count, item) => count + item.quantity, 0) >= 2
  );

  async function splitSelectedOrder(groups: OrderLineItem[][]) {
    if (!selectedOrder) return;
    setShowSelectedSplit(false);
    setBusy(true);
    try {
      await splitOrder(selectedOrder, groups);
      setSelectedOrder(null);
      await load();
    } catch (err) {
      console.error("Failed to split order:", err);
      setError(t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function cancelSelectedOrder() {
    if (!selectedOrder || !canCancelSelectedOrder) return;
    setBusy(true);
    try {
      await cancelOrder(selectedOrder.id, cancelReason.trim() || t("orders.noReason"));
      setShowCancel(false);
      setCancelReason("");
      setSelectedOrder(null);
      await load();
    } catch (err) {
      console.error("Failed to cancel order:", err);
      setError(t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  }

  function openOrder(o: Order) {
    setSelectedOrder((current) => current?.id === o.id ? null : { ...o, items: normalizeLines(o.items) });
  }

  async function reprintSelectedOrder() {
    if (!selectedOrder) return;
    if (selectedOrder.status === "paid") {
      setReprintCustomerCopy(false);
      setShowReprint(true);
      return;
    }
    if (!canUsePrintAgent()) {
      setError(t("orders.reprintNoPrinter"));
      return;
    }
    setBusy(true);
    try {
      const menuItemById = new Map(menuItems.map((item) => [item.id, item]));
      const printedOrder = await claimOrderTicketPrint(selectedOrder.id);
      setSelectedOrder(printedOrder);
      const result = await printAgent.print(
        buildKitchenTicket(printedOrder, (id) => menuItemById.get(id), t, printedOrder.serviceType === "takeout" ? t("orders.takeout") : tableName(t, printedOrder.tableLabel)),
      );
      if (!result.ok) {
        setError(result.message ? `${t("kitchenTicket.printFailed")} (${result.message})` : t("kitchenTicket.printFailed"));
      }
    } catch (err) {
      console.error("Kitchen ticket reprint failed:", err);
      setError(t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmSelectedSaleReprint() {
    if (!selectedOrder) return;
    setShowReprint(false);
    if (!canUsePrintAgent()) {
      setError(t("orders.reprintNoPrinter"));
      return;
    }
    setBusy(true);
    try {
      const cashier = user?.name || user?.email || "";
      const printedOrder = await claimOrderTicketPrint(selectedOrder.id);
      setSelectedOrder(printedOrder);
      const jobs = [buildSaleTicket(printedOrder, t, { cashier, reprint: true }, "restaurant")];
      if (reprintCustomerCopy) jobs.push(buildSaleTicket(printedOrder, t, { cashier }, "customer"));
      for (const job of jobs) {
        const result = await printAgent.print(job);
        if (!result.ok) {
          setError(result.message ? `${t("kitchenTicket.printFailed")} (${result.message})` : t("kitchenTicket.printFailed"));
          return;
        }
      }
    } catch (err) {
      console.error("Sale ticket reprint failed:", err);
      setError(t("orders.actionError"));
    } finally {
      setBusy(false);
    }
  }

  async function transitionUberOrder(order: Order, workflow: "preparing" | "completed") {
    setBusy(true);
    try {
      const res = await authedFetch("/api/uber-eats/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "transition_order", orderId: order.uberOrderId, scenario: workflow }) });
      if (!res.ok) throw new Error("Uber workflow update failed");
      if (workflow === "preparing" && canUsePrintAgent()) {
        const menuItems = await fetchMenuItems();
        const menuItemById = new Map(menuItems.map((item) => [item.id, item]));
        const printedOrder = await claimOrderTicketPrint(order.id);
        const result = await printAgent.print(buildKitchenTicket(printedOrder, (id) => menuItemById.get(id), t, "Uber Eats"));
        if (!result.ok) setError(result.message ? `${t("kitchenTicket.printFailed")} (${result.message})` : t("kitchenTicket.printFailed"));
      }
      await load();
    } catch (err) { console.error("Uber workflow update failed:", err); setError(t("orders.actionError")); }
    finally { setBusy(false); }
  }

  if (editing) {
    return (
      <OrderEditor
        key={editing.id}
        initial={editing}
        isNew={editingIsNew}
        itemsOnly={editingItemsOnly}
        menuItems={menuItems}
        ingredients={ingredients}
        occupiedLabels={occupiedLabels}
        t={t}
        onChanged={load}
        onClose={() => {
          setEditing(null);
          setEditingItemsOnly(false);
          load();
        }}
      />
    );
  }

  const filters: Filter[] = ["active", "held", "paid", "cancelled"];
  return (
    <>
      <section className="hero-row">
        <div>
          <h1>{t("orders.title")}</h1>
          <p className="subhead">{t("orders.subtitle")}</p>
        </div>
        <div className="orders-actions flex gap-2">
          <Button variant="outline" onClick={refreshOrders} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : ""} size={16} /> {t("orders.refresh")}
          </Button>
          <Button onClick={startNew}>
            <Plus size={16} /> {t("orders.newOrder")}
          </Button>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            className={
              "rounded-full border px-3 py-1 text-sm transition-colors " +
              (filter === f
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input text-[var(--text-muted)] hover:bg-[var(--surface-muted)]")
            }
          >
            {t(`orders.filter.${f}`)} ({counts[f]})
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="orders-workspace">
      <div className="orders-list-panel">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="animate-spin" size={16} /> {t("auth.loading")}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input bg-[var(--surface-muted)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
          {t("orders.empty")}
        </p>
      ) : (
        <div className="order-list grid gap-2">
          {visible.map((o) => {
            const count = o.items.reduce((s, l) => s + l.quantity, 0);
            const isSelected = selectedOrder?.id === o.id;
            return (
              <Fragment key={o.id}>
                <div
                  className={`order-list-card rounded-xl border border-input bg-[var(--surface)] p-3${isSelected ? " is-selected" : ""}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isSelected}
                  onClick={() => openOrder(o)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openOrder(o);
                    }
                  }}
                >
                  <div className="order-list-card-button text-left">
                    <div className="order-list-card-summary flex-1">
                      <p className="order-list-card-title text-sm font-semibold">
                        {o.serviceType === "takeout"
                          ? `${t("orders.takeout")}${o.customerName ? ` · ${o.customerName}` : ""}`
                          : o.tableLabel ? tableName(t, o.tableLabel) : `${t("orders.table")} —`}
                        {o.splitLabel ? ` · ${o.splitLabel}` : ""}
                      </p>
                      <p className="order-list-card-meta text-xs text-[var(--text-muted)]">
                        <span>{count} {t("orders.itemsLabel")}</span>
                        <span className="order-list-card-extra"> · {o.server || "—"} · {new Date(o.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
                      </p>
                    </div>
                    <Badge
                      className="order-list-card-status"
                      variant={statusVariant(displayStatus(o))}
                    >
                      {statusLabel(t, displayStatus(o))}
                    </Badge>
                    <b className="order-list-card-total w-28 text-right">{formatMoney(o.total)}</b>
                  </div>
                  {isManager && (
                    <div className="mt-2" onClick={(event) => event.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full"
                        disabled={!auditCounts[o.id]}
                        onClick={() => openTimeline(o)}
                      >
                        <History size={14} /> Timeline{auditCounts[o.id] ? ` (${auditCounts[o.id]})` : ""}
                      </Button>
                    </div>
                  )}
                  {isSelected && (
                    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                      <OrderDetailsPanel
                        order={selectedOrder}
                        t={t}
                        busy={busy}
                        onReprint={reprintSelectedOrder}
                        canEdit={canEditSelectedOrder}
                        onEdit={() => selectedOrder && startItemEdit(selectedOrder)}
                        canSplit={canSplitSelectedOrder}
                        onSplit={() => setShowSelectedSplit(true)}
                        canCancel={canCancelSelectedOrder}
                        onCancel={() => {
                          setCancelReason("");
                          setShowCancel(true);
                        }}
                        embedded
                      />
                    </div>
                  )}
                </div>
              </Fragment>
            );
          })}
        </div>
      )}

      </div>
      {visible.length > 0 && (
        <OrderDetailsPanel
          order={selectedOrder}
          t={t}
          busy={busy}
          onReprint={reprintSelectedOrder}
          canEdit={canEditSelectedOrder}
          onEdit={() => selectedOrder && startItemEdit(selectedOrder)}
          canSplit={canSplitSelectedOrder}
          onSplit={() => setShowSelectedSplit(true)}
          canCancel={canCancelSelectedOrder}
          onCancel={() => {
            setCancelReason("");
            setShowCancel(true);
          }}
          className="order-details-desktop"
        />
      )}
      {uberEatsEnabled && <UberOrdersBoard
        orders={orders}
        loading={loading}
        busy={busy}
        onOpen={openOrder}
        onTransition={transitionUberOrder}
      />}
      </div>

      <Dialog open={showReprint} onOpenChange={setShowReprint}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.reprintTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">{t("orders.reprintBody")}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={reprintCustomerCopy}
              onChange={(e) => setReprintCustomerCopy(e.target.checked)}
            />
            {t("orders.reprintCustomerCopy")}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReprint(false)}>{t("orders.kitchenBack")}</Button>
            <Button onClick={confirmSelectedSaleReprint} disabled={busy}>
              <Printer size={14} /> {t("orders.reprintConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!timelineOrder} onOpenChange={(open) => !open && setTimelineOrder(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Order timeline{timelineOrder?.saleCode ? ` · ${timelineOrder.saleCode}` : ""}</DialogTitle>
          </DialogHeader>
          {timelineLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--text-muted)]"><Loader2 className="animate-spin" size={16} /> Loading activity…</div>
          ) : (
            <ol className="max-h-[60vh] space-y-4 overflow-y-auto border-l-2 border-input pl-5">
              {timelineEvents.map((event) => (
                <li key={event.eventId} className="relative">
                  <span className="absolute -left-[29px] top-1 size-3 rounded-full bg-primary ring-4 ring-[var(--surface)]" />
                  <p className="font-medium">{event.summary}</p>
                  <p className="text-xs text-[var(--text-muted)]">{event.actor.name} · {event.actor.roles.join(", ") || event.actor.source} · {new Date(event.occurredAt).toLocaleString()}</p>
                  {event.details && <AuditDetails details={event.details} />}
                </li>
              ))}
            </ol>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={showCancel} onOpenChange={setShowCancel}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.cancelTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-1">
            <Label>{t("orders.reason")}</Label>
            <Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancel(false)} disabled={busy}>{t("orders.keep")}</Button>
            <Button variant="destructive" className="!bg-destructive !text-white hover:!bg-destructive/90" onClick={cancelSelectedOrder} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <XCircle size={14} />} {t("orders.cancelOrder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showSelectedSplit && selectedOrder && (
        <SplitDialog
          items={selectedOrder.items}
          t={t}
          onClose={() => setShowSelectedSplit(false)}
          onConfirm={splitSelectedOrder}
        />
      )}
    </>
  );
}

function AuditDetails({ details }: { details: Record<string, unknown> }) {
  const voided = Array.isArray(details.voided) ? details.voided as { name?: unknown; quantity?: unknown; reason?: unknown }[] : [];
  return (
    <div className="mt-1 text-xs text-[var(--text-muted)]">
      {typeof details.itemCount === "number" && <p>Items on order: {details.itemCount}</p>}
      {typeof details.total === "number" && <p>Order total: {formatMoney(details.total)}</p>}
      {voided.map((line, index) => (
        <p key={index}>Removed {String(line.quantity ?? 1)}× {String(line.name ?? "item")}{line.reason ? ` — ${String(line.reason)}` : ""}</p>
      ))}
    </div>
  );
}

function OrderDetailsPanel({
  order,
  t,
  busy,
  onReprint,
  canEdit = false,
  onEdit,
  canSplit = false,
  onSplit,
  canCancel = false,
  onCancel,
  embedded = false,
  className = "",
}: {
  order: Order | null;
  t: T;
  busy: boolean;
  onReprint: () => void;
  canEdit?: boolean;
  onEdit?: () => void;
  canSplit?: boolean;
  onSplit?: () => void;
  canCancel?: boolean;
  onCancel?: () => void;
  embedded?: boolean;
  className?: string;
}) {
  if (!order) {
    return (
      <aside className={`order-details-panel order-details-empty ${className}`} aria-live="polite">
        <h2>{t("orders.orderDetails")}</h2>
        <p>{t("orders.selectOrderHint")}</p>
      </aside>
    );
  }

  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const label = order.serviceType === "takeout"
    ? `${t("orders.takeout")}${order.customerName ? ` · ${order.customerName}` : ""}`
    : order.tableLabel ? tableName(t, order.tableLabel) : `${t("orders.table")} —`;

  return (
    <aside className={`order-details-panel${embedded ? " order-details-embedded" : ""} ${className}`} aria-live="polite">
      {!embedded && (
        <div className="order-details-head">
          <div>
            <p className="eyebrow">{t("orders.orderDetails")}</p>
            <h2>{label}{order.splitLabel ? ` · ${order.splitLabel}` : ""}</h2>
          </div>
          <Badge variant={statusVariant(displayStatus(order))}>{statusLabel(t, displayStatus(order))}</Badge>
        </div>
      )}
      <dl className="order-details-meta">
        <div><dt>{t("orders.itemsLabel")}</dt><dd>{itemCount}</dd></div>
        <div><dt>{t("orders.server")}</dt><dd>{order.server || "—"}</dd></div>
        <div><dt>{t("orders.createdAt")}</dt><dd>{new Date(order.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</dd></div>
      </dl>
      <div className="order-details-items">
        {order.items.map((item) => (
          <div key={item.lineId} className="order-details-item">
            <span>{item.quantity}×</span>
            <div>
              <p>{item.name}</p>
              {(item.modifiers ?? []).length > 0 && <small>{(item.modifiers ?? []).map((modifier) => modifier.name).join(", ")}</small>}
              {item.instructions && <small>“{item.instructions}”</small>}
            </div>
            <b>{formatMoney(item.quantity * item.unitPrice)}</b>
          </div>
        ))}
      </div>
      {order.notes && <p className="order-details-notes">{t("orders.orderNotes")}: {order.notes}</p>}
      <div className="order-details-total"><span>{t("orders.total")}</span><b>{formatMoney(order.total)}</b></div>
      {canEdit && onEdit && (
        <Button variant="outline" onClick={onEdit} disabled={busy} className="w-full">
          <Pencil size={14} /> {t("orders.editOrder")}
        </Button>
      )}
      {canSplit && onSplit && (
        <Button variant="outline" onClick={onSplit} disabled={busy} className="w-full">
          <Split size={14} /> {t("orders.split")}
        </Button>
      )}
      {canCancel && onCancel && (
        <Button variant="destructive" onClick={onCancel} disabled={busy} className="w-full !bg-destructive !text-white hover:!bg-destructive/90">
          <XCircle size={14} /> {t("orders.cancelOrder")}
        </Button>
      )}
      <Button onClick={onReprint} disabled={busy} className="order-details-print w-full" aria-label={order.status === "paid" ? t("orders.reprint") : t("orders.reprintKitchenTicketCopy")}>
        {busy ? <Loader2 className="animate-spin" size={14} /> : <Printer size={14} />}
        <span>{order.status === "paid" ? t("orders.reprint") : t("orders.reprintKitchenTicketCopy")}</span>
      </Button>
    </aside>
  );
}

// ===========================================================================
// Editor
// ===========================================================================

type UberOrdersBoardProps = {
  orders: Order[];
  loading: boolean;
  busy: boolean;
  onOpen: (order: Order) => void;
  onTransition: (order: Order, workflow: "preparing" | "completed") => void;
};

/** A dedicated prep view for orders delivered by the Uber Eats webhook. */
function UberOrdersBoard({ orders, loading, busy, onOpen, onTransition }: UberOrdersBoardProps) {
  const { t } = useTranslation();
  const uberOrders = orders.filter((order) => order.source === "uber-eats" && order.status !== "cancelled");
  const columns = [
    { key: "new", label: t("orders.uber.newOrders"), orders: uberOrders.filter((order) => (order.uberWorkflowStatus ?? "new") === "new") },
    // Legacy ready records remain actionable in Preparing after that state is retired.
    { key: "preparing", label: t("orders.uber.preparing"), orders: uberOrders.filter((order) => order.uberWorkflowStatus !== "new" && order.uberWorkflowStatus !== "completed") },
    { key: "complete", label: t("orders.uber.completed"), orders: uberOrders.filter((order) => order.uberWorkflowStatus === "completed") },
  ];

  return (
    <aside className="uber-kanban" aria-label="Uber Eats order board">
      <div className="uber-kanban-head">
        <div>
          <div className="uber-brand"><span>Uber</span> Eats</div>
          <h2>{t("orders.uber.deliveryBoard")}</h2>
          <p>{t("orders.uber.liveMarketplaceOrders")}</p>
        </div>
        <span className="uber-live"><i /> {t("orders.uber.live")}</span>
      </div>

      <div className="uber-columns">
        {columns.map((column) => (
          <section className={`uber-column uber-column-${column.key}`} key={column.key}>
            <header>
              <span>{column.label}</span>
              <b>{column.orders.length}</b>
            </header>
            {loading ? (
              <div className="uber-empty"><Loader2 className="animate-spin" size={15} /></div>
            ) : column.orders.length === 0 ? (
              <div className="uber-empty">{t("orders.uber.noOrders")}</div>
            ) : (
              <div className="uber-cards">
                {column.orders.map((order) => {
                  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                  const displayId = order.uberDisplayId || order.uberOrderId?.slice(-5) || order.id.slice(-5);
                  return (
                    <article className="uber-card" key={order.id}>
                      <button className="uber-card-main" onClick={() => onOpen(order)}>
                        <div className="uber-card-id">
                          <strong>#{displayId}</strong>
                          <span>{order.customerName || t("orders.uber.guest")}</span>
                        </div>
                        <p>{itemCount} {itemCount === 1 ? t("orders.uber.item") : t("orders.uber.items")} · {formatMoney(order.total)}</p>
                        <small>{order.uberReadyForPickupAt ? t("orders.uber.pickupBy", { time: new Date(order.uberReadyForPickupAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }) : t("orders.uber.pickupOrder")}</small>
                      </button>
                      {column.key === "new" && (
                        <button className="uber-workflow-action" onClick={() => onTransition(order, "preparing")} disabled={busy}>
                          <UtensilsCrossed size={14} /> {t("orders.uber.acceptAndPrepare")} <ChevronRight size={14} />
                        </button>
                      )}
                      {column.key === "preparing" && <button className="uber-workflow-action" onClick={() => onTransition(order, "completed")} disabled={busy}><Bike size={14} /> {t("orders.uber.markPickedUp")} <ChevronRight size={14} /></button>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}

type ReasonDialog = { kind: "void"; lineId: string } | { kind: "cancel" } | null;

function OrderEditor({
  initial,
  isNew,
  itemsOnly,
  menuItems,
  ingredients,
  occupiedLabels,
  t,
  onChanged,
  onClose,
}: {
  initial: Order;
  isNew: boolean;
  itemsOnly: boolean;
  menuItems: MenuItem[];
  ingredients: MenuIngredient[];
  occupiedLabels: Set<string>;
  t: T;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Order>(initial);
  const [persisted, setPersisted] = useState(!isNew);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [itemDialog, setItemDialog] = useState<{ item: MenuItem; line?: OrderLineItem } | null>(null);
  const [reasonDialog, setReasonDialog] = useState<ReasonDialog>(null);
  const [reason, setReason] = useState("");
  const [showSplit, setShowSplit] = useState(false);
  const [showKitchenConfirm, setShowKitchenConfirm] = useState(false);
  const [showReprint, setShowReprint] = useState(false);
  const [reprintCustomerCopy, setReprintCustomerCopy] = useState(false);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [lastSavedOrder, setLastSavedOrder] = useState<Order>(initial);
  const { user: currentUser } = useAuth();

  const readOnly = draft.status === "paid" || draft.status === "cancelled";
  const serviceType: ServiceType = draft.serviceType ?? "dine-in";
  const seats = serviceType === "dine-in" ? seatCountFor(draft.tableLabel) : 0;

  // Real-time totals for whatever is currently in the draft.
  const totals = useMemo(() => computeTotals(draft.items, adjustmentsOf(draft)), [draft]);

  const available = useMemo(() => menuItems.filter((i) => i.available), [menuItems]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    available.forEach((i) => i.category && set.add(i.category));
    return ["all", ...Array.from(set).sort()];
  }, [available]);
  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return available.filter(
      (i) =>
        (category === "all" || i.category === category) &&
        (!term || i.name.toLowerCase().includes(term) || (i.description ?? "").toLowerCase().includes(term))
    );
  }, [available, category, search]);

  useEffect(() => {
    if (!persisted) return;
    fetchOrderAudit(initial.id).then(setAuditEvents).catch((error) =>
      console.error("Failed to load order audit:", error),
    );
  }, [initial.id, persisted]);

  function update(patch: Partial<Order>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
    setMessage(null);
  }

  function setService(type: ServiceType) {
    update({
      serviceType: type,
      tableLabel: type === "takeout" ? TAKEOUT_LABEL : "",
      seat: undefined,
    });
  }

  // ---- line operations ----------------------------------------------------

  function upsertLine(line: OrderLineItem, replaceId?: string) {
    setDraft((d) => {
      const idx = replaceId ? d.items.findIndex((l) => l.lineId === replaceId) : -1;
      const without = idx >= 0 ? d.items.filter((_, i) => i !== idx) : d.items;
      const sig = lineSignature(line);
      const match = without.find((l) => lineSignature(l) === sig);
      let items: OrderLineItem[];
      if (match) {
        // Same item/options/notes/seat already on the order: combine quantities.
        items = without.map((l) => (l === match ? { ...l, quantity: l.quantity + line.quantity } : l));
      } else if (idx >= 0) {
        // Edited line keeps its original position.
        items = [...without.slice(0, idx), line, ...without.slice(idx)];
      } else {
        items = [...without, line];
      }
      return { ...d, items };
    });
    setDirty(true);
    setMessage(null);
  }

  // Adding from the menu should be a single tap. Required modifiers use their
  // configured first option; optional modifiers, notes, and seat can still be
  // adjusted from the line's edit action after it has been added.
  function addMenuItem(item: MenuItem) {
    const modifiers: OrderModifier[] = getModifierGroups(item).flatMap((group) =>
      group.required && group.options[0]
        ? [{
            groupId: group.id,
            group: group.name,
            id: group.options[0].id,
            name: group.options[0].name,
            price: group.options[0].price,
          }]
        : [],
    );
    const basePrice = parsePrice(item.price);
    upsertLine({
      lineId: newLineId(),
      menuItemId: item.id,
      name: item.name,
      basePrice,
      unitPrice: round2(basePrice + modifiersTotal(modifiers)),
      quantity: 1,
      modifiers,
      instructions: "",
      seat: itemsOnly ? undefined : draft.seat,
    });
  }

  function changeQty(lineId: string, delta: number) {
    setDraft((d) => ({
      ...d,
      items: d.items
        .map((l) => (l.lineId === lineId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    }));
    setDirty(true);
  }

  // ---- persistence --------------------------------------------------------

  function validate(): string | null {
    if (serviceType === "dine-in" && !draft.tableLabel) return t("orders.needTable");
    if (draft.items.length === 0) return t("orders.needItems");
    return null;
  }

  async function persist(patch?: Partial<Order>): Promise<Order | null> {
    const problem = validate();
    if (problem) {
      setMessage({ kind: "error", text: problem });
      return null;
    }
    const toSave = withTotals({ ...draft, ...patch });
    const stored = await saveOrder(toSave); // carries the sale code assigned on first save
    const voided = (stored.voidedItems ?? []).filter(
      (line) => !(lastSavedOrder.voidedItems ?? []).some((previous) => previous.lineId === line.lineId),
    );
    const itemDelta = stored.items.reduce((count, line) => count + line.quantity, 0) - lastSavedOrder.items.reduce((count, line) => count + line.quantity, 0);
    const eventType = !persisted ? "order.created" : voided.length ? "item.voided" : "order.updated";
    const summary = !persisted
      ? `Created order with ${stored.items.reduce((count, line) => count + line.quantity, 0)} item(s)`
      : voided.length
        ? `Voided ${voided.map((line) => `${line.quantity}× ${line.name}`).join(", ")}`
        : itemDelta
          ? `${itemDelta > 0 ? "Added" : "Removed"} ${Math.abs(itemDelta)} item(s)`
          : "Updated order details";
    void recordOrderAudit(stored.id, eventType, summary, {
      itemCount: stored.items.reduce((count, line) => count + line.quantity, 0),
      total: stored.total,
      voided: voided.map(({ name, quantity, voidReason }) => ({ name, quantity, reason: voidReason })),
    }).then(() => fetchOrderAudit(stored.id)).then(setAuditEvents).catch((error) =>
      console.error("Failed to record order audit:", error),
    );
    setDraft(stored);
    setLastSavedOrder(stored);
    setPersisted(true);
    setDirty(false);
    onChanged();
    return stored;
  }

  async function run(action: () => Promise<void>, okText?: string) {
    setBusy(true);
    try {
      await action();
      if (okText) setMessage({ kind: "ok", text: okText });
    } catch (err) {
      console.error("Order action failed:", err);
      setMessage({ kind: "error", text: t("orders.actionError") });
    } finally {
      setBusy(false);
    }
  }

  const handleSaveItemChanges = () =>
    run(async () => {
      const saved = await persist();
      if (saved) onClose();
    }, t("orders.saved"));

  // "Send To Kitchen": validate first, then have the waiter confirm the items by seat.
  function handleSendToKitchen() {
    const problem = validate();
    if (problem) {
      setMessage({ kind: "error", text: problem });
      return;
    }
    setShowKitchenConfirm(true);
  }

  function confirmSendToKitchen() {
    setShowKitchenConfirm(false);
    return run(async () => {
      const saved = await persist();
      if (!saved) return;
      // The print agent only exists on the tablet; elsewhere just save.
      if (canUsePrintAgent()) {
        const menuItemById = new Map(menuItems.map((item) => [item.id, item]));
        const printedOrder = await claimOrderTicketPrint(saved.id);
        const job = buildKitchenTicket(
          printedOrder,
          (id) => menuItemById.get(id),
          t,
          tableName(t, printedOrder.tableLabel),
        );
        const result = await printAgent.print(job);
        if (!result.ok) {
          // Stay on the order so the waiter sees the problem and can resend.
          setMessage({
            kind: "error",
            text: result.message ? `${t("kitchenTicket.printFailed")} (${result.message})` : t("kitchenTicket.printFailed"),
          });
          return;
        }
      }
      onClose(); // back to the orders list
    });
  }

  // Paid orders: print the order ticket again (marked "REIMPRESION"), optionally with a customer copy.
  function confirmReprint() {
    setShowReprint(false);
    return run(async () => {
      if (!canUsePrintAgent()) {
        setMessage({ kind: "error", text: t("orders.reprintNoPrinter") });
        return;
      }
      const cashier = currentUser?.name || currentUser?.email || "";
      const printedOrder = await claimOrderTicketPrint(draft.id);
      // Cashier (restaurant) copy is marked as a reprint; none of these jobs opens the cash drawer.
      const jobs = [buildSaleTicket(printedOrder, t, { cashier, reprint: true }, "restaurant")];
      // The optional customer copy carries no reprint note.
      if (reprintCustomerCopy) jobs.push(buildSaleTicket(printedOrder, t, { cashier }, "customer"));
      // One at a time so the tickets come out in order; stop at the first failure.
      for (const job of jobs) {
        const result = await printAgent.print(job);
        if (!result.ok) {
          setMessage({
            kind: "error",
            text: result.message ? `${t("kitchenTicket.printFailed")} (${result.message})` : t("kitchenTicket.printFailed"),
          });
          return;
        }
      }
      setMessage({ kind: "ok", text: t("orders.reprintSent") });
    });
  }

  // Items grouped by seat (numbered seats first, unassigned last) for the confirmation dialog.
  const seatGroups = useMemo(() => {
    // Takeout has no seats: one flat group.
    if (serviceType === "takeout") return [[undefined, draft.items]] as [number | undefined, OrderLineItem[]][];
    const groups = new Map<number | undefined, OrderLineItem[]>();
    for (const line of draft.items) {
      const list = groups.get(line.seat) ?? [];
      list.push(line);
      groups.set(line.seat, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === undefined) return 1;
      if (b === undefined) return -1;
      return a - b;
    });
  }, [draft.items, serviceType]);

  const handleHold = () =>
    run(async () => {
      const saved = await persist();
      if (!saved) return;
      await setHeld(saved.id, true);
      setDraft({ ...saved, status: "held", heldAt: new Date().toISOString() });
      onChanged();
    }, t("orders.held"));

  const handleResume = () =>
    run(async () => {
      const saved = dirty ? await persist() : draft;
      if (!saved) return;
      await setHeld(saved.id, false);
      setDraft({ ...saved, status: "open", heldAt: undefined });
      onChanged();
    }, t("orders.resumed"));

  const handleReopen = () => {
    if (draft.status === "paid" && !window.confirm(t("orders.confirmReopenPaid"))) return;
    return run(async () => {
      await reopenOrder(draft);
      setDraft({ ...draft, status: "open", cancelReason: undefined, paidAt: undefined, tip: 0 });
      onChanged();
    }, t("orders.reopened"));
  };

  function confirmReason() {
    const dlg = reasonDialog;
    if (!dlg) return;
    const text = reason.trim() || t("orders.noReason");
    setReasonDialog(null);
    setReason("");
    if (dlg.kind === "void") {
      setDraft((d) => voidLine(d, dlg.lineId, text));
      setDirty(true);
      return;
    }
    if (!persisted) {
      onClose();
      return;
    }
    run(async () => {
      await cancelOrder(draft.id, text);
      onChanged();
      onClose(); // back to the orders list
    });
  }

  function handleSplitRequest() {
    run(async () => {
      const saved = await persist();
      if (saved) setShowSplit(true);
    });
  }

  async function handleSplitConfirm(groups: OrderLineItem[][]) {
    setShowSplit(false);
    await run(async () => {
      await splitOrder(draft, groups);
      onChanged();
      onClose();
    });
  }

  function back() {
    if (dirty && !window.confirm(t("orders.discardChanges"))) return;
    onClose();
  }

  const unvoided = draft.items;
  const voided = draft.voidedItems ?? [];

  return (
    <>
      <section className="hero-row">
        <div>
          <Button variant="ghost" size="sm" onClick={back} className="mb-1 -ml-2">
            <ArrowLeft size={16} /> {t("orders.back")}
          </Button>
          <h1>
            {serviceType === "takeout"
              ? t("orders.takeout")
              : draft.tableLabel
                ? tableName(t, draft.tableLabel)
                : t("orders.newOrder")}
            {draft.splitLabel ? ` · ${draft.splitLabel}` : ""}
          </h1>
          {draft.status !== "open" && (
            <p className="subhead mb-4">
              <Badge
                variant={statusVariant(displayStatus(draft))}
              >
                {statusLabel(t, displayStatus(draft))}
              </Badge>
              {draft.status === "cancelled" && draft.cancelReason ? ` ${draft.cancelReason}` : ""}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* ----------------------------- left: menu ----------------------------- */}
        <div className="grid content-start gap-4">
          {!readOnly && (
            <article className="rounded-xl border border-input bg-[var(--surface)] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Search size={16} className="text-[var(--text-muted)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("orders.searchMenu")}
                  aria-label={t("orders.searchMenu")}
                />
              </div>
              <div className="mb-3 flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={
                      "rounded-full border px-3 py-1 text-sm transition-colors " +
                      (category === cat
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-input text-[var(--text-muted)] hover:bg-[var(--surface-muted)]")
                    }
                  >
                    {cat === "all" ? t("orders.all") : cat}
                  </button>
                ))}
              </div>
              {filteredItems.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t("orders.noMenuItems")}</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => addMenuItem(item)}
                      className="flex flex-col items-start gap-1 rounded-xl border border-input bg-[var(--surface)] p-3 text-left transition-all hover:border-primary hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <MenuItemThumb imageKey={item.imageKey} />
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
            </article>
          )}
        </div>

        {/* ------------------------- right: order panel ------------------------- */}
        <aside className="grid content-start gap-3 rounded-xl border border-input bg-[var(--surface)] p-4 lg:sticky lg:top-4 lg:self-start">
          {!itemsOnly && (
            <section className="grid gap-4 border-b border-input pb-4" aria-label={t("orders.serviceType")}>
              <div className="grid gap-2">
                <Label className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">1</span>
                  {t("orders.wizardService")}
                </Label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("orders.serviceType")}>
                  {(["dine-in", "takeout"] as ServiceType[]).map((type) => (
                    <Button
                      key={type}
                      variant={serviceType === type ? "default" : "outline"}
                      disabled={readOnly}
                      aria-pressed={serviceType === type}
                      onClick={() => serviceType !== type && setService(type)}
                    >
                      {t(type === "dine-in" ? "orders.dineIn" : "orders.takeout")}
                    </Button>
                  ))}
                </div>
              </div>

              {serviceType === "dine-in" ? (
                <div className="grid gap-2">
                  <Label className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">2</span>
                    {t("orders.wizardLocation")}
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {SEATING_SPOTS.map((spot) => {
                      const unavailable = occupiedLabels.has(spot.id) && spot.id !== initial.tableLabel;
                      const selected = draft.tableLabel === spot.id;
                      return (
                        <Button
                          key={spot.id}
                          variant={selected ? "default" : "outline"}
                          disabled={readOnly || unavailable}
                          aria-pressed={selected}
                          onClick={() => update({ tableLabel: spot.id, seat: undefined })}
                          className="h-auto min-h-14 flex-col gap-0.5 py-2"
                        >
                          <span>{tableName(t, spot.id)}</span>
                          <span className="text-xs font-normal opacity-75">{spot.seats} {t("orders.seats")}</span>
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="grid gap-1">
                  <Label className="flex items-center gap-2">
                    <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">3</span>
                    {t("orders.wizardCustomer")}
                  </Label>
                  <Input
                    value={draft.customerName ?? ""}
                    disabled={readOnly}
                    onChange={(e) => update({ customerName: e.target.value })}
                  />
                </div>
              )}
            </section>
          )}
          <h2 className="text-base font-semibold">{t("orders.orderPanel")}</h2>

          {auditEvents.length > 0 && (
            <section className="border-b border-input pb-3">
              <h3 className="mb-2 text-sm font-semibold">Activity</h3>
              <ol className="grid gap-2">
                {auditEvents.slice(0, 8).map((event) => (
                  <li key={event.eventId} className="border-l-2 border-primary pl-2 text-xs">
                    <p className="font-medium">{event.summary}</p>
                    <p className="text-[var(--text-muted)]">
                      {event.actor.name} · {new Date(event.occurredAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {unvoided.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("orders.emptyOrder")}</p>
          ) : (
            <ul className="grid gap-2">
              {unvoided.map((line) => {
                const menuItem = menuItems.find((m) => m.id === line.menuItemId);
                return (
                  <li key={line.lineId} className="rounded-lg border border-input p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{line.name}</p>
                        {(line.modifiers ?? []).length > 0 && (
                          <p className="text-xs text-[var(--text-muted)]">
                            {(line.modifiers ?? []).map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {line.instructions && (
                          <p className="text-xs italic text-[var(--text-muted)]">“{line.instructions}”</p>
                        )}
                        {line.seat && (
                          <Badge variant="outline" className="mt-1">
                            {t("orders.seat")} {line.seat}
                          </Badge>
                        )}
                      </div>
                      <b className="text-sm">{formatMoney(line.unitPrice * line.quantity)}</b>
                    </div>
                    {!readOnly && (
                      <div className="mt-2 flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon-xs"
                            aria-label={t("orders.decrease")}
                            onClick={() => changeQty(line.lineId!, -1)}
                          >
                            <Minus size={12} />
                          </Button>
                          <span className="w-6 text-center text-sm" aria-live="polite">{line.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon-xs"
                            aria-label={t("orders.increase")}
                            onClick={() => changeQty(line.lineId!, 1)}
                          >
                            <Plus size={12} />
                          </Button>
                        </div>
                        <div className="flex gap-1">
                          {menuItem && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={t("orders.editItem")}
                              onClick={() => setItemDialog({ item: menuItem, line })}
                            >
                              <Pencil size={12} />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={t("orders.voidItem")}
                            onClick={() => {
                              setReason("");
                              setReasonDialog({ kind: "void", lineId: line.lineId! });
                            }}
                          >
                            <Ban size={12} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {voided.length > 0 && (
            <div className="rounded-lg bg-[var(--surface-muted)] p-2 text-xs text-[var(--text-muted)]">
              <p className="font-medium">{t("orders.voidedItems")}</p>
              {voided.map((v, i) => (
                <p key={i}>
                  <s>{v.quantity}× {v.name}</s> — {v.voidReason}
                </p>
              ))}
            </div>
          )}

          <div className="grid gap-1">
            <Label>{t("orders.orderNotes")}</Label>
            <textarea
              className={textareaClass}
              rows={2}
              value={draft.notes}
              disabled={readOnly}
              onChange={(e) => update({ notes: e.target.value })}
            />
          </div>

          <dl className="grid gap-1 border-t border-input pt-2 text-sm">
            <div className="flex justify-between"><dt>{t("orders.subtotal")}</dt><dd>{formatMoney(totals.subtotal)}</dd></div>
            {totals.discount > 0 && (
              <div className="flex justify-between"><dt>{t("orders.discount")}</dt><dd>−{formatMoney(totals.discount)}</dd></div>
            )}
            {totals.fee > 0 && (
              <div className="flex justify-between"><dt>{t("orders.fee")}</dt><dd>{formatMoney(totals.fee)}</dd></div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>{t("orders.total")}</dt><dd>{formatMoney(totals.total)}</dd>
            </div>
          </dl>

          {message && (
            <p
              role={message.kind === "error" ? "alert" : "status"}
              className={
                "rounded-lg px-3 py-2 text-sm " +
                (message.kind === "error" ? "bg-destructive/10 text-destructive" : "bg-[var(--surface-muted)]")
              }
            >
              {message.text}
            </p>
          )}

          {/* actions */}
          {itemsOnly ? (
            <Button onClick={handleSaveItemChanges} disabled={busy || !dirty}>
              {busy ? <Loader2 className="animate-spin" size={14} /> : <Pencil size={14} />} {t("orders.save")}
            </Button>
          ) : readOnly ? (
            <div className="grid gap-2">
              <p className="text-xs text-[var(--text-muted)]">{t("orders.readOnlyNote")}</p>
              <Button onClick={handleReopen} disabled={busy || (draft.status === "paid" && draft.paymentMethod === "card")}>
                <RotateCcw size={14} /> {t("orders.reopen")}
              </Button>
              {draft.status === "paid" && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    setReprintCustomerCopy(false);
                    setShowReprint(true);
                  }}
                >
                  <Printer size={14} /> {t("orders.reprint")}
                </Button>
              )}
              {draft.status === "paid" && draft.paymentMethod === "card" && (
                <p className="text-xs text-[var(--text-muted)]">{t("orders.cardNote")}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleSendToKitchen} disabled={busy} className="col-span-2">
                {busy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />} {t("orders.sendToKitchen")}
              </Button>
              {draft.status === "held" ? (
                <Button variant="outline" onClick={handleResume} disabled={busy}>
                  <Play size={14} /> {t("orders.resume")}
                </Button>
              ) : (
                <Button variant="outline" onClick={handleHold} disabled={busy}>
                  <Pause size={14} /> {t("orders.hold")}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleSplitRequest}
                disabled={busy || draft.items.reduce((s, l) => s + l.quantity, 0) < 2}
              >
                <Split size={14} /> {t("orders.split")}
              </Button>
              <Button
                variant="destructive"
                className="col-span-2"
                disabled={busy}
                onClick={() => {
                  setReason("");
                  setReasonDialog({ kind: "cancel" });
                }}
              >
                <XCircle size={14} /> {t("orders.cancelOrder")}
              </Button>
            </div>
          )}
        </aside>
      </div>

      {/* item / variants dialog */}
      {itemDialog && (
        <ItemDialog
          key={itemDialog.line?.lineId ?? itemDialog.item.id}
          item={itemDialog.item}
          ingredients={ingredients}
          line={itemDialog.line}
          defaultSeat={itemsOnly ? undefined : draft.seat}
          seatCount={itemsOnly ? 0 : seats}
          t={t}
          onClose={() => setItemDialog(null)}
          onConfirm={(line) => {
            upsertLine(line, itemDialog.line?.lineId);
            setItemDialog(null);
          }}
        />
      )}

      {/* confirm order before it reaches the kitchen */}
      <Dialog open={showKitchenConfirm} onOpenChange={setShowKitchenConfirm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("orders.kitchenConfirmTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">
            {serviceType === "takeout"
              ? t("orders.takeout")
              : tableName(t, draft.tableLabel)}
            {" · "}
            {serviceType === "takeout" ? t("orders.kitchenConfirmBodyTakeout") : t("orders.kitchenConfirmBody")}
          </p>
          <div className="grid max-h-[55vh] gap-3 overflow-y-auto py-1">
            {seatGroups.map(([seat, lines]) => (
              <section key={seat ?? "none"} className="rounded-lg border border-input p-3">
                {serviceType !== "takeout" && (
                  <h3 className="mb-2 text-sm font-semibold">
                    {seat === undefined ? t("orders.noSeatGroup") : `${t("orders.seat")} ${seat}`}
                  </h3>
                )}
                <ul className="grid gap-2">
                  {lines.map((line) => (
                    <li key={line.lineId} className="flex items-start gap-2 text-sm">
                      <b className="w-8 shrink-0">{line.quantity}×</b>
                      <div className="min-w-0">
                        <p className="font-medium">{line.name}</p>
                        {(line.modifiers ?? []).length > 0 && (
                          <p className="text-xs text-[var(--text-muted)]">
                            {(line.modifiers ?? []).map((m) => m.name).join(", ")}
                          </p>
                        )}
                        {line.instructions && (
                          <p className="text-xs italic text-[var(--text-muted)]">“{line.instructions}”</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKitchenConfirm(false)}>
              {t("orders.kitchenBack")}
            </Button>
            <Button onClick={confirmSendToKitchen} disabled={busy}>
              <Send size={14} /> {t("orders.kitchenConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* reprint tickets for a paid order */}
      <Dialog open={showReprint} onOpenChange={setShowReprint}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.reprintTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">{t("orders.reprintBody")}</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={reprintCustomerCopy}
              onChange={(e) => setReprintCustomerCopy(e.target.checked)}
            />
            {t("orders.reprintCustomerCopy")}
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReprint(false)}>
              {t("orders.kitchenBack")}
            </Button>
            <Button onClick={confirmReprint} disabled={busy}>
              <Printer size={14} /> {t("orders.reprintConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* void / cancel reason */}
      <Dialog open={reasonDialog !== null} onOpenChange={(o) => !o && setReasonDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reasonDialog?.kind === "cancel" ? t("orders.cancelTitle") : t("orders.voidTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-1">
            <Label>{t("orders.reason")}</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReasonDialog(null)}>{t("orders.keep")}</Button>
            <Button variant="destructive" onClick={confirmReason}>
              {reasonDialog?.kind === "cancel" ? t("orders.cancelOrder") : t("orders.voidItem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showSplit && (
        <SplitDialog
          items={draft.items}
          t={t}
          onClose={() => setShowSplit(false)}
          onConfirm={handleSplitConfirm}
        />
      )}
    </>
  );
}

// ===========================================================================
// Item + variants dialog
// ===========================================================================

function ItemDialog({
  item,
  ingredients,
  line,
  defaultSeat,
  seatCount,
  t,
  onClose,
  onConfirm,
}: {
  item: MenuItem;
  ingredients: MenuIngredient[];
  line?: OrderLineItem;
  defaultSeat?: number;
  seatCount: number;
  t: T;
  onClose: () => void;
  onConfirm: (line: OrderLineItem) => void;
}) {
  const groups = useMemo(() => getModifierGroups(item), [item]);
  // Ingredient names, as a visual aid when a customer asks what is in the dish.
  const contains = useMemo(
    () =>
      (item.ingredientIds ?? [])
        .map((id) => ingredients.find((i) => i.id === id)?.name)
        .filter((n): n is string => !!n),
    [item, ingredients]
  );
  const base = line?.basePrice ?? parsePrice(item.price);

  // groupId -> selected option ids. Required single groups default to option 1.
  const [picked, setPicked] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const g of groups) {
      const existing = (line?.modifiers ?? []).filter((m) => m.groupId === g.id).map((m) => m.id);
      init[g.id] = line ? existing : g.required && g.options[0] ? [g.options[0].id] : [];
    }
    return init;
  });
  const [quantity, setQuantity] = useState(line?.quantity ?? 1);
  const [instructions, setInstructions] = useState(line?.instructions ?? "");
  const [seat, setSeat] = useState<number | undefined>(line ? line.seat : defaultSeat);

  function toggle(group: ModifierGroup, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.type === "single") {
        // Optional single groups can be cleared by tapping the chosen option again.
        const next = current[0] === optionId && !group.required ? [] : [optionId];
        return { ...prev, [group.id]: next };
      }
      return {
        ...prev,
        [group.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
      };
    });
  }

  const modifiers: OrderModifier[] = groups.flatMap((g) =>
    g.options
      .filter((o) => (picked[g.id] ?? []).includes(o.id))
      .map((o) => ({ groupId: g.id, group: g.name, id: o.id, name: o.name, price: o.price }))
  );
  const unitPrice = round2(base + modifiersTotal(modifiers));
  const missingRequired = groups.some((g) => g.required && (picked[g.id] ?? []).length === 0);

  function confirm() {
    onConfirm({
      lineId: line?.lineId ?? newLineId(),
      menuItemId: item.id,
      name: item.name,
      basePrice: base,
      unitPrice,
      quantity,
      modifiers,
      instructions: instructions.trim(),
      seat,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{item.name}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-4 overflow-y-auto py-1">
          {contains.length > 0 && (
            <div className="grid gap-1 rounded-lg bg-[var(--surface-muted)] p-3">
              <p className="text-sm font-medium">{t("orders.contains")}</p>
              <p className="text-sm text-[var(--text-muted)]">{contains.join(", ")}</p>
            </div>
          )}
          {groups.map((g) => (
            <fieldset key={g.id} className="grid gap-1">
              <legend className="text-sm font-medium">
                {g.name}{" "}
                <span className="text-xs font-normal text-[var(--text-muted)]">
                  {g.required ? t("orders.required") : g.type === "single" ? t("orders.chooseOne") : t("orders.chooseAny")}
                </span>
              </legend>
              <div className="flex flex-wrap gap-2">
                {g.options.map((o) => {
                  const on = (picked[g.id] ?? []).includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(g, o.id)}
                      className={
                        "rounded-full border px-3 py-1 text-sm transition-colors " +
                        (on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-input hover:bg-[var(--surface-muted)]")
                      }
                    >
                      {o.name}
                      {o.price > 0 ? ` +${formatMoney(o.price)}` : ""}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          {seatCount > 0 && (
            <div className="grid gap-1">
              <Label>{t("orders.seat")}</Label>
              <select
                className={selectClass}
                value={seat ?? ""}
                onChange={(e) => setSeat(e.target.value ? Number(e.target.value) : undefined)}
              >
                <option value="">{t("orders.noSeat")}</option>
                {Array.from({ length: seatCount }, (_, i) => (
                  <option key={i} value={i + 1}>{t("orders.seat")} {i + 1}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-1">
            <Label>{t("orders.instructions")}</Label>
            <textarea
              className={textareaClass}
              rows={2}
              value={instructions}
              placeholder={t("orders.instructionsPlaceholder")}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="mb-0">{t("orders.quantity")}</Label>
            <Button variant="outline" size="icon-xs" aria-label={t("orders.decrease")} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              <Minus size={12} />
            </Button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <Button variant="outline" size="icon-xs" aria-label={t("orders.increase")} onClick={() => setQuantity((q) => q + 1)}>
              <Plus size={12} />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("orders.keep")}</Button>
          <Button onClick={confirm} disabled={missingRequired}>
            {line ? t("orders.updateItem") : t("orders.addToOrder")} · {formatMoney(unitPrice * quantity)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Split dialog (keeps modifiers/instructions/seat on every line)
// ===========================================================================

function SplitDialog({
  items,
  t,
  onClose,
  onConfirm,
}: {
  items: OrderLineItem[];
  t: T;
  onClose: () => void;
  onConfirm: (groups: OrderLineItem[][]) => void;
}) {
  const units = useMemo(() => {
    const out: { uid: string; line: OrderLineItem }[] = [];
    items.forEach((line) => {
      for (let i = 0; i < line.quantity; i++) out.push({ uid: `${line.lineId}#${i}`, line });
    });
    return out;
  }, [items]);

  const [guestCount, setGuestCount] = useState(2);
  const [assignment, setAssignment] = useState<Record<string, number>>({});

  const groups = useMemo(() => {
    return Array.from({ length: guestCount }, (_, g) => {
      const byLine = new Map<string, OrderLineItem>();
      for (const u of units) {
        if ((assignment[u.uid] ?? 0) !== g) continue;
        const existing = byLine.get(u.line.lineId!);
        if (existing) existing.quantity += 1;
        else byLine.set(u.line.lineId!, { ...u.line, quantity: 1 });
      }
      return Array.from(byLine.values());
    });
  }, [guestCount, units, assignment]);

  const nonEmpty = groups.filter((g) => g.length > 0).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("orders.splitTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">{t("orders.splitBody")}</p>
        <div className="flex items-center gap-2">
          <Label className="mb-0">{t("orders.guests")}</Label>
          <select
            className={selectClass}
            value={guestCount}
            onChange={(e) => setGuestCount(Number(e.target.value))}
          >
            {[2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <ul className="grid max-h-[40vh] gap-1 overflow-y-auto">
          {units.map((u) => (
            <li key={u.uid} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">
                {u.line.name}
                {(u.line.modifiers ?? []).length > 0 && (
                  <small className="text-[var(--text-muted)]"> ({u.line.modifiers!.map((m) => m.name).join(", ")})</small>
                )}
              </span>
              <select
                className={selectClass}
                aria-label={u.line.name}
                value={assignment[u.uid] ?? 0}
                onChange={(e) => setAssignment((p) => ({ ...p, [u.uid]: Number(e.target.value) }))}
              >
                {Array.from({ length: guestCount }, (_, g) => (
                  <option key={g} value={g}>{t("orders.guestN", { n: String(g + 1) })}</option>
                ))}
              </select>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--text-muted)]">
          {groups.map((g, i) => (
            <span key={i} className="rounded-full border border-input px-2 py-0.5">
              {t("orders.guestN", { n: String(i + 1) })}:{" "}
              {formatMoney(g.reduce((s, l) => s + l.unitPrice * l.quantity, 0))}
            </span>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("orders.keep")}</Button>
          <Button disabled={nonEmpty < 2} onClick={() => onConfirm(groups)}>
            {t("orders.split")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
