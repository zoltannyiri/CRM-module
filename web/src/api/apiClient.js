import axios from "axios";

const env = import.meta.env || {};
const configuredBaseUrl = env.VITE_API_BASE_URL || env.VITE_API_URL || "http://localhost:5000";
const normalizedBaseUrl = configuredBaseUrl.replace(/\/$/, "");
const API_BASE_URL = normalizedBaseUrl.endsWith("/api")
  ? normalizedBaseUrl
  : `${normalizedBaseUrl}/api`;

const ACCESS_TOKEN_KEY = "accessToken";
export const AUTH_TOKEN_CHANGED_EVENT = "auth:token-changed";
export const AUTH_SESSION_ENDED_EVENT = "auth:session-ended";

const emit = (eventName, detail) => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
  }
};

export const getAccessToken = () => {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
};

export const storeAccessToken = (accessToken) => {
  if (!accessToken) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  emit(AUTH_TOKEN_CHANGED_EVENT, accessToken);
};

export const clearAccessToken = () => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
  emit(AUTH_SESSION_ENDED_EVENT);
};

const withApiMessage = (error) => {
  if (error.response?.data?.message) {
    error.message = error.response.data.message;
  }
  return error;
};

// A refresh kliens szándékosan nem kap interceptorokat, így nem tud saját
// magára újabb refresh kérést indítani.
export const authClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
  const accessToken = getAccessToken();

  if (accessToken) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

let refreshPromise = null;

export const refreshSession = () => {
  if (!refreshPromise) {
    refreshPromise = authClient.post("/auth/refresh")
      .then(({ data }) => {
        storeAccessToken(data.accessToken);
        return data.accessToken;
      })
      .catch((error) => {
        clearAccessToken();
        throw withApiMessage(error);
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

const authPaths = ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"];

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const isAuthRequest = authPaths.some((path) => originalRequest?.url?.includes(path));

    if (error.response?.status !== 401 || !originalRequest || originalRequest._retry || isAuthRequest) {
      throw withApiMessage(error);
    }

    originalRequest._retry = true;

    try {
      const accessToken = await refreshSession();
      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${accessToken}`;
      return apiClient(originalRequest);
    } catch (refreshError) {
      throw withApiMessage(refreshError);
    }
  },
);

const dataOnly = (promise) => promise
  .then(({ data }) => data)
  .catch((error) => {
    throw withApiMessage(error);
  });

export const authApi = {
  invitation: (token) => dataOnly(authClient.get(`/auth/invitation/${token}`)),
  login: (credentials) => dataOnly(authClient.post("/auth/login", credentials)),
  register: (token, details) => dataOnly(authClient.post(`/auth/register/${token}`, details)),
  refresh: refreshSession,
  logout: () => dataOnly(authClient.post("/auth/logout")),
  me: () => dataOnly(apiClient.get("/auth/me")),
};

export default apiClient;
