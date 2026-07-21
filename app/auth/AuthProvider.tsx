"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Amplify } from "aws-amplify";
import {
  signIn,
  signOut,
  getCurrentUser,
  fetchAuthSession,
  signInWithRedirect,
} from "aws-amplify/auth";
import { authConfig } from "./config";

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: authConfig.userPoolId,
      userPoolClientId: authConfig.userPoolClientId,
      loginWith: {
        oauth: {
          domain: authConfig.domain,
          scopes: ["email", "openid", "profile"],
          redirectSignIn: [authConfig.redirectSignIn],
          redirectSignOut: [authConfig.redirectSignOut],
          responseType: "code",
        },
      },
    },
  },
});

export type AuthUser = {
  email: string;
  name: string;
  userId: string;
  group: string;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const currentUser = await getCurrentUser();
      const session = await fetchAuthSession();
      const payload = session.tokens?.idToken?.payload;

      const groups = (payload?.["cognito:groups"] as string[] | undefined) || [];

      setUser({
        userId: currentUser.userId,
        email: (payload?.email as string) || "",
        name: (payload?.name as string) || (payload?.email as string) || "",
        group: groups[0] || "",
      });
    } catch {
      // Not authenticated
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }

  const login = useCallback(() => {
    signInWithRedirect();
  }, []);

  const logout = useCallback(async () => {
    await signOut();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
