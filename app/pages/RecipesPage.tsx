"use client";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { CoralDataGrid, type ColumnDef } from "@/components/ui/data-grid";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../i18n/LanguageProvider";
import {
  createRecipe,
  deleteRecipe,
  fetchMenuIngredients,
  fetchMenuItems,
  fetchRecipes,
  updateRecipe,
  type MenuIngredient,
  type MenuItem,
  type Recipe,
  type RecipeInput,
} from "../lib/dynamodb";
const blank: RecipeInput = { name: "", category: "main", lines: [] };
export function RecipesPage() {
  const { t } = useTranslation();
  const [recipes, setRecipes] = useState<Recipe[]>([]),
    [ingredients, setIngredients] = useState<MenuIngredient[]>([]),
    [items, setItems] = useState<MenuItem[]>([]),
    [form, setForm] = useState<RecipeInput>(blank),
    [editing, setEditing] = useState<Recipe | null>(null),
    [open, setOpen] = useState(false),
    [category, setCategory] = useState<Recipe["category"]>("main");
  const load = async () => {
    const [r, i, m] = await Promise.all([
      fetchRecipes(),
      fetchMenuIngredients(),
      fetchMenuItems(),
    ]);
    setRecipes(r);
    setIngredients(i);
    setItems(m);
  };
  useEffect(() => {
    load();
  }, []);
  const toggleIngredient = (i: MenuIngredient) =>
    setForm((f) => ({
      ...f,
      lines: f.lines.some((x) => x.ingredientId === i.id)
        ? f.lines.filter((x) => x.ingredientId !== i.id)
        : [
            ...f.lines,
            {
              ingredientId: i.id,
              ingredientName: i.name,
              quantity: "",
              unit: "",
            },
          ],
    }));
  const updateIngredientLine = (ingredientId: string, field: "quantity" | "unit", value: string) =>
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => line.ingredientId === ingredientId ? { ...line, [field]: value } : line),
    }));
  const toggleSupplement = (r: Recipe) =>
    setForm((f) => ({
      ...f,
      supplementRecipeIds: (f.supplementRecipeIds ?? []).includes(r.id)
        ? (f.supplementRecipeIds ?? []).filter((id) => id !== r.id)
        : [...(f.supplementRecipeIds ?? []), r.id],
    }));
  const edit = (r: Recipe) => {
    setEditing(r);
    setForm({ ...r, supplementRecipeIds: r.supplementRecipeIds ?? [] });
    setOpen(true);
  };
  const save = async () => {
    if (!form.name.trim()) return;
    editing ? await updateRecipe(editing.id, form) : await createRecipe(form);
    setOpen(false);
    setEditing(null);
    setForm(blank);
    load();
  };
  const cols = useMemo<ColumnDef<Recipe, unknown>[]>(
    () => [
      { accessorKey: "name", header: t("recipes.recipe") },
      {
        id: "menu",
        header: t("recipes.menuItem"),
        cell: ({ row }) =>
          items.find((i) => i.id === row.original.menuItemId)?.name ?? "—",
      },
      {
        id: "ingredients",
        header: t("recipes.ingredients"),
        cell: ({ row }) => row.original.lines.length,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => edit(row.original)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                await deleteRecipe(row.original.id);
                load();
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ),
      },
    ],
    [items, t],
  );
  const visible = recipes.filter((r) => r.category === category),
    supplements = recipes.filter(
      (r) => r.category === "supplement" && r.id !== editing?.id,
    );
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>{t("recipes.title")}</h1>
          <p className="page-subtitle">{t("recipes.subtitle")}</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setForm({ ...blank, category });
            setOpen(true);
          }}
        >
          {t("recipes.add")}
        </Button>
      </div>
      <div className="mb-3 flex gap-2">
        {(["main", "supplement"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (category === c
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-input text-[var(--text-muted)]")
            }
          >
            {t(`recipes.${c}`)}
          </button>
        ))}
      </div>
      <CoralDataGrid data={visible} columns={cols} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit recipe" : t("recipes.addTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>{t("recipes.recipe")}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label>{t("recipes.category")}</Label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as Recipe["category"],
                  })
                }
              >
                <option value="main">{t("recipes.main")}</option>
                <option value="supplement">{t("recipes.supplement")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label>{t("recipes.menuItem")}</Label>
              <select
                value={form.menuItemId ?? ""}
                onChange={(e) =>
                  setForm({ ...form, menuItemId: e.target.value || undefined })
                }
              >
                <option value="">{t("recipes.noLinkedMenuItem")}</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>
            {form.category === "main" && (
              <details open>
                <summary className="cursor-pointer font-medium">
                  {t("recipes.supplement")}
                </summary>
                <div className="mt-2 grid max-h-48 grid-cols-2 gap-2 overflow-y-auto rounded-md border p-3">
                  {supplements.map((r) => (
                    <label key={r.id}>
                      <input
                        type="checkbox"
                        checked={(form.supplementRecipeIds ?? []).includes(
                          r.id,
                        )}
                        onChange={() => toggleSupplement(r)}
                      />{" "}
                      {r.name}
                    </label>
                  ))}
                </div>
              </details>
            )}
            <details>
              <summary className="cursor-pointer font-medium">
                {t("recipes.ingredients")}
              </summary>
              <div className="mt-2 grid max-h-64 grid-cols-3 gap-2 overflow-y-auto rounded-md border p-3">
                {ingredients.map((i) => {
                  const line = form.lines.find((entry) => entry.ingredientId === i.id);
                  return <div key={i.id} className="flex items-center gap-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2"><input type="checkbox" checked={Boolean(line)} onChange={() => toggleIngredient(i)} /> <span className="truncate">{i.name}</span></label>
                    {line && <><Input className="h-8 w-20" aria-label={`${i.name} quantity`} value={line.quantity} onChange={(event) => updateIngredientLine(i.id, "quantity", event.target.value)} placeholder="Qty" /><Input className="h-8 w-16" aria-label={`${i.name} unit`} value={line.unit} onChange={(event) => updateIngredientLine(i.id, "unit", event.target.value)} placeholder="Unit" /></>}
                  </div>;
                })}
              </div>
            </details>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{t("recipes.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
