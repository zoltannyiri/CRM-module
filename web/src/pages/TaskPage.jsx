import { useEffect, useState } from "react";
import apiClient from "../api/apiClient.js";
import TaskFormComponent from "../components/task/TaskFormComponent.jsx";
import TaskListComponent from "../components/task/TaskListComponent.jsx";
import Topbar from "../components/Topbar.jsx";

const lightControl = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function TaskPage() {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [projectFilter, setProjectFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activeTask, setActiveTask] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [reloadKey, setReloadKey] = useState(0);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);

  useEffect(() => {
    let active = true;
    apiClient.get("/projects").then(({ data }) => {
      if (active) setProjects(data);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    apiClient.get("/members").then(({ data }) => {
      if (active) setMembers(data);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  const openCreate = () => {
    setActiveTask(null);
    setFormMode("create");
    setFormOpen(true);
  };
  const openEdit = (task) => {
    setActiveTask(task);
    setFormMode("edit");
    setFormOpen(true);
  };

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={openCreate} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Feladatstátusz" className={`${lightControl} min-w-[150px]`}>
            <option value="ALL">Minden státusz</option>
            <option value="TODO">Teendő</option>
            <option value="IN_PROGRESS">Folyamatban</option>
            <option value="BLOCKED">Blokkolt</option>
            <option value="DONE">Kész</option>
            <option value="CANCELLED">Megszakítva</option>
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Prioritás" className={`${lightControl} min-w-[150px]`}>
            <option value="ALL">Minden prioritás</option>
            <option value="LOW">Alacsony</option>
            <option value="MEDIUM">Közepes</option>
            <option value="HIGH">Magas</option>
            <option value="URGENT">Sürgős</option>
          </select>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Projektek" className={`${lightControl} min-w-[170px]`}>
            <option value="">Minden projekt</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} aria-label="Felelősök" className={`${lightControl} min-w-[170px]`}>
            <option value="">Minden felelős</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.user?.firstName} {member.user?.lastName}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={`${lightControl} inline-flex min-w-[125px] items-center justify-between gap-3`}>Létrehozás <i className={`pi pi-chevron-down text-[10px] transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`} aria-hidden="true" /></button>
          <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]">Új feladat <i className="pi pi-chevron-down text-[10px]" aria-hidden="true" /></button>
        </div>
      </div>
      <div className="px-5 py-5">
        <TaskListComponent query={query} statusFilter={statusFilter} priorityFilter={priorityFilter} projectFilter={projectFilter} assigneeFilter={assigneeFilter} sortDirection={sortDirection} reloadKey={reloadKey} onEdit={openEdit} />
      </div>
      {formOpen && <TaskFormComponent mode={formMode} task={activeTask} onClose={() => setFormOpen(false)} onSaved={() => setReloadKey((value) => value + 1)} />}
    </div>
  );
}
