"use client";

import { useState, useEffect, useMemo, useRef } from "react";
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
import { CurrencyInput } from "@/components/ui/currency-input";
import { Plus, Pencil, Trash2, ImageOff, ImagePlus, Printer, FileText, Carrot, ClipboardPaste } from "lucide-react";
import {
  fetchMenuItems,
  fetchMenuIngredients,
  getUnavailableIngredients,
  MenuIngredient,
  createMenuItem,
  updateMenuItem,
  updateMenuItemIngredients,
  updateMenuItemImage,
  deleteMenuItem,
  MenuItem,
  MenuItemInput,
} from "../lib/dynamodb";
import { getObjectUrl, uploadMenuItemImage } from "../lib/receipts";
import { IngredientPicker, useIsTouchDevice } from "./IngredientPicker";
import { PrintableMenu } from "./PrintableMenu";
import { PrintableFlyer } from "./PrintableFlyer";
import { ModifierGroupsEditor, cleanModifierGroups } from "./ModifierGroupsEditor";

const emptyForm: MenuItemInput = {
  name: "",
  description: "",
  category: "",
  price: "",
  available: true,
  imageKey: "",
  notes: "",
  order: 0,
  ingredientIds: [],
  modifierGroups: [],
};

function MenuItemImage({
  imageKey,
  onPreview,
}: {
  imageKey: string;
  onPreview?: (url: string) => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!imageKey) return;
    let active = true;
    getObjectUrl(imageKey)
      .then((u) => {
        if (active) setUrl(u);
      })
      .catch((err) => console.error("Failed to load image:", err));
    return () => {
      active = false;
    };
  }, [imageKey]);

  if (!imageKey || !url) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-muted)]">
        <ImageOff size={16} />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onPreview?.(url)}
      className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      aria-label="View image full size"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="h-10 w-10 cursor-pointer rounded-md object-cover transition-transform hover:scale-105"
      />
    </button>
  );
}

