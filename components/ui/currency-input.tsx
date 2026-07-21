"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";

function parseCurrencyValue(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

function formatCurrency(value: string): string {
  const num = parseFloat(parseCurrencyValue(value));
  if (isNaN(num)) return "";
  return num.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

interface CurrencyInputProps {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  placeholder?: string;
  className?: string;
}

export function CurrencyInput({ value, onChange, step = 100, placeholder, className }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [rawValue, setRawValue] = useState(() => parseCurrencyValue(value));

  const handleFocus = useCallback(() => {
    setRawValue(parseCurrencyValue(value));
    setFocused(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const formatted = formatCurrency(rawValue);
    onChange(formatted);
  }, [rawValue, onChange]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setRawValue(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const current = parseFloat(rawValue) || 0;
      const newVal = e.key === "ArrowUp" ? current + step : Math.max(0, current - step);
      const rounded = Math.round(newVal * 100) / 100;
      setRawValue(String(rounded));
    }
  }, [rawValue, step]);

  return (
    <Input
      className={className}
      inputMode="decimal"
      value={focused ? rawValue : value}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
    />
  );
}
