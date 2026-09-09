import { useEffect, useState } from "react";
import apiClient from "../api/apiClient.js";
import ActivityListComponent from "../components/activity/ActivityListComponent.jsx";
import Topbar from "../components/Topbar.jsx";

const lightControl =
  "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function ActivityPage() {
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [actorMemberId, setActorMemberId] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [members, setMembers] = useState([]);

  useEffect(() => {
    let active = true;
    apiClient
      .get("/members")
      .then(({ data }) => {
        if (active) setMembers(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-2">
          {/* Entitás típus */}
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            aria-label="Entitás típus"
            className={`${lightControl} min-w-[150px]`}
          >
            <option value="">Minden típus</option>
            <option value="PARTNER">Partner</option>
            <option value="CONTACT">Kapcsolattartó</option>
            <option value="PROJECT">Projekt</option>
            <option value="TASK">Feladat</option>
          </select>

          {/* Művelet */}
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="Művelet"
            className={`${lightControl} min-w-[160px]`}
          >
            <option value="">Minden művelet</option>
            <option value="CREATED">Létrehozva</option>
            <option value="UPDATED">Módosítva</option>
            <option value="DELETED">Törölve</option>
            <option value="STATUS_CHANGED">Státusz módosítva</option>
            <option value="ASSIGNED">Felelős módosítva</option>
            <option value="PRIORITY_CHANGED">Prioritás módosítva</option>
          </select>

          {/* Végrehajtó / Felhasználó */}
          <select
            value={actorMemberId}
            onChange={(e) => setActorMemberId(e.target.value)}
            aria-label="Végrehajtó"
            className={`${lightControl} min-w-[170px]`}
          >
            <option value="">Minden felhasználó</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.user?.firstName} {member.user?.lastName}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs text-[#71807c]">Rendezés</span>
          <button
            type="button"
            onClick={() => setSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
            className={`${lightControl} inline-flex min-w-[140px] items-center justify-between gap-3`}
          >
            <span>{sortDirection === "desc" ? "Legújabb elöl" : "Legrégebbi elöl"}</span>
            <i
              className={`pi pi-chevron-down text-[10px] transition-transform ${
                sortDirection === "asc" ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      <main className="px-5 py-6 lg:px-7">
        <div className="mb-4">
          <p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">
            Naplózás
          </p>
          <h1 className="text-base font-semibold text-[#29383d]">Tevékenységek</h1>
        </div>

        <ActivityListComponent
          entityType={entityType}
          action={action}
          actorMemberId={actorMemberId}
          sortDirection={sortDirection}
        />
      </main>
    </div>
  );
}
