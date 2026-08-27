const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

export const apiRequest = async (path, options = {}, accessToken) => {
  const headers = new Headers(options.headers);

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  const contentType = response.headers.get("Content-Type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    const error = new Error(data?.message || "A kérés sikertelen.");
    error.status = response.status;
    throw error;
  }

  return data;
};

export const authApi = {
  login: (credentials) => apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  }),
  register: (token, details) => apiRequest(`/auth/register/${token}`, {
    method: "POST",
    body: JSON.stringify(details),
  }),
  refresh: () => apiRequest("/auth/refresh", { method: "POST" }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  me: (accessToken) => apiRequest("/auth/me", {}, accessToken),
};
