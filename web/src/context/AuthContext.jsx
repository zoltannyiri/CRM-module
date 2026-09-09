import { useCallback, useEffect, useState } from "react";

import apiClient, {
  AUTH_SESSION_ENDED_EVENT,
  AUTH_TOKEN_CHANGED_EVENT,
  authApi,
  clearAccessToken,
  getAccessToken,
  refreshSession,
  storeAccessToken,
} from "../api/apiClient.js";
import { AuthContext } from "./AuthContextDefinition.js";

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(getAccessToken);
  const [user, setUser] = useState(null);
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleTokenChanged = (event) => setAccessToken(event.detail);
    const handleSessionEnded = () => {
      setAccessToken(null);
      setUser(null);
      setModules([]);
    };
    const handleStorage = (event) => {
      if (event.key === "accessToken") {
        setAccessToken(event.newValue);
        if (!event.newValue) {
          setUser(null);
          setModules([]);
        }
      }
    };

    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);
    window.addEventListener(AUTH_SESSION_ENDED_EVENT, handleSessionEnded);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, handleTokenChanged);
      window.removeEventListener(AUTH_SESSION_ENDED_EVENT, handleSessionEnded);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const restoreSession = async () => {
      try {
        if (!getAccessToken()) {
          await refreshSession();
        }

        const session = await authApi.me();
        if (active) {
          setUser(session.user);
          setModules(session.modules || []);
        }
      } catch {
        clearAccessToken();
      } finally {
        if (active) setLoading(false);
      }
    };

    restoreSession();
    return () => {
      active = false;
    };
  }, []);

  const login = async (credentials) => {
    const result = await authApi.login(credentials);
    storeAccessToken(result.accessToken);
    setUser(result.user);
    setModules(result.modules || []);
    return result.user;
  };

  const register = async (token, details) => {
    const result = await authApi.register(token, details);
    storeAccessToken(result.accessToken);
    setUser(result.user);
    setModules(result.modules || []);
    return result.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearAccessToken();
    }
  };

  // Kompatibilitási adapter a már meglévő useAuth().request hívásokhoz.
  const request = async (path, options = {}) => {
    const headers = { ...options.headers };
    let data = options.body;

    if (typeof data === "string" && headers["Content-Type"]?.includes("application/json")) {
      data = JSON.parse(data);
    }

    const response = await apiClient({
      url: path,
      method: options.method || "GET",
      headers,
      data,
    });

    return response.data;
  };

  const hasModule = useCallback((moduleKey) => modules.includes(moduleKey), [modules]);

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        modules,
        hasModule,
        loading,
        isAuthenticated: Boolean(user && accessToken),
        login,
        register,
        logout,
        refreshAccessToken: refreshSession,
        request,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
