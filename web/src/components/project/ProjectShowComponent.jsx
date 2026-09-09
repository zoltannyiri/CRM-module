import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import apiClient from "../../api/apiClient.js";

const pendingProjectRequests = new Map();

function getProject(projectId) {
  const key = String(projectId);
  const pending = pendingProjectRequests.get(key);
  if (pending) return pending;

  const request = apiClient.get(`/projects/${projectId}`);
  pendingProjectRequests.set(key, request);
  request.then(
    () => pendingProjectRequests.delete(key),
    () => pendingProjectRequests.delete(key),
  );
  return request;
}

const statusLabels = {
  PLANNED: "Tervezett",
  ACTIVE: "Aktív",
  ON_HOLD: "Szüneteltetve",
  COMPLETED: "Befejezve",
  CANCELLED: "Megszakítva",
};

const statusClasses = {
  PLANNED: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
  ACTIVE: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  ON_HOLD: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  COMPLETED: "border-[#cee0dc] bg-[#eef6f4] text-[#4b716b]",
  CANCELLED: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
};

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
      <dt className="text-[#71807c]">{label}</dt>
      <dd className="font-medium text-[#253238] sm:col-span-2">{children}</dd>
    </div>
  );
}

function DetailCard({ title, icon, children, className = "" }) {
  return (
    <section className={`rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)] ${className}`}>
      <h3 className="mb-4 flex items-center gap-2 border-b border-[#f0f3f2] pb-3 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
        <i className={`pi ${icon} text-sm text-[#78ad7d]`} aria-hidden="true" />
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function ProjectShowComponent({ projectId }) {
  const [result, setResult] = useState({ project: null, error: null, resolvedId: null });
  const normalizedProjectId = String(projectId);
  const loading = result.resolvedId !== normalizedProjectId;

  useEffect(() => {
    let active = true;
    getProject(projectId)
      .then(({ data }) => {
        if (active) setResult({ project: data, error: null, resolvedId: String(projectId) });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Hiba a projekt betöltésekor:", error);
        setResult({
          project: null,
          error: error.response?.status === 404 ? "A projekt nem található." : "A projekt adatai nem tölthetők be.",
          resolvedId: String(projectId),
        });
      });
    return () => { active = false; };
  }, [projectId]);

  if (loading) {
    return (
      <div className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white p-8" role="status" aria-label="Projekt adatainak betöltése">
        <div className="flex flex-col items-center gap-3">
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          <span className="text-xs text-[#71807c]">Projekt adatainak betöltése…</span>
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="rounded-xl border border-[#efd7d1] bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#fdf1ee] text-[#a34b3d]">
          <i className="pi pi-exclamation-triangle text-lg" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-[#253238]">{result.error}</h3>
        <p className="mt-1 text-xs text-[#71807c]">Térj vissza a projektlistához, és válassz egy elérhető projektet.</p>
        <Link to="/project" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9]">
          <i className="pi pi-arrow-left text-xs" aria-hidden="true" />
          Vissza a projektekhez
        </Link>
      </div>
    );
  }

  const project = result.project;
  if (!project) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-[#f0f6ef] text-[#5b8761]">
            <i className="pi pi-briefcase text-xl" aria-hidden="true" />
          </span>
          <div>
            <p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Projekt</p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-[#253238]">{project.name || "—"}</h2>
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClasses[project.status] || statusClasses.PLANNED}`}>
                {statusLabels[project.status] || "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <DetailCard title="Projekt adatai" icon="pi-briefcase">
          <dl className="grid gap-3.5 text-xs">
            <DetailRow label="Projekt neve">{project.name || "—"}</DetailRow>
            <DetailRow label="Státusz">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClasses[project.status] || statusClasses.PLANNED}`}>
                {statusLabels[project.status] || "—"}
              </span>
            </DetailRow>
            <DetailRow label="Partner">{project.partner?.name || "—"}</DetailRow>
          </dl>
        </DetailCard>

        <DetailCard title="Időzítés" icon="pi-calendar">
          <dl className="grid gap-3.5 text-xs">
            <DetailRow label="Kezdés">{formatDate(project.startDate)}</DetailRow>
            <DetailRow label="Határidő">{formatDate(project.deadline)}</DetailRow>
          </dl>
        </DetailCard>

        <DetailCard title="Leírás" icon="pi-align-left" className="lg:col-span-2">
          <p className={`whitespace-pre-wrap text-xs leading-relaxed ${project.description ? "text-[#344247]" : "text-[#71807c]"}`}>
            {project.description || "—"}
          </p>
        </DetailCard>

        <DetailCard title="Rendszeradatok" icon="pi-clock" className="lg:col-span-2">
          <dl className="grid gap-3.5 text-xs sm:grid-cols-2 sm:gap-x-8">
            <DetailRow label="Létrehozva">{formatDate(project.createdAt)}</DetailRow>
            <DetailRow label="Módosítva">{formatDate(project.updatedAt)}</DetailRow>
          </dl>
        </DetailCard>
      </div>
    </div>
  );
}
