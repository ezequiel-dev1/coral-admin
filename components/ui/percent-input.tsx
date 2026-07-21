"use client";

import { useState, useCallback } from "react";
import { Input } from "@/components/ui/input";

function parsePercentValue(value: string): string {
  return value.replace(/[^0-9.]/g, "");
}

function formatPercent(value: string): string {
  const num = parseFloat(parsePercentValue(value));
  if (isNaN(num)) return "";
  return `${num}%`;
}

interface PercentInputProps {
  value: string;
  onChange: (value: string) => void;
  step?: number;
  placeholder?: string;
  className?: string;
}

export function PercentInput({ value, onChange, step = 0.5, placeholder, className }: PercentInputProps) {
  const [focused, setFocused] = useState(false);
  const [rawValue, setRawValue] = useState(() => parsePercentValue(value));

  const handleFocus = useCallback(() => {
    setRawValue(parsePercentValue(value));
    setFocused(true);
  }, [value]);

  const handleBlur = useCallback(() => {
    setFocused(false);
    const formatted = formatPercent(rawValue);
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
