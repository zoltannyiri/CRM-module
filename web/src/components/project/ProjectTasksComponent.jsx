import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import TaskFormComponent from "../task/TaskFormComponent.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

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

export default function ProjectTasksComponent({ projectId }) {
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  const canCreate = hasPermission("TASKS_CREATE");
  const canEdit = hasPermission("TASKS_EDIT");
  const canDelete = hasPermission("TASKS_DELETE");
  const canAssign = hasPermission("TASKS_ASSIGN");
  const hasActions = canEdit || canDelete;
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [deletingId, setDeletingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.get("/tasks", { params: { projectId } })
      .then(({ data }) => {
        if (active) {
          setTasks(data);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("A feladatok nem tölthetők be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, reloadKey]);

  const reloadTasks = () => {
    setLoading(true);
    setError("");
    setReloadKey((value) => value + 1);
  };

  const openCreate = () => {
    if (!canCreate) {
      showError("Nincs jogosultsága új feladat létrehozásához.", "Nincs jogosultság");
      return;
    }
    setActiveTask(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (task) => {
    if (!canEdit) {
      showError("Nincs jogosultsága a feladat módosításához.", "Nincs jogosultság");
      return;
    }
    setActiveTask(task);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    reloadTasks();
  };

  const handleDelete = async (task) => {
    if (!canDelete) {
      showError("Nincs jogosultsága a feladat törléséhez.", "Nincs jogosultság");
      return;
    }
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a feladatot: ${task.title}?`)) return;

    setDeletingId(task.id);
    setError("");
    try {
      await apiClient.delete(`/tasks/${task.id}`);
      setTasks((current) => current.filter(({ id }) => id !== task.id));
      showSuccess("A feladat sikeresen törölve.");
    } catch {
      setError("A feladat törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-labelledby="project-tasks-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="project-tasks-title" className="text-base font-semibold text-[#29383d]">Feladatok</h2>
          <p className="mt-1 text-xs text-[#71807c]">A projekthez tartozó feladatok és állapotuk.</p>
        </div>
        {canCreate && <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#68aa6e]">
          <i className="pi pi-plus text-[10px]" aria-hidden="true" />
          Új feladat
        </button>}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#dbe1df] bg-white" aria-busy={loading}>
        <div className={`hidden ${hasActions ? "grid-cols-[minmax(150px,1.5fr)_90px_90px_minmax(110px,.9fr)_100px_108px]" : "grid-cols-[minmax(150px,1.5fr)_90px_90px_minmax(110px,.9fr)_100px]"} border-b border-[#dbe1df] bg-[#fafbfb] px-4 text-[11px] font-medium text-[#657276] md:grid`}>
          <span className="py-3">Feladat</span>
          <span className="py-3">Státusz</span>
          <span className="py-3">Prioritás</span>
          <span className="py-3">Felelős</span>
          <span className="py-3">Határidő</span>
          {hasActions && <span className="py-3 text-center">Műveletek</span>}
        </div>

        {loading ? (
          <div className="grid min-h-40 place-items-center" role="status" aria-label="Feladatok betöltése">
            <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="grid min-h-40 place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-medium text-[#8f3f34]">{error}</p>
              <button type="button" onClick={reloadTasks} className="mt-3 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 py-2 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Újrapróbálás</button>
            </div>
          </div>
        ) : tasks.length === 0 ? (
          <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#eff6ee] text-[#69a46e]"><i className="pi pi-check-circle text-base" aria-hidden="true" /></span>
              <p className="mt-4 text-sm font-medium text-[#344247]">Ehhez a projekthez még nincs feladat.</p>
              {canCreate && <button type="button" onClick={openCreate} className="mt-4 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white hover:bg-[#68aa6e]"><i className="pi pi-plus text-[10px]" aria-hidden="true" />Új feladat</button>}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#e4e9e7]">
            {tasks.map((task) => {
              return (
                <div key={task.id} className={`grid gap-2 px-4 py-3.5 text-xs text-[#344247] transition-colors hover:bg-[#fafcfc] ${hasActions ? "md:grid-cols-[minmax(150px,1.5fr)_90px_90px_minmax(110px,.9fr)_100px_108px]" : "md:grid-cols-[minmax(150px,1.5fr)_90px_90px_minmax(110px,.9fr)_100px]"} md:items-center md:gap-0`}>
                  {canEdit ? <button type="button" onClick={() => openEdit(task)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#263338] hover:underline truncate mr-2">{task.title}</button> : <span className="truncate mr-2 font-semibold text-[#263338]">{task.title}</span>}
                  <span><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClasses[task.status]}`}>{statusLabels[task.status]}</span></span>
                  <span><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${priorityClasses[task.priority]}`}>{priorityLabels[task.priority]}</span></span>
                  <span className="truncate mr-2">{task.assigneeMember?.user ? `${task.assigneeMember.user.firstName} ${task.assigneeMember.user.lastName}` : "—"}</span>
                  <span className="whitespace-nowrap">{formatDate(task.dueDate)}</span>
                  {hasActions && (
                    <div className="flex items-center gap-1 md:justify-center">
                      {canEdit && <button type="button" onClick={() => openEdit(task)} aria-label={`${task.title} szerkesztése`} title="Szerkesztés" className={actionButtonClass}><i className="pi pi-pencil pointer-events-none" aria-hidden="true" /></button>}
                      {canDelete && <button type="button" onClick={() => handleDelete(task)} disabled={deletingId === task.id} aria-label={`${task.title} törlése`} title="Törlés" className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}><i className={`pi ${deletingId === task.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none`} aria-hidden="true" /></button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <TaskFormComponent
          mode={formMode}
          task={activeTask}
          defaultProjectId={projectId}
          canAssign={canAssign}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
