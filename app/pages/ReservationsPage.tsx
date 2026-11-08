"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { CoralDataGrid, ColumnDef } from "@/components/ui/data-grid";
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
import { SeatingChart } from "./SeatingChart";
import { tableName } from "../lib/tableName";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  fetchReservations,
  createReservation,
  updateReservation,
  deleteReservation,
  Reservation,
  ReservationInput,
  ReservationStatus,
} from "../lib/dynamodb";

const STATUSES: ReservationStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no-show",
];

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function emptyForm(): ReservationInput {
  return {
    guestName: "",
    phone: "",
    partySize: 2,
    date: todayStr(),
    time: "19:00",
    tableLabel: "",
    status: "confirmed",
    notes: "",
  };
}

function statusVariant(s: ReservationStatus) {
  switch (s) {
    case "confirmed":
    case "seated":
      return "default" as const;
    case "cancelled":
    case "no-show":
      return "outline" as const;
    default:
      return "secondary" as const;
  }
}

/** Reservations this close (minutes) on the same table are treated as a clash. */
const SLOT_MINUTES = 120;
const ACTIVE: ReservationStatus[] = ["pending", "confirmed", "seated"];

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReservationsPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"upcoming" | "today" | "all">("upcoming");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [form, setForm] = useState<ReservationInput>(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setItems(await fetchReservations());
    } catch (err) {
      console.error("Failed to fetch reservations:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setShowModal(true);
  }

  function openEdit(r: Reservation) {
    setEditing(r);
    setForm({
      guestName: r.guestName,
      phone: r.phone,
      partySize: r.partySize,
      date: r.date,
      time: r.time,
      tableLabel: r.tableLabel,
      status: r.status,
      notes: r.notes,
    });
    setShowModal(true);
  }

  /** Tables already booked around the chosen date/time (excluding the one being edited). */
  const bookedTables = useMemo(() => {
    const set = new Set<string>();
    for (const r of items) {
      if (r.id === editing?.id || !r.tableLabel || r.date !== form.date) continue;
      if (!ACTIVE.includes(r.status)) continue;
      if (Math.abs(toMinutes(r.time) - toMinutes(form.time)) < SLOT_MINUTES) set.add(r.tableLabel);
    }
    return set;
  }, [items, editing, form.date, form.time]);

  const canSave =
    form.guestName.trim() !== "" && form.date !== "" && form.time !== "" && form.partySize >= 1;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: ReservationInput = {
        ...form,
        guestName: form.guestName.trim(),
        phone: form.phone.trim(),
        tableLabel: form.tableLabel.trim(),
      };
      if (editing) await updateReservation(editing.id, payload);
      else await createReservation(payload);
      setShowModal(false);
      await load();
    } catch (err) {
      console.error("Failed to save reservation:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(r: Reservation) {
    if (!confirm(t("reservations.confirmDelete"))) return;
    try {
      await deleteReservation(r.id);
      await load();
    } catch (err) {
      console.error("Failed to delete reservation:", err);
    }
  }

  const visible = useMemo(() => {
    const today = todayStr();
    if (filter === "today") return items.filter((r) => r.date === today);
    if (filter === "upcoming") return items.filter((r) => r.date >= today);
    return items;
  }, [items, filter]);

  const columns: ColumnDef<Reservation, unknown>[] = useMemo(
    () => [
      { accessorKey: "date", header: t("reservations.date"), size: 120 },
      { accessorKey: "time", header: t("reservations.time"), size: 90 },
      { accessorKey: "guestName", header: t("reservations.guestName"), size: 200 },
      { accessorKey: "partySize", header: t("reservations.partySize"), size: 100 },
      { accessorKey: "phone", header: t("reservations.phone"), size: 150 },
      {
        accessorKey: "tableLabel",
        header: t("reservations.table"),
        size: 110,
        cell: ({ getValue }) => tableName(t, (getValue() as string) || ""),
      },
      {
        accessorKey: "status",
        header: t("reservations.status"),
        size: 130,
        cell: ({ getValue }) => {
          const s = getValue() as ReservationStatus;
          return <Badge variant={statusVariant(s)}>{t(`reservations.status_${s}`)}</Badge>;
        },
      },
      { accessorKey: "notes", header: t("reservations.notes"), size: 240 },
      {
        id: "actions",
        header: "",
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button variant="ghost" size="icon-sm" onClick={() => openEdit(row.original)} aria-label="Edit">
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(row.original)} aria-label="Delete">
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t]
  );

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("reservations.title")}</h1>
          <p className="page-subtitle">
            {t("reservations.subtitle")} — {visible.length} {t("reservations.records").toLowerCase()}
          </p>
        </div>
        <div className="flex flex-row items-center gap-2" style={{ flexDirection: "row" }}>
          <select
            className={selectClass}
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            aria-label={t("reservations.filter")}
          >
            <option value="upcoming">{t("reservations.filterUpcoming")}</option>
            <option value="today">{t("reservations.filterToday")}</option>
            <option value="all">{t("reservations.filterAll")}</option>
          </select>
          <Button onClick={openCreate}>
            <Plus data-icon="inline-start" />
            {t("reservations.addItem")}
          </Button>
        </div>
      </div>

      <CoralDataGrid
        data={visible}
        columns={columns}
        loading={loading}
        height={700}
        defaultPageSize={100}
        defaultSorting={[{ id: "date", desc: false }]}
      />

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? t("reservations.editItem") : t("reservations.addItem")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("reservations.guestName")}</Label>
                <Input
                  value={form.guestName}
                  onChange={(e) => setForm({ ...form, guestName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("reservations.phone")}</Label>
                <Input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>{t("reservations.date")}</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("reservations.time")}</Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("reservations.partySize")}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.partySize}
                  onChange={(e) =>
                    setForm({ ...form, partySize: Math.max(1, parseInt(e.target.value, 10) || 1) })
                  }
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("reservations.status")}</Label>
              <select
                className={selectClass}
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as ReservationStatus })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`reservations.status_${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3">
              <div className="flex items-center justify-between">
                <Label className="mb-0">{t("reservations.table")}</Label>
                <span className="text-xs text-[var(--text-muted)]">
                  {form.tableLabel ? tableName(t, form.tableLabel) : t("reservations.pickTable")}
                </span>
              </div>
              <SeatingChart
                selected={form.tableLabel || null}
                occupied={(id) => bookedTables.has(id)}
                onSelect={(id) => setForm({ ...form, tableLabel: form.tableLabel === id ? "" : id })}
                seatsLabel={t("reservations.seats")}
              />
              {form.tableLabel && bookedTables.has(form.tableLabel) && (
                <p className="text-xs text-[#E48664]">{t("reservations.tableTaken")}</p>
              )}
            </div>
            <div className="grid gap-2">
              <Label>{t("reservations.notes")}</Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t("reservations.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !canSave}>
              {saving ? t("reservations.saving") : t("reservations.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
