/**
 * Menu item pricing. A menu item has a "store price" (`price`, what the restaurant
 * charges) and a "platform price" (`platformPrice`, what delivery platforms such
 * as Uber Eats charge): the store price plus a fixed markup.
 */
export const PLATFORM_MARKUP_PERCENT = 30;

/** "$1,150.50" or "1150.5" -> 115050 centavos. Null when not a positive price. */
export function toCentavos(price: string | number): number | null {
  const n = typeof price === "number" ? price : parseFloat(String(price).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Store price plus the platform markup, in centavos (integer math, rounded to the centavo). */
export function platformCentavos(storePrice: string | number): number | null {
  const cents = toCentavos(storePrice);
  return cents === null ? null : Math.round((cents * (100 + PLATFORM_MARKUP_PERCENT)) / 100);
}

/** Platform price in the same display format as the store price ("$1,495.00"); "" when the store price is empty. */
export function formatPlatformPrice(storePrice: string | number): string {
  const cents = platformCentavos(storePrice);
  if (cents === null) return "";
  return (cents / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
