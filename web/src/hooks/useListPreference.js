import { useCallback, useEffect, useState } from "react";
import apiClient from "../api/apiClient.js";
import { defaultListColumns, storedColumn } from "../components/configurableView/listColumns.js";

export function useListPreference(entityType, { enabled = true } = {}) {
  const [preference, setPreference] = useState({ entityType, version: 1, customized: false, columns: defaultListColumns[entityType], availableColumns: defaultListColumns[entityType] });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!enabled) return null;
    setLoading(true);
    try { const { data } = await apiClient.get(`/view-preferences/${entityType}`); setPreference(data); setError(""); return data; }
    catch (requestError) { setError(requestError.response?.data?.message || "Az oszlopbeállítások nem tölthetők be."); }
    finally { setLoading(false); }
    return null;
  }, [enabled, entityType]);

  useEffect(() => {
    if (!enabled) return undefined;
    let active = true;
    apiClient.get(`/view-preferences/${entityType}`)
      .then(({ data }) => {
        if (active) {
          setPreference(data);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Az oszlopbeállítások nem tölthetők be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [enabled, entityType]);

  const save = async (columns) => {
    const { data } = await apiClient.put(`/view-preferences/${entityType}`, { columns: columns.map(storedColumn) }, { skipGlobalErrorToast: true });
    setPreference(data); return data;
  };
  const reset = async () => {
    const { data } = await apiClient.delete(`/view-preferences/${entityType}`, { skipGlobalErrorToast: true });
    setPreference(data); return data;
  };
  return { preference, loading, error, save, reset, reload: load };
}

export default useListPreference;
