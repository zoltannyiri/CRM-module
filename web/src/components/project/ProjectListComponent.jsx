import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";
const statusLabels = { PLANNED: "Tervezett", ACTIVE: "Aktív", ON_HOLD: "Szüneteltetve", COMPLETED: "Befejezve", CANCELLED: "Megszakítva" };
const statusClasses = {
  PLANNED: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
  ACTIVE: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  ON_HOLD: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  COMPLETED: "border-[#cee0dc] bg-[#eef6f4] text-[#4b716b]",
  CANCELLED: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(new Date(value));
}

export default function ProjectListComponent({ query = "", statusFilter = "ALL", partnerFilter = "", sortDirection = "desc", reloadKey = 0, onView, onEdit }) {
  const [result, setResult] = useState({ projects: [], resolvedKey: null, error: "" });
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const rowsPerPage = 10;
  const requestKey = JSON.stringify([query, statusFilter, partnerFilter, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;

  useEffect(() => {
    let active = true;
    const params = {
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      ...(partnerFilter ? { partnerId: partnerFilter } : {}),
      sortDirection,
    };
    apiClient.get("/projects", { params })
      .then(({ data }) => {
        if (active) setResult({ projects: data, resolvedKey: requestKey, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ projects: [], resolvedKey: requestKey, error: error.message || "A projektlista betöltése sikertelen." });
      });
    return () => { active = false; };
  }, [partnerFilter, query, reloadKey, requestKey, sortDirection, statusFilter]);

  const projects = result.projects;
  const pageCount = Math.max(1, Math.ceil(projects.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => projects.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [currentPage, projects]);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggleAll = () => setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  const toggleProject = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const handleDelete = async (project) => {
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a projektet: ${project.name}?`)) return;
    setDeletingId(project.id);
    try {
      await apiClient.delete(`/projects/${project.id}`);
      setResult((current) => ({ ...current, projects: current.projects.filter(({ id }) => id !== project.id), error: "" }));
      setSelected((current) => current.filter((id) => id !== project.id));
    } catch (error) {
      setResult((current) => ({ ...current, error: error.message || "A projekt törlése sikertelen." }));
    } finally { setDeletingId(null); }
  };

  const checkboxTemplate = (project) => <input type="checkbox" checked={selected.includes(project.id)} onChange={() => toggleProject(project.id)} aria-label={`${project.name} kijelölése`} className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />;
  const nameTemplate = (project) => <div><button type="button" onClick={() => onView?.(project)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[#263338] hover:underline">{project.name}</button>{project.description && <p className="mt-0.5 max-w-72 truncate text-[11px] text-[#84908e]">{project.description}</p>}</div>;
  const statusTemplate = (project) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClasses[project.status]}`}>{statusLabels[project.status]}</span>;
  const actionTemplate = (project) => (
    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
      <button type="button" onClick={() => onView?.(project)} aria-label={`${project.name} megtekintése`} title="Megtekintés" className={actionButtonClass}><i className="pi pi-eye" aria-hidden="true" /></button>
      <button type="button" onClick={() => onEdit?.(project)} aria-label={`${project.name} módosítása`} title="Módosítás" className={actionButtonClass}><i className="pi pi-pencil" aria-hidden="true" /></button>
      <button type="button" onClick={() => handleDelete(project)} disabled={deletingId === project.id} aria-label={`${project.name} törlése`} title="Törlés" className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}><i className={`pi ${deletingId === project.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" /></button>
    </div>
  );

  return (
    <section className="bg-[#f3f5f6] px-5 pb-5" aria-labelledby="project-list-title">
      <div className="mb-3 flex items-end justify-between"><div><p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Projektkezelés</p><h2 id="project-list-title" className="text-base font-semibold text-[#29383d]">Projektek</h2></div><span className="text-xs text-[#7b8885]">{projects.length} találat</span></div>
      {selected.length > 0 && <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-[#dbe1df] bg-white px-4 py-2.5 text-xs font-medium text-[#4f7954]"><span>{selected.length} projekt kiválasztva</span><button type="button" onClick={() => setSelected([])} className="cursor-pointer text-[11px] text-[#657276] underline hover:text-[#253238]">Kijelölés megszüntetése</button></div>}
      <div className={`relative overflow-x-auto border border-[#dbe1df] bg-white ${selected.length ? "rounded-b-2xl" : "rounded-2xl"}`} aria-busy={loading}>
        {loading && <div className="absolute inset-x-0 top-12 bottom-0 z-10 grid min-h-40 place-items-center bg-white" role="status" aria-label="Projektlista betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
        <DataTable value={visible} dataKey="id" unstyled tableClassName="w-full min-w-[1120px] border-collapse text-left" rowClassName={(project) => `${selected.includes(project.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`} emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{result.error || "Nincs megjeleníthető projekt."}</span>}>
          <Column header={<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Minden látható projekt kijelölése" className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />} body={checkboxTemplate} headerClassName={`${headerClass} w-14 px-5`} bodyClassName={`${cellClass} w-14 px-5`} />
          <Column header="Projekt" body={nameTemplate} headerClassName={`${headerClass} w-[24%]`} bodyClassName={`${cellClass} w-[24%]`} />
          <Column header="Partner" body={(project) => project.partner?.name || "—"} headerClassName={`${headerClass} w-[18%]`} bodyClassName={`${cellClass} w-[18%]`} />
          <Column header="Státusz" body={statusTemplate} headerClassName={`${headerClass} w-[13%]`} bodyClassName={`${cellClass} w-[13%]`} />
          <Column header="Kezdés" body={(project) => formatDate(project.startDate)} headerClassName={`${headerClass} w-[12%]`} bodyClassName={`${cellClass} w-[12%] whitespace-nowrap`} />
          <Column header="Határidő" body={(project) => formatDate(project.deadline)} headerClassName={`${headerClass} w-[12%]`} bodyClassName={`${cellClass} w-[12%] whitespace-nowrap`} />
          <Column header="Módosítva" body={(project) => formatDate(project.updatedAt)} headerClassName={`${headerClass} w-[12%]`} bodyClassName={`${cellClass} w-[12%] whitespace-nowrap`} />
          <Column header="Műveletek" body={actionTemplate} headerClassName={`${headerClass} w-[136px] !px-2 text-center`} bodyClassName={`${cellClass} w-[136px] !px-2`} />
        </DataTable>
      </div>
      <nav className="mt-5 flex justify-center" aria-label="Projektlista lapozása"><div className="inline-flex overflow-hidden rounded-md border border-[#d6dddc] bg-white"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="h-9 cursor-pointer border-0 border-r border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Előző</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? "page" : undefined} className={`size-9 cursor-pointer border-0 border-r border-[#dfe4e3] text-xs ${number === currentPage ? "bg-[#f0f3f2] font-semibold" : "bg-white hover:bg-[#f7f8f8]"}`}>{number}</button>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)} className="h-9 cursor-pointer border-0 bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Következő</button></div></nav>
    </section>
  );
}
