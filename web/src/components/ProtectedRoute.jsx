import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-dvh place-items-center bg-[#f3f5f6] text-sm text-[#687579]">Munkamenet betöltése…</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
