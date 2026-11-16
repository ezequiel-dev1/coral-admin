export function cacheValue<T>(key: string, value: T): T {
  if (typeof window !== "undefined") localStorage.setItem(`coral:cache:${key}`, JSON.stringify(value));
  return value;
}
export function cachedValue<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(localStorage.getItem(`coral:cache:${key}`) ?? "") as T; } catch { return null; }
}
