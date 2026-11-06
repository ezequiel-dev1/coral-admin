"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Beef,
  Carrot,
  Check,
  CupSoda,
  Droplets,
  Egg,
  Fish,
  Flame,
  Leaf,
  Milk,
  Salad,
  Soup,
  Utensils,
  Wheat,
  type LucideIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { MenuIngredient } from "../lib/dynamodb";

/** True on touch-first devices (iPad, phones). Updates if the input mode changes. */
export function useIsTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setTouch(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setTouch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return touch;
}

/** Picks an icon from the ingredient name first, then its category. */
function iconFor(ing: MenuIngredient): LucideIcon {
  const name = ing.name.toLowerCase();
  if (name.includes("huevo")) return Egg;
  if (name.includes("caldo") || name.includes("fondo")) return Soup;
  if (name.includes("tortilla") || name.includes("tostada")) return Wheat;

  const cat = (ing.category || "").toLowerCase();
  if (cat.includes("marisco") || cat.includes("pescado")) return Fish;
  if (cat.includes("carne")) return Beef;
  if (cat.includes("chile")) return Flame;
  if (cat.includes("verdura") || cat.includes("fruta") || cat.includes("hierba")) return Salad;
  if (cat.includes("lácteo") || cat.includes("lacteo")) return Milk;
  if (cat.includes("harina")) return Wheat;
  if (cat.includes("especia")) return Leaf;
  if (cat.includes("salsa")) return Droplets;
  if (cat.includes("bebida")) return CupSoda;
  if (cat.includes("tortilla") || cat.includes("base")) return Utensils;
  return Carrot;
}

type Props = {
  ingredients: MenuIngredient[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Show the search box (used in the assign dialog). */
  searchable?: boolean;
  searchPlaceholder?: string;
  selectedLabel?: string;
  maxHeightClass?: string;
  /** Strike through ingredients that are out of stock (default true). */
  dimUnavailable?: boolean;
};

export function IngredientPicker({
  ingredients,
  selectedIds,
  onToggle,
  searchable = false,
  searchPlaceholder,
  selectedLabel,
  maxHeightClass = "max-h-[50vh]",
  dimUnavailable = true,
}: Props) {
  const touch = useIsTouchDevice();
  const [search, setSearch] = useState("");

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, MenuIngredient[]>();
    for (const ing of ingredients) {
      if (q && !ing.name.toLowerCase().includes(q)) continue;
      const cat = ing.category || "—";
      map.set(cat, [...(map.get(cat) ?? []), ing]);
    }
    return Array.from(map.entries());
  }, [ingredients, search]);

  return (
    <div className="grid gap-3">
      {searchable && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className={touch ? "h-11 text-base" : undefined}
        />
      )}

      <div className={`${maxHeightClass} overflow-y-auto rounded-lg border border-input p-3`}>
        {groups.map(([cat, list]) => (
          <div key={cat} className="mb-4 last:mb-0">
            <div
              className={`mb-2 font-semibold uppercase text-[var(--text-muted)] ${
                touch ? "text-sm" : "text-xs"
              }`}
            >
              {cat}
            </div>

            {touch ? (
              <div className="grid grid-cols-2 gap-2">
                {list.map((ing) => {
                  const checked = selectedIds.includes(ing.id);
                  const Icon = iconFor(ing);
                  return (
                    <button
                      key={ing.id}
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => onToggle(ing.id)}
                      className={`flex min-h-16 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left transition-colors active:scale-[0.98] ${
                        checked
                          ? "border-[var(--gold)] bg-[var(--gold)]/10"
                          : "border-input bg-transparent"
                      }`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface-muted)]">
                        <Icon size={22} aria-hidden />
                      </span>
                      <span
                        className={`flex-1 text-base leading-tight ${
                          !dimUnavailable || ing.available ? "" : "text-[var(--text-muted)] line-through"
                        }`}
                      >
                        {ing.name}
                      </span>
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-2 ${
                          checked
                            ? "border-[var(--gold)] bg-[var(--gold)] text-white"
                            : "border-input"
                        }`}
                        aria-hidden
                      >
                        {checked && <Check size={20} strokeWidth={3} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {list.map((ing) => (
                  <label key={ing.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(ing.id)}
                      onChange={() => onToggle(ing.id)}
                    />
                    <span className={!dimUnavailable || ing.available ? "" : "text-[var(--text-muted)] line-through"}>
                      {ing.name}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {selectedLabel && (
        <p className="text-xs text-[var(--text-muted)]">
          {selectedIds.length} {selectedLabel}
        </p>
      )}
    </div>
  );
}