export function MenuItemsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [ingredients, setIngredients] = useState<MenuIngredient[]>([]);
  const [loading, setLoading] = useState(true);

  // CRUD state
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<MenuItemInput>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Image picker state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");

  // Picture-only dialog state
  const [pictureItem, setPictureItem] = useState<MenuItem | null>(null);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState("");
  const [pictureError, setPictureError] = useState("");
  const [savingPicture, setSavingPicture] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement>(null);

  // Ingredient assignment dialog state
  const [ingredientItem, setIngredientItem] = useState<MenuItem | null>(null);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([]);
  const isTouch = useIsTouchDevice();
  const [savingIngredients, setSavingIngredients] = useState(false);

  // Full-size image preview state
  const [fullImageUrl, setFullImageUrl] = useState("");

  // Printable menu view
  const [showPrintable, setShowPrintable] = useState(false);

  // Printable flyer view
  const [showFlyer, setShowFlyer] = useState(false);

  useEffect(() => {
    loadItems();
  }, []);

  async function loadItems() {
    setLoading(true);
    try {
      const [data, ingredientData] = await Promise.all([
        fetchMenuItems(),
        fetchMenuIngredients(),
      ]);
      setItems(data);
      setIngredients(ingredientData);
    } catch (err) {
      console.error("Failed to fetch menu items:", err);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditingItem(null);
    setForm(emptyForm);
    setImageFile(null);
    setPreviewUrl("");
    setShowModal(true);
  }

  async function openEdit(item: MenuItem) {
    setEditingItem(item);
    setForm({
      name: item.name,
      description: item.description,
      category: item.category,
      price: item.price,
      available: item.available,
      imageKey: item.imageKey,
      notes: item.notes,
      order: item.order ?? 0,
      ingredientIds: item.ingredientIds ?? [],
      modifierGroups: item.modifierGroups ?? [],
    });
    setImageFile(null);
    setPreviewUrl("");
    setShowModal(true);
    if (item.imageKey) {
      try {
        setPreviewUrl(await getObjectUrl(item.imageKey));
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    }
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    try {
      let imageKey = form.imageKey;
      if (imageFile) {
        imageKey = await uploadMenuItemImage(imageFile);
      }
      const payload: MenuItemInput = {
        ...form,
        imageKey,
        modifierGroups: cleanModifierGroups(form.modifierGroups ?? []),
      };
      if (editingItem) {
        await updateMenuItem(editingItem.id, payload);
      } else {
        await createMenuItem(payload);
      }
      setShowModal(false);
      await loadItems();
    } catch (err) {
      console.error("Failed to save menu item:", err);
    } finally {
      setSaving(false);
    }
  }

  async function openPicture(item: MenuItem) {
    setPictureItem(item);
    setPictureFile(null);
    setPicturePreview("");
    setPictureError("");
    if (item.imageKey) {
      try {
        setPicturePreview(await getObjectUrl(item.imageKey));
      } catch (err) {
        console.error("Failed to load image:", err);
      }
    }
  }

  function closePicture() {
    setPictureItem(null);
    setPictureFile(null);
    setPicturePreview("");
    setPictureError("");
  }

  function selectPictureFile(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPictureError(t("menuItems.invalidImage"));
      return;
    }
    setPictureError("");
    setPictureFile(file);
    setPicturePreview((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function selectPastedImage(blob: Blob) {
    const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
    selectPictureFile(new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type }));
  }

  // Button-based paste (works on mobile where Ctrl/Cmd+V isn't available)
  async function handlePasteButton() {
    setPictureError("");
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const clipItem of clipboardItems) {
        const type = clipItem.types.find((tp) => tp.startsWith("image/"));
        if (type) {
          selectPastedImage(await clipItem.getType(type));
          return;
        }
      }
      setPictureError(t("menuItems.noClipboardImage"));
    } catch (err) {
      console.error("Failed to read clipboard:", err);
      setPictureError(t("menuItems.pasteFailed"));
    }
  }

  // Paste an image from the clipboard while the picture dialog is open
  useEffect(() => {
    if (!pictureItem) return;
    function onPaste(e: ClipboardEvent) {
      const file = Array.from(e.clipboardData?.items ?? [])
        .find((i) => i.kind === "file" && i.type.startsWith("image/"))
        ?.getAsFile();
      if (!file) return;
      e.preventDefault();
      selectPastedImage(file);
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pictureItem]);

  async function handleSavePicture() {
    if (!pictureItem || !pictureFile) return;
    setSavingPicture(true);
    setPictureError("");
    try {
      const key = await uploadMenuItemImage(pictureFile);
      await updateMenuItemImage(pictureItem.id, key);
      closePicture();
      await loadItems();
    } catch (err) {
      console.error("Failed to save menu item picture:", err);
      setPictureError(t("menuItems.saveFailed"));
    } finally {
      setSavingPicture(false);
    }
  }

  function openIngredients(item: MenuItem) {
    setIngredientItem(item);
    setSelectedIngredientIds(item.ingredientIds ?? []);
  }

  function toggleIngredient(id: string) {
    setSelectedIngredientIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  async function handleSaveIngredients() {
    if (!ingredientItem) return;
    setSavingIngredients(true);
    try {
      await updateMenuItemIngredients(ingredientItem.id, selectedIngredientIds);
      setIngredientItem(null);
      await loadItems();
    } catch (err) {
      console.error("Failed to save menu item ingredients:", err);
    } finally {
      setSavingIngredients(false);
    }
  }

  async function handleDelete(item: MenuItem) {
    if (!confirm(t("menuItems.confirmDelete"))) return;
    try {
      await deleteMenuItem(item.id);
      await loadItems();
    } catch (err) {
      console.error("Failed to delete menu item:", err);
    }
  }

  const columns: ColumnDef<MenuItem, unknown>[] = useMemo(() => {
    const cols: ColumnDef<MenuItem, unknown>[] = [
      {
        accessorKey: "imageKey",
        header: t("menuItems.image"),
        size: 70,
        cell: ({ getValue }) => (
          <MenuItemImage imageKey={(getValue() as string) || ""} onPreview={setFullImageUrl} />
        ),
      },
      {
        accessorKey: "order",
        header: t("menuItems.order"),
        size: 90,
        cell: ({ getValue }) => <span>{(getValue() as number) ?? 0}</span>,
      },
      { accessorKey: "name", header: t("menuItems.name"), size: 180 },
      { accessorKey: "category", header: t("menuItems.category"), size: 150 },
      { accessorKey: "description", header: t("menuItems.description"), size: 280 },
      {
        accessorKey: "price",
        header: t("menuItems.price"),
        size: 120,
        cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span>,
      },
      {
        accessorKey: "available",
        header: t("menuItems.available"),
        size: 120,
        cell: ({ row }) => {
          if (!row.original.available) {
            return <Badge variant="outline">{t("menuItems.availableNo")}</Badge>;
          }
          const missing = getUnavailableIngredients(row.original, ingredients);
          if (missing.length > 0) {
            return (
              <Badge variant="outline" title={missing.map((m) => m.name).join(", ")}>
                {t("menuItems.missingIngredients")}
              </Badge>
            );
          }
          return <Badge variant="default">{t("menuItems.availableYes")}</Badge>;
        },
      },
      {
        id: "ingredients",
        header: t("menuItems.ingredients"),
        size: 220,
        cell: ({ row }) => {
          const byId = new Map(ingredients.map((i) => [i.id, i]));
          const names = (row.original.ingredientIds ?? [])
            .map((id) => byId.get(id)?.name)
            .filter(Boolean);
          return <span>{names.join(", ")}</span>;
        },
      },
      { accessorKey: "notes", header: t("menuItems.notes"), size: 200 },
    ];

    if (isAdmin) {
      cols.push({
        id: "actions",
        header: "",
        size: 150,
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openPicture(row.original)}
              aria-label={t("menuItems.changeImage")}
              title={t("menuItems.changeImage")}
            >
              <ImagePlus />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => openIngredients(row.original)}
              aria-label={t("menuItems.assignIngredients")}
              title={t("menuItems.assignIngredients")}
            >
              <Carrot />
            </Button>
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
  }, [t, isAdmin, ingredients]);

  return (
    <div className="page">
      <div className="page-header flex items-center justify-between">
        <div>
          <h1>{t("menuItems.title")}</h1>
          <p className="page-subtitle">{t("menuItems.subtitle")} — {items.length} {t("menuItems.records").toLowerCase()}</p>
        </div>
        <div className="flex flex-row items-center gap-2" style={{ flexDirection: "row" }}>
          <Button variant="outline" onClick={() => setShowPrintable(true)}>
            <Printer data-icon="inline-start" />
            {t("menuItems.printMenu")}
          </Button>
          <Button variant="outline" onClick={() => setShowFlyer(true)}>
            <FileText data-icon="inline-start" />
            {t("menuItems.printFlyer")}
          </Button>
          {isAdmin && (
            <Button onClick={openCreate}>
              <Plus data-icon="inline-start" />
              {t("menuItems.addItem")}
            </Button>
          )}
        </div>
      </div>

      <CoralDataGrid
        data={items}
        columns={columns}
        loading={loading}
        height={700}
        defaultPageSize={100}
        defaultSorting={[{ id: "order", desc: false }]}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? t("menuItems.editItem") : t("menuItems.addItem")}</DialogTitle>
          </DialogHeader>
          <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 pr-1">
            <div className="grid gap-2">
              <Label>{t("menuItems.image")}</Label>
              <div className="flex items-center gap-3">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrl} alt="" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[var(--surface-muted)] text-[var(--text-muted)]">
                    <ImageOff size={20} />
                  </div>
                )}
                <Input type="file" accept="image/*" onChange={handleImageChange} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{t("menuItems.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("menuItems.namePlaceholder")} />
              </div>
              <div className="grid gap-2">
                <Label>{t("menuItems.category")}</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder={t("menuItems.categoryPlaceholder")} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("menuItems.description")}</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("menuItems.descriptionPlaceholder")} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>{t("menuItems.price")}</Label>
                <CurrencyInput value={form.price} onChange={(v) => setForm({ ...form, price: v })} placeholder="0" />
              </div>
              <div className="grid gap-2">
                <Label>{t("menuItems.order")}</Label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: e.target.value === "" ? 0 : Number(e.target.value) })}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-2">
                <Label>{t("menuItems.available")}</Label>
                <select
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  value={form.available ? "yes" : "no"}
                  onChange={(e) => setForm({ ...form, available: e.target.value === "yes" })}
                >
                  <option value="yes">{t("menuItems.availableYes")}</option>
                  <option value="no">{t("menuItems.availableNo")}</option>
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>{t("menuItems.ingredients")}</Label>
              {ingredients.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t("menuItems.noIngredients")}</p>
              ) : (
                <IngredientPicker
                  ingredients={ingredients}
                  selectedIds={form.ingredientIds ?? []}
                  maxHeightClass="max-h-48"
                  onToggle={(id) => {
                    const current = form.ingredientIds ?? [];
                    setForm({
                      ...form,
                      ingredientIds: current.includes(id)
                        ? current.filter((x) => x !== id)
                        : [...current, id],
                    });
                  }}
                />
              )}
            </div>
            <div className="grid gap-2">
              <Label>{t("menuItems.variants")}</Label>
              <p className="text-xs text-[var(--text-muted)]">{t("menuItems.variantsHint")}</p>
              <ModifierGroupsEditor
                groups={form.modifierGroups ?? []}
                onChange={(modifierGroups) => setForm({ ...form, modifierGroups })}
                t={t}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("menuItems.notes")}</Label>
              <textarea
                className="w-full min-h-[80px] rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-y"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowModal(false)}>{t("menuItems.cancel")}</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? (editingItem ? t("menuItems.saving") : t("menuItems.creating"))
                : t("menuItems.save")
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / change picture dialog */}
      <Dialog open={!!pictureItem} onOpenChange={(open) => !open && closePicture()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {t("menuItems.imageDialogTitle")}
              {pictureItem ? `: ${pictureItem.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div
              tabIndex={0}
              className="flex min-h-48 items-center justify-center rounded-lg border-2 border-dashed border-input p-2 text-center text-sm text-[var(--text-muted)] outline-none focus-visible:border-ring"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                selectPictureFile(e.dataTransfer.files?.[0]);
              }}
            >
              {picturePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={picturePreview} alt="" className="max-h-64 rounded-md object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-2">
                  <ImageOff size={28} />
                  {t("menuItems.pasteZone")}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--text-muted)]">{t("menuItems.pasteHint")}</p>
            <input
              ref={pictureInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                selectPictureFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => pictureInputRef.current?.click()}>
              <ImagePlus data-icon="inline-start" />
              {t("menuItems.chooseImage")}
            </Button>
            <Button variant="outline" onClick={handlePasteButton}>
              <ClipboardPaste data-icon="inline-start" />
              {t("menuItems.pasteImage")}
            </Button>
            {pictureError && <p role="alert" className="text-sm text-red-600">{pictureError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closePicture}>{t("menuItems.cancel")}</Button>
            <Button onClick={handleSavePicture} disabled={!pictureFile || savingPicture}>
              {savingPicture ? t("menuItems.saving") : t("menuItems.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign ingredients dialog */}
      <Dialog open={!!ingredientItem} onOpenChange={(open) => !open && setIngredientItem(null)}>
        <DialogContent className={isTouch ? "sm:max-w-2xl" : "sm:max-w-lg"}>
          <DialogHeader>
            <DialogTitle>
              {t("menuItems.assignIngredients")}
              {ingredientItem ? `: ${ingredientItem.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {ingredients.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">{t("menuItems.noIngredients")}</p>
          ) : (
            <IngredientPicker
              ingredients={ingredients}
              selectedIds={selectedIngredientIds}
              onToggle={toggleIngredient}
              searchable
              searchPlaceholder={t("menuItems.searchIngredients")}
              selectedLabel={t("menuItems.selected")}
              maxHeightClass={isTouch ? "max-h-[60vh]" : "max-h-[50vh]"}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIngredientItem(null)}>{t("menuItems.cancel")}</Button>
            <Button onClick={handleSaveIngredients} disabled={savingIngredients}>
              {savingIngredients ? t("menuItems.saving") : t("menuItems.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full-size image preview */}
      <Dialog open={!!fullImageUrl} onOpenChange={(open) => !open && setFullImageUrl("")}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("menuItems.image")}</DialogTitle>
          </DialogHeader>
          {fullImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fullImageUrl}
              alt=""
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
          )}
        </DialogContent>
      </Dialog>

      {showPrintable && (
        <PrintableMenu items={items} onClose={() => setShowPrintable(false)} />
      )}

      {showFlyer && (
        <PrintableFlyer items={items} onClose={() => setShowFlyer(false)} />
      )}
    </div>
  );
}
