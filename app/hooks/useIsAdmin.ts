"use client";

import { useAuth } from "../auth/AuthProvider";

export function useIsAdmin(): boolean {
  const { user } = useAuth();
  return user?.groups?.includes("Administrator") ?? false;
}
