import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

const statusLabels = { TODO: "Teendő", IN_PROGRESS: "Folyamatban", BLOCKED: "Blokkolt", DONE: "Kész", CANCELLED: "Megszakítva" };
const statusClasses = {
  TODO: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
  IN_PROGRESS: "border-[#c5d8e8] bg-[#edf4fa] text-[#3d6b8e]",
  BLOCKED: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
  DONE: "border-[#cfe3d1] bg-[#eff7ef] text-[#4d7853]",
  CANCELLED: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
};

const priorityLabels = { LOW: "Alacsony", MEDIUM: "Közepes", HIGH: "Magas", URGENT: "Sürgős" };
const priorityClasses = {
  LOW: "border-[#d9e0df] bg-[#f3f5f5] text-[#5f6c70]",
  MEDIUM: "border-[#c5d8e8] bg-[#edf4fa] text-[#3d6b8e]",
  HIGH: "border-[#e8ddc5] bg-[#faf6ec] text-[#816d40]",
  URGENT: "border-[#ead6d1] bg-[#faf1ef] text-[#8a5b51]",
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(new Date(value));
}

export default function TaskListComponent({ query = "", statusFilter = "ALL", priorityFilter = "ALL", projectFilter = "", assigneeFilter = "", sortDirection = "desc", reloadKey = 0, onEdit, canView = true, canEdit = false, canDelete = false }) {
  const { showSuccess, showError } = useToast();
  const hasActions = canEdit || canDelete;
  const [result, setResult] = useState({ tasks: [], resolvedKey: null, error: "" });
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const rowsPerPage = 10;
  const requestKey = JSON.stringify([query, statusFilter, priorityFilter, projectFilter, assigneeFilter, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;

  useEffect(() => {
    let active = true;
    const params = {
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
      ...(priorityFilter !== "ALL" ? { priority: priorityFilter } : {}),
      ...(projectFilter ? { projectId: projectFilter } : {}),
      ...(assigneeFilter ? { assigneeMemberId: assigneeFilter } : {}),
      sortDirection,
    };
    apiClient.get("/tasks", { params })
      .then(({ data }) => {
        if (active) setResult({ tasks: data, resolvedKey: requestKey, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ tasks: [], resolvedKey: requestKey, error: error.message || "A feladatlista betöltése sikertelen." });
      });
    return () => { active = false; };
  }, [assigneeFilter, priorityFilter, projectFilter, query, reloadKey, requestKey, sortDirection, statusFilter]);

  const tasks = result.tasks;
  const pageCount = Math.max(1, Math.ceil(tasks.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => tasks.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [currentPage, tasks]);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggleAll = () => setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  const toggleTask = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const handleDelete = async (task) => {
    if (!canDelete) {
      showError("Nincs jogosultsága a feladat törléséhez.", "Nincs jogosultság");
      return;
    }
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a feladatot: ${task.title}?`)) return;
    setDeletingId(task.id);
    try {
      await apiClient.delete(`/tasks/${task.id}`);
      setResult((current) => ({ ...current, tasks: current.tasks.filter(({ id }) => id !== task.id), error: "" }));
      setSelected((current) => current.filter((id) => id !== task.id));
      showSuccess("A feladat sikeresen törölve.");
    } catch (error) {
      setResult((current) => ({ ...current, error: error.message || "A feladat törlése sikertelen." }));
    } finally { setDeletingId(null); }
  };

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, priorityFilter, projectFilter, assigneeFilter]);

  const checkboxTemplate = (task) => (
    <input
      type="checkbox"
      checked={selected.includes(task.id)}
      onChange={() => toggleTask(task.id)}
      onClick={(e) => e.stopPropagation()}
      aria-label={`${task.title} kijelölése`}
      className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]"
    />
  );

  const nameTemplate = (task) => (
    <div>
      {canEdit ? <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.(task);
        }}
        className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[#263338] hover:underline"
      >
        {task.title}
      </button> : <span className="font-medium text-[#263338]">{task.title}</span>}
      {task.description && <p className="mt-0.5 max-w-72 truncate text-[11px] text-[#84908e]">{task.description}</p>}
    </div>
  );

  const statusTemplate = (task) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClasses[task.status]}`}>{statusLabels[task.status]}</span>;
  const priorityTemplate = (task) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${priorityClasses[task.priority]}`}>{priorityLabels[task.priority]}</span>;
  const actionTemplate = (task) => (
    <div
      className="flex items-center justify-center gap-1 whitespace-nowrap"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {canEdit && <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onEdit?.(task);
        }}
        aria-label={`${task.title} módosítása`}
        title="Módosítás"
        className={actionButtonClass}
      >
        <i className="pi pi-pencil pointer-events-none" aria-hidden="true" />
      </button>}
      {canDelete && <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete(task);
        }}
        disabled={deletingId === task.id}
        aria-label={`${task.title} törlése`}
        title="Törlés"
        className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}
      >
        <i className={`pi ${deletingId === task.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none`} aria-hidden="true" />
      </button>}
    </div>
  );

  return (
    <section className="bg-[#f3f5f6] px-5 pb-5" aria-labelledby="task-list-title">
      <div className="mb-3 flex items-end justify-between"><div><p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Feladatkezelés</p><h2 id="task-list-title" className="text-base font-semibold text-[#29383d]">Feladatok</h2></div><span className="text-xs text-[#7b8885]">{tasks.length} találat</span></div>
      {selected.length > 0 && <div className="flex items-center justify-between rounded-t-2xl border border-b-0 border-[#dbe1df] bg-white px-4 py-2.5 text-xs font-medium text-[#4f7954]"><span>{selected.length} feladat kiválasztva</span><button type="button" onClick={() => setSelected([])} className="cursor-pointer text-[11px] text-[#657276] underline hover:text-[#253238]">Kijelölés megszüntetése</button></div>}
      <div className={`relative overflow-x-auto border border-[#dbe1df] bg-white ${selected.length ? "rounded-b-2xl" : "rounded-2xl"}`} aria-busy={loading}>
        {loading && <div className="absolute inset-x-0 top-12 bottom-0 z-10 grid min-h-40 place-items-center bg-white" role="status" aria-label="Feladatlista betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
        <DataTable value={visible} dataKey="id" unstyled tableClassName="w-full min-w-[1120px] border-collapse text-left" rowClassName={(task) => `${selected.includes(task.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`} emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{result.error || "Nincs megjeleníthető feladat."}</span>}>
          <Column header={<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Minden látható feladat kijelölése" className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />} body={checkboxTemplate} headerClassName={`${headerClass} w-14 px-5`} bodyClassName={`${cellClass} w-14 px-5`} />
          <Column header="Feladat" body={nameTemplate} headerClassName={`${headerClass} w-[25%]`} bodyClassName={`${cellClass} w-[25%]`} />
          <Column header="Projekt" body={(task) => task.project?.name || "—"} headerClassName={`${headerClass} w-[15%]`} bodyClassName={`${cellClass} w-[15%]`} />
          <Column header="Felelős" body={(task) => task.assigneeMember?.user ? `${task.assigneeMember.user.firstName} ${task.assigneeMember.user.lastName}` : "—"} headerClassName={`${headerClass} w-[15%]`} bodyClassName={`${cellClass} w-[15%]`} />
          <Column header="Státusz" body={statusTemplate} headerClassName={`${headerClass} w-[10%]`} bodyClassName={`${cellClass} w-[10%]`} />
          <Column header="Prioritás" body={priorityTemplate} headerClassName={`${headerClass} w-[10%]`} bodyClassName={`${cellClass} w-[10%]`} />
          <Column header="Határidő" body={(task) => formatDate(task.dueDate)} headerClassName={`${headerClass} w-[10%]`} bodyClassName={`${cellClass} w-[10%] whitespace-nowrap`} />
          {hasActions && <Column header="Műveletek" body={actionTemplate} headerClassName={`${headerClass} w-[104px] !px-2 text-center`} bodyClassName={`${cellClass} w-[104px] !px-2`} />}
        </DataTable>
      </div>
      <nav className="mt-5 flex justify-center" aria-label="Feladatlista lapozása"><div className="inline-flex overflow-hidden rounded-md border border-[#d6dddc] bg-white"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="h-9 cursor-pointer border-0 border-r border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Előző</button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? "page" : undefined} className={`size-9 cursor-pointer border-0 border-r border-[#dfe4e3] text-xs ${number === currentPage ? "bg-[#f0f3f2] font-semibold" : "bg-white hover:bg-[#f7f8f8]"}`}>{number}</button>)}<button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)} className="h-9 cursor-pointer border-0 bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Következő</button></div></nav>
    </section>
  );
}
