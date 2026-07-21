"use client";

import { AuthProvider } from "./auth/AuthProvider";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { Dashboard } from "./Dashboard";

export default function Home() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </AuthProvider>
    </LanguageProvider>
  );
}
