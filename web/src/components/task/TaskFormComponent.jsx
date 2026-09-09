import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";
import { useAuth } from "../../hooks/useAuth.js";

const emptyForm = {
  title: "",
  projectId: "",
  assigneeMemberId: "",
  status: "TODO",
  priority: "MEDIUM",
  dueDate: "",
  description: "",
};

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

export default function TaskFormComponent({ mode = "create", task, defaultProjectId, canAssign = false, onClose, onSaved }) {
  const { showSuccess } = useToast();
  const { hasModule, hasPermission } = useAuth();
  const canUseProjects = Boolean(defaultProjectId) || (hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW"));
  const [formData, setFormData] = useState(() => {
    if (task) {
      return {
        title: task.title || "",
        projectId: task.projectId ? String(task.projectId) : "",
        assigneeMemberId: task.assigneeMemberId ? String(task.assigneeMemberId) : "",
        status: task.status || "TODO",
        priority: task.priority || "MEDIUM",
        dueDate: dateInputValue(task.dueDate),
        description: task.description || "",
      };
    }
    return { ...emptyForm, projectId: defaultProjectId ? String(defaultProjectId) : "" };
  });
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(canUseProjects);
  const [membersLoading, setMembersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isEditing = mode === "edit";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!canUseProjects) return undefined;
    let active = true;
    apiClient.get("/projects")
      .then(({ data }) => {
        if (active) setProjects(data);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "A projektek betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setProjectsLoading(false);
      });
    return () => { active = false; };
  }, [canUseProjects]);

  useEffect(() => {
    let active = true;
    apiClient.get("/members")
      .then(({ data }) => {
        if (active) setMembers(data);
      })
      .catch((requestError) => {
        if (active) setError(current => current || requestError.message || "A felelősök betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setMembersLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const payload = {
      title: formData.title.trim(),
      ...(canUseProjects ? { projectId: formData.projectId ? Number(formData.projectId) : null } : {}),
      ...(canAssign ? { assigneeMemberId: formData.assigneeMemberId ? Number(formData.assigneeMemberId) : null } : {}),
      status: formData.status,
      priority: formData.priority,
      dueDate: formData.dueDate || null,
      description: formData.description.trim() || null,
    };

    try {
      const response = isEditing
        ? await apiClient.patch(`/tasks/${task.id}`, payload)
        : await apiClient.post("/tasks", payload);
      onSaved?.(response.data);
      showSuccess(isEditing ? "A feladat adatai sikeresen módosultak." : "A feladat sikeresen létrejött.");
      onClose();
    } catch (requestError) {
      setError(requestError.message || "A feladat mentése sikertelen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="task-form-title">
      <button type="button" aria-label="Feladat űrlap bezárása" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />

      <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
        <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Feladatok</p>
            <h2 id="task-form-title" className="text-xl font-semibold text-[#253338]">{isEditing ? "Feladat szerkesztése" : "Új feladat"}</h2>
            <p className="mt-1.5 text-sm text-[#71807c]">{isEditing ? "Módosítsd a feladat adatait." : "Add meg az új feladat legfontosabb adatait."}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button>
        </header>

        <form id="task-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7">
          <div className="mx-auto grid max-w-3xl gap-7">
            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}>Feladat neve
                  <input name="title" value={formData.title} onChange={handleChange} className={fieldClass} placeholder="Feladat neve" required autoFocus />
                </label>
                {canUseProjects && <label className={labelClass}>Projekt
                  <select name="projectId" value={formData.projectId} onChange={handleChange} disabled={projectsLoading || (defaultProjectId && !isEditing)} className={`${fieldClass} disabled:cursor-wait disabled:bg-[#f5f7f6]`}>
                    <option value="">{projectsLoading ? "Projektek betöltése…" : "Nincs projekt hozzárendelve"}</option>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>}
                {canAssign && <label className={labelClass}>Felelős
                  <select name="assigneeMemberId" value={formData.assigneeMemberId} onChange={handleChange} disabled={membersLoading} className={`${fieldClass} disabled:cursor-wait disabled:bg-[#f5f7f6]`}>
                    <option value="">{membersLoading ? "Felelősök betöltése…" : "Nincs felelős"}</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.user?.firstName} {member.user?.lastName}</option>)}
                  </select>
                </label>}
                <label className={labelClass}>Státusz
                  <select name="status" value={formData.status} onChange={handleChange} className={fieldClass}>
                    <option value="TODO">Teendő</option>
                    <option value="IN_PROGRESS">Folyamatban</option>
                    <option value="BLOCKED">Blokkolt</option>
                    <option value="DONE">Kész</option>
                    <option value="CANCELLED">Megszakítva</option>
                  </select>
                </label>
                <label className={labelClass}>Prioritás
                  <select name="priority" value={formData.priority} onChange={handleChange} className={fieldClass}>
                    <option value="LOW">Alacsony</option>
                    <option value="MEDIUM">Közepes</option>
                    <option value="HIGH">Magas</option>
                    <option value="URGENT">Sürgős</option>
                  </select>
                </label>
                <label className={labelClass}>Határidő
                  <input type="date" name="dueDate" value={formData.dueDate} onChange={handleChange} className={fieldClass} />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>Leírás
                  <textarea name="description" value={formData.description} onChange={handleChange} rows="5" className={`${fieldClass} h-auto resize-y py-3`} placeholder="Rövid leírás a feladatról…" />
                </label>
              </div>
            </section>

            {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
          </div>
        </form>

        <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Mégse</button>
          <button type="submit" form="task-form" disabled={submitting || (canUseProjects && projectsLoading) || membersLoading} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Feladat létrehozása"}</button>
        </footer>
      </aside>
    </div>
  );
}
