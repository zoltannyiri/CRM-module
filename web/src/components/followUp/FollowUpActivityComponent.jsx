import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import ActivityFeed from "../activity/ActivityFeed.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { followUpAccess } from "./followUpDisplay.js";

export default function FollowUpActivityComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  if (!hasPermission("ACTIVITY_VIEW") || !followUpAccess(hasModule, hasPermission).view) return null;
  return <FollowUpActivity key={props.followUpId} {...props} />;
}

function FollowUpActivity({ followUpId, reloadKey = 0 }) {
  const [result, setResult] = useState({ activities: [], error: "", resolvedKey: null });
  const loadKey = `${followUpId}-${reloadKey}`;
  useEffect(() => {
    let active = true;
    apiClient.get("/activities", {
      params: { entityType: "FOLLOW_UP", entityId: followUpId, limit: 100 },
      skipGlobalErrorToast: true,
    }).then(({ data }) => {
      if (active) setResult({ activities: data, error: "", resolvedKey: loadKey });
    }).catch(() => {
      if (active) setResult({ activities: [], error: "A tevékenységek nem tölthetők be.", resolvedKey: loadKey });
    });
    return () => { active = false; };
  }, [followUpId, loadKey]);
  const loading = result.resolvedKey !== loadKey;
  return <section aria-labelledby="follow-up-activities-title">
    <div className="mb-4"><h2 id="follow-up-activities-title" className="text-base font-semibold text-[#29383d]">Tevékenységek</h2><p className="mt-1 text-xs text-[#71807c]">Az utánkövetéssel kapcsolatos események és módosítások naplója.</p></div>
    <ActivityFeed activities={loading ? [] : result.activities} loading={loading} error={loading ? "" : result.error} emptyMessage="Nincs megjeleníthető tevékenység." />
  </section>;
}
