import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabPanel, TabView } from "primereact/tabview";
import apiClient from "../api/apiClient.js";
import LeadListComponent from "../components/lead/LeadListComponent.jsx";
import LeadFormComponent from "../components/lead/LeadFormComponent.jsx";
import LeadShowComponent from "../components/lead/LeadShowComponent.jsx";
import { leadStatusLabels, leadSourceLabels, memberName } from "../components/lead/leadDisplay.js";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const lightControl = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9] disabled:cursor-wait disabled:opacity-60";
const tabsClass = "[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:m-0 [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-tabview-panels]:p-0 [&_.p-tabview-panels]:pt-6";

export default function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showError } = useToast();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [form, setForm] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const canCreate = hasPermission("LEADS_CREATE");

  useEffect(() => {
    if (id) return undefined;
    let active = true;
    apiClient.get("/members").then(({ data }) => { if (active) setMembers(data); })
      .catch(() => { if (active) setMembersError("A felelősök nem tölthetők be."); })
      .finally(() => { if (active) setMembersLoading(false); });
    return () => { active = false; };
  }, [id]);

  const openCreate = () => { if (canCreate) setForm({ mode: "create", lead: null }); };
  const openEdit = async (lead) => {
    if (!hasPermission("LEADS_EDIT")) return;
    try {
      const { data } = await apiClient.get(`/leads/${lead.id}`, { skipGlobalErrorToast: true });
      setForm({ mode: "edit", lead: data });
    } catch (error) { showError(error.response?.data?.message || "Az érdeklődő nem tölthető be."); }
  };
  const drawer = form && <LeadFormComponent {...form} onClose={() => setForm(null)} onSaved={() => setReloadKey((value) => value + 1)} />;

  if (id) return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar />
    <div className="flex items-center gap-3 border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><button type="button" onClick={() => navigate("/lead")} className={lightControl}>Vissza az érdeklődőkhöz</button><span className="h-4 w-px bg-[#dbe1df]" /><h1 className="text-sm font-semibold">Érdeklődő adatlap</h1></div>
    <div className="px-5 py-6 lg:px-7"><TabView className={tabsClass}><TabPanel header="Alapadatok"><LeadShowComponent key={`${id}-${reloadKey}`} leadId={id} onEdit={openEdit} /></TabPanel></TabView></div>
    {drawer}
  </div>;

  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar searchValue={query} onSearchChange={setQuery} onCreate={canCreate ? openCreate : undefined} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
      <div className="flex flex-wrap gap-2">
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={lightControl} aria-label="Státusz szűrő"><option value="ALL">Minden státusz</option>{Object.entries(leadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)} className={lightControl} aria-label="Forrás szűrő"><option value="ALL">Minden forrás</option>{Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={assignedMemberId} onChange={(event) => setAssignedMemberId(event.target.value)} disabled={membersLoading || Boolean(membersError)} className={lightControl} aria-label="Felelős szűrő"><option value="">Minden felelős</option>{members.map((member) => <option key={member.id} value={member.id}>{memberName(member)}</option>)}</select>
      </div>
      <div className="flex items-center gap-2"><span className="text-xs">Rendezés</span><button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={lightControl}>Létrehozás <i className={`pi pi-chevron-down ml-2 text-[10px] ${sortDirection === "asc" ? "rotate-180" : ""}`} aria-hidden="true" /></button>{canCreate && <button type="button" onClick={openCreate} className="h-9 cursor-pointer rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white">Új érdeklődő</button>}</div>
    </div>
    <div className="px-5 py-5">{membersError && <p role="alert" className="mb-4 text-xs text-[#9a4335]">{membersError}</p>}<LeadListComponent query={query} statusFilter={statusFilter} sourceFilter={sourceFilter} assignedMemberId={assignedMemberId} sortDirection={sortDirection} reloadKey={reloadKey} onView={(lead) => navigate(`/lead/${lead.id}`)} onEdit={openEdit} canView={hasPermission("LEADS_VIEW")} canEdit={hasPermission("LEADS_EDIT")} canDelete={hasPermission("LEADS_DELETE")} /></div>
    {drawer}
  </div>;
}
