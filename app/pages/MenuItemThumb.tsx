"use client";

import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { getObjectUrl } from "../lib/receipts";

/**
 * Square dish picture for menu item pickers. Resolves the item's S3 key to a
 * pre-signed URL and falls back to a placeholder icon when there is no image.
 */
export function MenuItemThumb({ imageKey, className = "" }: { imageKey?: string; className?: string }) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!imageKey) {
      setUrl("");
      return;
    }
    let active = true;
    getObjectUrl(imageKey)
      .then((u) => active && setUrl(u))
      .catch((err) => console.error("Failed to load image:", err));
    return () => {
      active = false;
    };
  }, [imageKey]);

  return (
    <div
      className={`flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-muted)] text-[var(--text-muted)] ${className}`}
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <ImageOff size={22} aria-hidden="true" />
      )}
    </div>
  );
}
