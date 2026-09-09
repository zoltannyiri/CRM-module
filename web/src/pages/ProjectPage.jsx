import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabPanel, TabView } from "primereact/tabview";

import apiClient from "../api/apiClient.js";
import ProjectFormComponent from "../components/project/ProjectFormComponent.jsx";
import ProjectListComponent from "../components/project/ProjectListComponent.jsx";
import ProjectShowComponent from "../components/project/ProjectShowComponent.jsx";
import ProjectTasksComponent from "../components/project/ProjectTasksComponent.jsx";
import ProjectActivityComponent from "../components/project/ProjectActivityComponent.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";

const lightControl = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function ProjectPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasModule, hasPermission } = useAuth();
  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [partners, setPartners] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (id || !canUsePartners) return undefined;
    let active = true;
    apiClient.get("/partners").then(({ data }) => {
      if (active) setPartners(data);
    }).catch(() => {});
    return () => { active = false; };
  }, [id, canUsePartners]);

  const openCreate = () => {
    setActiveProject(null);
    setFormMode("create");
    setFormOpen(true);
  };
  const openEdit = (project) => {
    setActiveProject(project);
    setFormMode("edit");
    setFormOpen(true);
  };

  if (id) {
    return (
      <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
        <Topbar />
        <div className="flex items-center justify-between border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => navigate("/project")} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]">
              <i className="pi pi-arrow-left text-xs text-[#748084]" aria-hidden="true" />
              Vissza a projektekhez
            </button>
            <span className="h-4 w-px bg-[#dbe1df]" />
            <h1 className="text-sm font-semibold text-[#253238]">Projekt adatlap</h1>
          </div>
        </div>
        <div className="px-5 py-6 lg:px-7">
          <TabView className="[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:m-0 [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:items-center [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-tabview-nav-link]:text-xs [&_.p-tabview-nav-link]:font-medium [&_.p-tabview-nav-link]:text-[#657276] [&_.p-tabview-nav-link]:transition-colors [&_.p-tabview-nav-link]:hover:text-[#202e33] [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-highlight_.p-tabview-nav-link]:font-semibold [&_.p-highlight_.p-tabview-nav-link]:text-[#202e33] [&_.p-tabview-panels]:p-0 [&_.p-tabview-panels]:pt-6">
            <TabPanel header="Alapadatok">
              <ProjectShowComponent projectId={id} />
            </TabPanel>
            {hasModule("TASKS") && hasPermission("TASKS_VIEW") && (
              <TabPanel header="Feladatok">
                <ProjectTasksComponent projectId={id} />
              </TabPanel>
            )}
            {hasPermission("ACTIVITY_VIEW") && <TabPanel header="Tevékenységek">
              <ProjectActivityComponent projectId={id} />
            </TabPanel>}
          </TabView>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={hasPermission("PROJECTS_CREATE") ? openCreate : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Projektstátusz" className={`${lightControl} min-w-[150px]`}>
            <option value="ALL">Minden státusz</option>
            <option value="PLANNED">Tervezett</option>
            <option value="ACTIVE">Aktív</option>
            <option value="ON_HOLD">Szüneteltetve</option>
            <option value="COMPLETED">Befejezve</option>
            <option value="CANCELLED">Megszakítva</option>
          </select>
          {canUsePartners && <select value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)} aria-label="Projektpartnerek" className={`${lightControl} min-w-[170px]`}>
            <option value="">Minden partner</option>
            {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
          </select>}
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={`${lightControl} inline-flex min-w-[125px] items-center justify-between gap-3`}>Létrehozás <i className={`pi pi-chevron-down text-[10px] transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`} aria-hidden="true" /></button>
          {hasPermission("PROJECTS_CREATE") && <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]">Új projekt <i className="pi pi-chevron-down text-[10px]" aria-hidden="true" /></button>}
        </div>
      </div>
      <div className="px-5 py-5">
        <ProjectListComponent query={query} statusFilter={statusFilter} partnerFilter={partnerFilter} sortDirection={sortDirection} reloadKey={reloadKey} onView={(project) => navigate(`/project/${project.id}`)} onEdit={openEdit} canEdit={hasPermission("PROJECTS_EDIT")} canDelete={hasPermission("PROJECTS_DELETE")} />
      </div>
      {formOpen && <ProjectFormComponent mode={formMode} project={activeProject} onClose={() => setFormOpen(false)} onSaved={() => setReloadKey((value) => value + 1)} />}
    </div>
  );
}
