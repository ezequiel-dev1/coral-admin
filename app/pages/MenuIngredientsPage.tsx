"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "../i18n/LanguageProvider";
import { useIsAdmin } from "../hooks/useIsAdmin";
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
import { Plus, Pencil, Trash2, ListChecks } from "lucide-react";
import { IngredientPicker, useIsTouchDevice } from "./IngredientPicker";
import {
  fetchMenuIngredients,
  createMenuIngredient,
  updateMenuIngredient,
  deleteMenuIngredient,
  setMenuIngredientAvailability,
  MenuIngredient,
  MenuIngredientInput,
} from "../lib/dynamodb";

const emptyForm: MenuIngredientInput = {
  name: "",
  category: "",
  available: true,
  notes: "",
};

export function MenuIngredientsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [items, setItems] = useState<MenuIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuIngredient | null>(null);
  const [form, setForm] = useState<MenuIngredientInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Bulk availability dialog: checked = in stock
  const isTouch = useIsTouchDevice();
  const [showAvailability, setShowAvailability] = useState(false);
  const [inStockIds, setInStockIds] = useState<string[]>([]);
  const [savingAvailability, setSavingAvailability] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  function openAvailability() {
    setInStockIds(items.filter((i) => i.available).map((i) => i.id));
    setShowAvailability(true);
  }

  function toggleInStock(id: string) {
    setInStockIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function handleSaveAvailability() {
    // Only write the ingredients whose availability actually changed.
    const changed = items.filter((i) => i.available !== inStockIds.includes(i.id));
    setSavingAvailability(true);
    try {
      await Promise.all(
        changed.map((i) => setMenuIngredientAvailability(i.id, inStockIds.includes(i.id)))
      );
      setShowAvailability(false);
      await loadItems();
    } catch (err) {
      console.error("Failed to save ingredient availability:", err);
    } finally {
      setSavingAvailability(false);
    }
  }

  async function loadItems() {
    setLoading(true);
    try {
      setItems(await fetchMenuIngredients());
    } catch (err) {
      console.error("Failed to fetch menu ingredients:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingItem(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(item: MenuIngredient) {
    setEditingItem(item);
    setForm({
      name: item.name,
      category: item.category,
      available: item.available,
      notes: item.notes,
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload: MenuIngredientInput = { ...form, name: form.name.trim() };
      if (editingItem) {
        await updateMenuIngredient(editingItem.id, payload);
      } else {
        await createMenuIngredient(payload);
      }
      setShowModal(false);
      await loadItems();
    } catch (err) {
      console.error("Failed to save menu ingredient:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: MenuIngredient) {
    if (!confirm(t("menuIngredients.confirmDelete"))) return;
    try {
      await deleteMenuIngredient(item.id);
      await loadItems();
    } catch (err) {
      console.error("Failed to delete menu ingredient:", err);
    }
  }

  const columns: ColumnDef<MenuIngredient, unknown>[] = useMemo(() => {
    const cols: ColumnDef<MenuIngredient, unknown>[] = [
      { accessorKey: "name", header: t("menuIngredients.name"), size: 220 },
      { accessorKey: "category", header: t("menuIngredients.category"), size: 160 },
      {
        accessorKey: "available",
        header: t("menuIngredients.available"),
        size: 140,
        cell: ({ getValue }) =>
          getValue() ? (
            <Badge variant="default">{t("menuIngredients.availableYes")}</Badge>
          ) : (
            <Badge variant="outline">{t("menuIngredients.availableNo")}</Badge>
          ),
      },
      { accessorKey: "notes", header: t("menuIngredients.notes"), size: 280 },
    ];

    if (isAdmin) {
      cols.push({
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
      });
    }

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, isAdmin]);

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("menuIngredients.title")}</h1>
          <p className="page-subtitle">
            {t("menuIngredients.subtitle")} — {items.length} {t("menuIngredients.records").toLowerCase()}
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-row items-center gap-2" style={{ flexDirection: "row" }}>
            <Button variant="outline" onClick={openAvailability}>
              <ListChecks data-icon="inline-start" />
              {t("menuIngredients.manageAvailability")}
            </Button>
            <Button onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("menuIngredients.addItem")}
            </Button>
          </div>
        )}
      </div>

      <CoralDataGrid
        data={items}
        columns={columns}
        loading={loading}
        height={700}
        defaultPageSize={100}
        defaultSorting={[{ id: "name", desc: false }]}
      />

      {/* Bulk availability dialog */}
      <Dialog open={showAvailability} onOpenChange={setShowAvailability}>
        <DialogContent className={isTouch ? "sm:max-w-2xl" : "sm:max-w-lg"}>
          <DialogHeader>
            <DialogTitle>{t("menuIngredients.availabilityTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--text-muted)]">{t("menuIngredients.availabilityHint")}</p>
          <IngredientPicker
            ingredients={items}
            selectedIds={inStockIds}
            onToggle={toggleInStock}
            searchable
            searchPlaceholder={t("menuIngredients.search")}
            selectedLabel={t("menuIngredients.inStockCount")}
            maxHeightClass={isTouch ? "max-h-[60vh]" : "max-h-[50vh]"}
            dimUnavailable={false}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAvailability(false)}>
              {t("menuIngredients.cancel")}
            </Button>
            <Button onClick={handleSaveAvailability} disabled={savingAvailability}>
              {savingAvailability ? t("menuIngredients.saving") : t("menuIngredients.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? t("menuIngredients.editItem") : t("menuIngredients.addItem")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("menuIngredients.name")}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={t("menuIngredients.namePlaceholder")}
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("menuIngredients.category")}</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder={t("menuIngredients.categoryPlaceholder")}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("menuIngredients.available")}</Label>
              <select
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.available ? "yes" : "no"}
                onChange={(e) => setForm({ ...form, available: e.target.value === "yes" })}
              >
                <option value="yes">{t("menuIngredients.availableYes")}</option>
                <option value="no">{t("menuIngredients.availableNo")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{t("menuIngredients.notes")}</Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>
              {t("menuIngredients.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving
                ? editingItem
                  ? t("menuIngredients.saving")
                  : t("menuIngredients.creating")
                : t("menuIngredients.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
