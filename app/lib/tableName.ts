/**
 * Display name for a stored table id. Ids ("T1", "BAR") are persisted data and
 * never change; this only affects what staff see ("Table #1" / "Mesa #1").
 * Unknown labels (e.g. the takeout label) are returned unchanged.
 */
export function tableName(t: (key: string, vars?: Record<string, string>) => string, label: string): string {
  if (!label) return "";
  if (label === "BAR") return t("seating.bar");
  const m = label.match(/^T(\d+)$/i);
  return m ? t("seating.table", { n: m[1] }) : label;
}
