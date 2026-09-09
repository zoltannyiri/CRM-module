import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import ActivityFeed from "../activity/ActivityFeed.jsx";
import { useAuth } from "../../hooks/useAuth.js";

export default function ProjectActivityComponent({ projectId }) {
  const { hasPermission } = useAuth();
  const canView = hasPermission("ACTIVITY_VIEW");

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView) return undefined;
    let active = true;
    setLoading(true);
    setError("");

    apiClient
      .get("/activities", {
        params: {
          entityType: "PROJECT",
          entityId: projectId,
          limit: 100,
        },
      })
      .then(({ data }) => {
        if (active) {
          setActivities(data);
          setError("");
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "A tevékenységek nem tölthetők be.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canView, projectId]);

  if (!canView) return null;

  return (
    <section aria-labelledby="project-activities-title">
      <div className="mb-4">
        <h2 id="project-activities-title" className="text-base font-semibold text-[#29383d]">
          Tevékenységek
        </h2>
        <p className="mt-1 text-xs text-[#71807c]">A projekttel kapcsolatos események és módosítások naplója.</p>
      </div>

      <ActivityFeed
        activities={activities}
        loading={loading}
        error={error}
        emptyMessage="Ehhez a projekthez még nincs tevékenység."
      />
    </section>
  );
}
