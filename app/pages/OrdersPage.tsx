"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  Loader2,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Split,
  Merge,
  XCircle,
} from "lucide-react";
import {
  fetchMenuItems,
  fetchMenuIngredients,
  fetchOrders,
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
  mergeOrders,
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
import { SEATING_SPOTS, SeatingChart } from "./SeatingChart";

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

function statusVariant(status: Order["status"]): "default" | "secondary" | "outline" | "destructive" {
  if (status === "open") return "default";
  if (status === "held") return "secondary";
  if (status === "cancelled") return "destructive";
  return "outline";
}

function statusLabel(t: T, status: Order["status"]): string {
  return t(`orders.status.${status}`);
}

function seatCountFor(tableLabel: string): number {
  return SEATING_SPOTS.find((s) => s.id === tableLabel)?.seats ?? 0;
}

// ===========================================================================
// Page: order list + editor switch
// ===========================================================================

type Filter = "active" | "held" | "paid" | "cancelled" | "all";

export function OrdersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const server = user?.name || user?.email || "";

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<Order | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showMerge, setShowMerge] = useState(false);
  const [busy, setBusy] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    return orders.filter((o) => {
      if (filter === "all") return true;
      if (filter === "active") return o.status === "open";
      return o.status === filter;
    });
  }, [orders, filter]);

  const counts = useMemo(() => {
    const c = { active: 0, held: 0, paid: 0, cancelled: 0, all: orders.length };
    for (const o of orders) {
      if (o.status === "open") c.active++;
      else if (o.status === "held") c.held++;
      else if (o.status === "paid") c.paid++;
      else if (o.status === "cancelled") c.cancelled++;
    }
    return c;
  }, [orders]);

  const occupiedLabels = useMemo(
    () => new Set(orders.filter((o) => o.status === "open").map((o) => o.tableLabel)),
    [orders]
  );

  function startNew() {
    setEditing(blankOrder("dine-in", "", server));
    setEditingIsNew(true);
  }

  function openOrder(o: Order) {
    setEditing({ ...o, items: normalizeLines(o.items) });
    setEditingIsNew(false);
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedOrders = orders
    .filter((o) => selected.has(o.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  async function handleMerge() {
    if (selectedOrders.length < 2) return;
    setBusy(true);
    try {
      await mergeOrders(selectedOrders[0], selectedOrders.slice(1));
      setSelected(new Set());
      setShowMerge(false);
      await load();
    } catch (err) {
      console.error("Merge failed:", err);
      setError(t("orders.actionError"));
      setShowMerge(false);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <OrderEditor
        key={editing.id}
        initial={editing}
        isNew={editingIsNew}
        menuItems={menuItems}
        ingredients={ingredients}
        occupiedLabels={occupiedLabels}
        t={t}
        onChanged={load}
        onClose={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  const filters: Filter[] = ["active", "held", "paid", "cancelled", "all"];

  return (
    <>
      <section className="hero-row">
        <div>
          <p className="eyebrow">{t("nav.overview")}</p>
          <h1>{t("orders.title")}</h1>
          <p className="subhead">{t("orders.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          {selectedOrders.length >= 2 && (
            <Button variant="outline" onClick={() => setShowMerge(true)}>
              <Merge size={16} /> {t("orders.merge")} ({selectedOrders.length})
            </Button>
          )}
          <Button onClick={startNew}>
            <Plus size={16} /> {t("orders.newOrder")}
          </Button>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
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

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 className="animate-spin" size={16} /> {t("auth.loading")}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-input bg-[var(--surface-muted)] px-3 py-6 text-center text-sm text-[var(--text-muted)]">
          {t("orders.empty")}
        </p>
      ) : (
        <div className="grid gap-2">
          {visible.map((o) => {
            const mergeable = o.status === "open" || o.status === "held";
            const count = o.items.reduce((s, l) => s + l.quantity, 0);
            return (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-xl border border-input bg-[var(--surface)] p-3"
              >
                {mergeable ? (
                  <input
                    type="checkbox"
                    aria-label={t("orders.selectForMerge")}
                    checked={selected.has(o.id)}
                    onChange={() => toggleSelected(o.id)}
                  />
                ) : (
                  <span className="w-[13px]" />
                )}
                <button
                  className="flex flex-1 items-center gap-3 text-left"
                  onClick={() => openOrder(o)}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">
                      {o.serviceType === "takeout"
                        ? `${t("orders.takeout")}${o.customerName ? ` · ${o.customerName}` : ""}`
                        : `${t("orders.table")} ${o.tableLabel || "—"}`}
                      {o.splitLabel ? ` · ${o.splitLabel}` : ""}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {count} {t("orders.itemsLabel")} · {o.server || "—"} ·{" "}
                      {new Date(o.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Badge variant={statusVariant(o.status)}>{statusLabel(t, o.status)}</Badge>
                  <b className="w-28 text-right">{formatMoney(o.total)}</b>
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={showMerge} onOpenChange={setShowMerge}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("orders.mergeTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">
            {t("orders.mergeBody", {
              n: String(selectedOrders.length),
              target: selectedOrders[0]
                ? selectedOrders[0].serviceType === "takeout"
                  ? t("orders.takeout")
                  : `${t("orders.table")} ${selectedOrders[0].tableLabel}`
                : "",
            })}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMerge(false)}>{t("orders.keep")}</Button>
            <Button onClick={handleMerge} disabled={busy}>
              {busy && <Loader2 className="animate-spin" size={14} />} {t("orders.merge")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ===========================================================================
// Editor
// ===========================================================================

type ReasonDialog = { kind: "void"; lineId: string } | { kind: "cancel" } | null;

function OrderEditor({
  initial,
  isNew,
  menuItems,
  ingredients,
  occupiedLabels,
  t,
  onChanged,
  onClose,
}: {
  initial: Order;
  isNew: boolean;
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

  async function persist(): Promise<Order | null> {
    const problem = validate();
    if (problem) {
      setMessage({ kind: "error", text: problem });
      return null;
    }
    const toSave = withTotals(draft);
    await saveOrder(toSave);
    setDraft(toSave);
    setPersisted(true);
    setDirty(false);
    onChanged();
    return toSave;
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

  const handleSave = () => run(async () => void (await persist()), t("orders.saved"));

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
      setDraft({ ...draft, status: "cancelled", cancelReason: text });
      onChanged();
    }, t("orders.cancelled"));
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
                ? `${t("orders.table")} ${draft.tableLabel}`
                : t("orders.newOrder")}
            {draft.splitLabel ? ` · ${draft.splitLabel}` : ""}
          </h1>
          <p className="subhead">
            <Badge variant={statusVariant(draft.status)}>{statusLabel(t, draft.status)}</Badge>
            {draft.status === "cancelled" && draft.cancelReason ? ` ${draft.cancelReason}` : ""}
          </p>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* ------------------------- left: setup + menu ------------------------- */}
        <div className="grid content-start gap-4">
          <article className="rounded-xl border border-input bg-[var(--surface)] p-4">
            <div className="mb-3 grid gap-2">
              <Label>{t("orders.serviceType")}</Label>
              <div className="flex gap-2" role="group" aria-label={t("orders.serviceType")}>
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
              <div className="grid gap-3">
                <div className="flex items-center justify-between">
                  <Label className="mb-0">{t("orders.table")}</Label>
                  <span className="text-xs text-[var(--text-muted)]">
                    {draft.tableLabel ? `${t("orders.table")} ${draft.tableLabel}` : t("orders.pickTable")}
                  </span>
                </div>
                <div className={readOnly ? "pointer-events-none opacity-60" : ""}>
                  <SeatingChart
                    selected={draft.tableLabel || null}
                    occupied={(id) => occupiedLabels.has(id) && id !== initial.tableLabel}
                    onSelect={(id) => update({ tableLabel: id, seat: undefined })}
                    seatsLabel={t("orders.seats")}
                  />
                </div>
                {seats > 0 && (
                  <div className="grid gap-1">
                    <Label>{t("orders.seat")}</Label>
                    <select
                      className={selectClass}
                      value={draft.seat ?? ""}
                      disabled={readOnly}
                      onChange={(e) => update({ seat: e.target.value ? Number(e.target.value) : undefined })}
                    >
                      <option value="">{t("orders.noSeat")}</option>
                      {Array.from({ length: seats }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {t("orders.seat")} {i + 1}
                        </option>
                      ))}
                    </select>
                    <small className="text-xs text-[var(--text-muted)]">{t("orders.seatHint")}</small>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-1">
                <Label>{t("orders.customer")}</Label>
                <Input
                  value={draft.customerName ?? ""}
                  disabled={readOnly}
                  onChange={(e) => update({ customerName: e.target.value })}
                />
              </div>
            )}
          </article>

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
                      onClick={() => setItemDialog({ item })}
                      className="flex flex-col items-start gap-1 rounded-xl border border-input bg-[var(--surface)] p-3 text-left transition-all hover:border-primary hover:shadow-sm focus-visible:ring-3 focus-visible:ring-ring/50"
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
            </article>
          )}
        </div>

        {/* ------------------------- right: order panel ------------------------- */}
        <aside className="grid content-start gap-3 rounded-xl border border-input bg-[var(--surface)] p-4 lg:sticky lg:top-4 lg:self-start">
          <h2 className="text-base font-semibold">{t("orders.orderPanel")}</h2>

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
            <div className="flex justify-between"><dt>{t("orders.tax")}</dt><dd>{formatMoney(totals.tax)}</dd></div>
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
          {readOnly ? (
            <div className="grid gap-2">
              <p className="text-xs text-[var(--text-muted)]">{t("orders.readOnlyNote")}</p>
              <Button onClick={handleReopen} disabled={busy || (draft.status === "paid" && draft.paymentMethod === "card")}>
                <RotateCcw size={14} /> {t("orders.reopen")}
              </Button>
              {draft.status === "paid" && draft.paymentMethod === "card" && (
                <p className="text-xs text-[var(--text-muted)]">{t("orders.cardNote")}</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={handleSave} disabled={busy} className="col-span-2">
                {busy ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} {t("orders.save")}
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
          defaultSeat={draft.seat}
          seatCount={seats}
          t={t}
          onClose={() => setItemDialog(null)}
          onConfirm={(line) => {
            upsertLine(line, itemDialog.line?.lineId);
            setItemDialog(null);
          }}
        />
      )}

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
