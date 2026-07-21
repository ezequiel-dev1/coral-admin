"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";
import en from "../locales/en.json";
import es from "../locales/es.json";

type Messages = Record<string, unknown>;

const dictionaries: Record<string, Messages> = {
  "en-US": en,
  "es-MX": es,
};

type LanguageContextType = {
  lang: string;
  setLang: (lang: string) => void;
  t: (key: string, vars?: Record<string, string>) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "en-US",
  setLang: () => {},
  t: (key) => key,
});

function getNestedValue(obj: unknown, path: string): string | undefined {
  const keys = path.split(".");
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === "string" ? current : undefined;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState("en-US");

  useEffect(() => {
    const saved = localStorage.getItem("lang");
    if (saved && saved !== lang) {
      setLangState(saved);
    }
  }, []);

  const setLang = useCallback((newLang: string) => {
    setLangState(newLang);
    localStorage.setItem("lang", newLang);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string>): string => {
      const dict = dictionaries[lang] || dictionaries["en-US"];
      let value = getNestedValue(dict, key) || getNestedValue(dictionaries["en-US"], key) || key;

      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          value = value!.replace(`{{${k}}}`, v);
        });
      }

      return value;
    },
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  return useContext(LanguageContext);
}
