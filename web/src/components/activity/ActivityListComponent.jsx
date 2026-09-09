import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import ActivityFeed from "./ActivityFeed.jsx";

export default function ActivityListComponent({
  entityType = "",
  action = "",
  actorMemberId = "",
  sortDirection = "desc",
  reloadKey = 0,
}) {
  const [result, setResult] = useState({ activities: [], resolvedKey: null, error: "" });

  const requestKey = JSON.stringify([entityType, action, actorMemberId, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;

  useEffect(() => {
    let active = true;
    const params = {
      ...(entityType ? { entityType } : {}),
      ...(action ? { action } : {}),
      ...(actorMemberId ? { actorMemberId } : {}),
      sortDirection,
      limit: 100,
    };

    apiClient
      .get("/activities", { params })
      .then(({ data }) => {
        if (active) setResult({ activities: data, resolvedKey: requestKey, error: "" });
      })
      .catch((error) => {
        if (active) {
          setResult({
            activities: [],
            resolvedKey: requestKey,
            error: error.message || "A tevékenységek betöltése sikertelen.",
          });
        }
      });

    return () => {
      active = false;
    };
  }, [action, actorMemberId, entityType, reloadKey, requestKey, sortDirection]);

  return (
    <ActivityFeed
      activities={result.activities}
      loading={loading}
      error={result.error}
      emptyMessage="Nincs megjeleníthető tevékenység."
    />
  );
}
