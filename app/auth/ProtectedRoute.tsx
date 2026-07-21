"use client";

import { useAuth } from "./AuthProvider";
import { useTranslation } from "../i18n/LanguageProvider";
import { Button } from "@/components/ui/button";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, login } = useAuth();
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <p>{t("auth.loading")}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-login">
        <div className="auth-card">
          <img src="/coral-icon.png" alt="Coral Reef and Beef" className="brand-mark" />
          <h1>{t("auth.title")}</h1>
          <p>{t("auth.subtitle")}</p>
          <Button onClick={login} className="w-full mt-2">
            {t("auth.signIn")}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
