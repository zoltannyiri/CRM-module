import { useEffect, useRef, useState } from "react";

import { apiRequest, authApi } from "../api/client.js";

const REFRESH_INTERVAL = 14 * 60 * 1000;
import { AuthContext } from "./AuthContextDefinition.js";

export const AuthProvider = ({ children }) => {
  const [accessToken, setAccessToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshInFlight = useRef(null);

  const refreshAccessToken = async () => {
    if (!refreshInFlight.current) {
      refreshInFlight.current = authApi.refresh()
        .then(({ accessToken: nextAccessToken }) => {
          setAccessToken(nextAccessToken);
          return nextAccessToken;
        })
        .catch((error) => {
          setAccessToken(null);
          setUser(null);
          throw error;
        })
        .finally(() => {
          refreshInFlight.current = null;
        });
    }

    return refreshInFlight.current;
  };

  useEffect(() => {
    refreshAccessToken()
      .then((nextAccessToken) => authApi.me(nextAccessToken))
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!accessToken) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      refreshAccessToken().catch(() => {});
    }, REFRESH_INTERVAL);

    return () => window.clearInterval(intervalId);
  }, [accessToken]);

  const login = async (credentials) => {
    const result = await authApi.login(credentials);
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  };

  const register = async (token, details) => {
    const result = await authApi.register(token, details);
    setAccessToken(result.accessToken);
    setUser(result.user);
    return result.user;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  };

  const request = async (path, options = {}) => {
    try {
      return await apiRequest(path, options, accessToken);
    } catch (error) {
      if (error.status !== 401 || !accessToken) {
        throw error;
      }

      const nextAccessToken = await refreshAccessToken();
      return apiRequest(path, options, nextAccessToken);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        user,
        loading,
        isAuthenticated: Boolean(user && accessToken),
        login,
        register,
        logout,
        refreshAccessToken,
        request,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

