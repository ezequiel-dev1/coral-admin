"use client";

import { useTranslation } from "../i18n/LanguageProvider";
import { tableName } from "../lib/tableName";

/**
 * Coral seating chart — reuses the Overview floor-plan widget style (BAR strip
 * on top, WINDOW / DINING ROOM side labels, a fixture strip on the bottom).
 *
 * Selectable spots (each holds its own open check):
 *   - "T1"  — one 4-seat table
 *   - "BAR" — the 3-seat bar
 *
 * Reference only (no interaction): the top BAR strip, the side labels, the
 * bottom "Main Bar" strip, and the square RESTROOM fixture.
 *
 * Occupancy (has an open check) is passed in so a spot can be tinted; selection
 * is controlled by the parent.
 */

export const SEATING_SPOTS = [
  { id: "T1", label: "T1", seats: 4 },
  { id: "BAR", label: "Bar", seats: 3 },
] as const;

export type SeatingSpotId = (typeof SEATING_SPOTS)[number]["id"];

type SeatingChartProps = {
  selected: string | null;
  occupied: (spotId: string) => boolean;
  onSelect: (spotId: string) => void;
  seatsLabel: string;
};

export function SeatingChart({
  selected,
  occupied,
  onSelect,
  seatsLabel,
}: SeatingChartProps) {
  const { t } = useTranslation();

  // Spot ids ("T1", "BAR") are stored data and never change; only the shown label is translated.
  const labelFor = (id: string) => tableName(t, id);

  // All boxes (table, bar, restroom) share this square size.
  const BOX = 96; // table + restroom square size
  const BAR_W = 72; // Bar is a vertical rectangle: narrower...
  const BAR_H = 180; // ...and taller than the square boxes

  const spot = (id: string, seats: number) => {
    const label = labelFor(id);
    const isSelected = selected === id;
    const isOccupied = occupied(id);
    const isT1 = id === "T1";
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={`table ${isOccupied ? "table-seated" : "table-ready"} ${
          isSelected ? "selected" : ""
        }`}
        style={{
          gridArea: isT1 ? "t1" : "barspot",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: isT1 ? BOX : BAR_W,
          height: isT1 ? BOX : BAR_H,
          alignSelf: "start",
          // T1 floats left, the Bar floats right.
          justifySelf: isT1 ? "start" : "end",
        }}
        aria-pressed={isSelected}
        aria-label={`${label}, ${seats} ${seatsLabel}${
          isOccupied ? ` (${t("seating.openCheck")})` : ""
        }`}
      >
        <b>{label}</b>
        <small>
          {seats} {seatsLabel}
        </small>
      </button>
    );
  };

  return (
    <div
      className="floor-plan"
      style={{
        gridTemplateColumns: "repeat(4, 1fr)",
        gridTemplateRows: `41px ${BAR_H}px 1fr ${BOX}px`,
        gridTemplateAreas:
          '"entrance entrance entrance entrance" ' +
          '"t1 free free barspot" ' +
          '"free2 free2 free2 free2" ' +
          '"bottom bottom bottom bottom"',
      }}
    >
      {/* Top reference strip */}
      <div className="bar" style={{ gridArea: "entrance" }}>
        {t("seating.entrance")} <span>● ● ● ● ●</span>
      </div>

      {/* Side labels (reference) */}
      <div className="floor-label label-a">{t("seating.window")}</div>
      <div className="floor-label label-b">{t("seating.diningRoom")}</div>

      {/* Selectable spots */}
      {spot("T1", 4)}
      {spot("BAR", 3)}

      {/* Bottom row: MAIN BAR fills all remaining width, Restroom is a fixed
          square flush to its right (no gap between them). */}
      <div
        style={{
          gridArea: "bottom",
          display: "flex",
          gap: 17,
          height: "100%",
          alignItems: "end",
        }}
      >
        <div className="pass" style={{ flex: 1, height: "100%" }}>
          {t("seating.mainBar")}
        </div>
        <div
          className="pass"
          style={{ width: BOX, height: BOX, flex: "0 0 auto" }}
        >
          {t("seating.restroom")}
        </div>
      </div>
    </div>
  );
}
