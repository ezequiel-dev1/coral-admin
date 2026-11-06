"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import type { ModifierGroup } from "../lib/dynamodb";

type T = (key: string, vars?: Record<string, string>) => string;

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop blank groups/options so empty rows never reach the database. */
export function cleanModifierGroups(groups: ModifierGroup[]): ModifierGroup[] {
  return groups
    .map((g) => ({
      ...g,
      name: g.name.trim(),
      options: g.options
        .map((o) => ({ ...o, name: o.name.trim(), price: Math.max(0, Number(o.price) || 0) }))
        .filter((o) => o.name),
    }))
    .filter((g) => g.name && g.options.length > 0);
}

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Edits the option groups (size, toppings, sides...) offered when this item is
 * added to an order. An item with no groups has no options.
 */
export function ModifierGroupsEditor({
  groups,
  onChange,
  t,
}: {
  groups: ModifierGroup[];
  onChange: (groups: ModifierGroup[]) => void;
  t: T;
}) {
  function patchGroup(id: string, patch: Partial<ModifierGroup>) {
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    onChange([
      ...groups,
      { id: uid("g"), name: "", type: "single", required: false, options: [{ id: uid("o"), name: "", price: 0 }] },
    ]);
  }

  return (
    <div className="grid gap-3">
      {groups.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">{t("menuItems.noVariants")}</p>
      )}

      {groups.map((g) => (
        <div key={g.id} className="grid gap-2 rounded-lg border border-input p-3">
          <div className="flex items-center gap-2">
            <Input
              value={g.name}
              onChange={(e) => patchGroup(g.id, { name: e.target.value })}
              placeholder={t("menuItems.groupNamePlaceholder")}
              aria-label={t("menuItems.groupName")}
            />
            <select
              className={selectClass}
              value={g.type}
              aria-label={t("menuItems.groupType")}
              onChange={(e) => patchGroup(g.id, { type: e.target.value as "single" | "multi" })}
            >
              <option value="single">{t("menuItems.chooseOne")}</option>
              <option value="multi">{t("menuItems.chooseAny")}</option>
            </select>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("menuItems.removeGroup")}
              onClick={() => onChange(groups.filter((x) => x.id !== g.id))}
            >
              <Trash2 size={14} />
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!g.required}
              onChange={(e) => patchGroup(g.id, { required: e.target.checked })}
            />
            {t("menuItems.requiredGroup")}
          </label>

          {g.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <Input
                value={o.name}
                placeholder={t("menuItems.optionNamePlaceholder")}
                aria-label={t("menuItems.optionName")}
                onChange={(e) =>
                  patchGroup(g.id, {
                    options: g.options.map((x) => (x.id === o.id ? { ...x, name: e.target.value } : x)),
                  })
                }
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                className="w-28"
                value={o.price}
                aria-label={t("menuItems.optionPrice")}
                onChange={(e) =>
                  patchGroup(g.id, {
                    options: g.options.map((x) =>
                      x.id === o.id ? { ...x, price: e.target.value === "" ? 0 : Number(e.target.value) } : x
                    ),
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("menuItems.removeOption")}
                onClick={() => patchGroup(g.id, { options: g.options.filter((x) => x.id !== o.id) })}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            className="w-fit"
            onClick={() =>
              patchGroup(g.id, { options: [...g.options, { id: uid("o"), name: "", price: 0 }] })
            }
          >
            <Plus size={14} /> {t("menuItems.addOption")}
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-fit" onClick={addGroup}>
        <Plus size={14} /> {t("menuItems.addGroup")}
      </Button>
    </div>
  );
}
