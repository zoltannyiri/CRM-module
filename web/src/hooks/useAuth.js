import { useContext } from "react";

import { AuthContext } from "../context/AuthContextDefinition.js";

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }

  return context;
};