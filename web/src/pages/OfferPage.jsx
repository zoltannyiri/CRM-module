import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabPanel, TabView } from "primereact/tabview";

import apiClient from "../api/apiClient.js";
import OfferFormComponent from "../components/offer/OfferFormComponent.jsx";
import OfferListComponent from "../components/offer/OfferListComponent.jsx";
import OfferShowComponent from "../components/offer/OfferShowComponent.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const lightControl = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";
const tabsClass = "[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:m-0 [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-tabview-panels]:p-0 [&_.p-tabview-panels]:pt-6";

export default function OfferPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasModule, hasPermission } = useAuth();
  const { showError } = useToast();
  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canUseProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");
  const canCreate = hasPermission("OFFERS_CREATE") && canUsePartners;
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [partnerFilter, setPartnerFilter] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [sortDirection, setSortDirection] = useState("desc");
  const [partners, setPartners] = useState([]);
  const [projects, setProjects] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (id) return undefined;
    let active = true;
    Promise.all([
      canUsePartners ? apiClient.get("/partners") : Promise.resolve({ data: [] }),
      canUseProjects ? apiClient.get("/projects") : Promise.resolve({ data: [] }),
    ]).then(([partnerResponse, projectResponse]) => {
      if (active) { setPartners(partnerResponse.data); setProjects(projectResponse.data); }
    }).catch(() => {});
    return () => { active = false; };
  }, [canUsePartners, canUseProjects, id]);

  const openCreate = () => {
    if (!canCreate) {
      showError("Ajánlat létrehozásához létrehozási és partner megtekintési jogosultság szükséges.", "Nincs jogosultság");
      return;
    }
    setActiveOffer(null); setFormMode("create"); setFormOpen(true);
  };

  const openEdit = async (offer) => {
    if (!hasPermission("OFFERS_EDIT")) return;
    try {
      const { data } = await apiClient.get(`/offers/${offer.id}`, { skipGlobalErrorToast: true });
      setActiveOffer(data); setFormMode("edit"); setFormOpen(true);
    } catch (error) { showError(error.response?.data?.message || "Az ajánlat nem tölthető be."); }
  };

  const onSaved = () => { setFormOpen(false); setReloadKey((value) => value + 1); };

  if (id) {
    return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar />
      <div className="flex items-center gap-3 border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><button type="button" onClick={() => navigate("/offer")} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium"><i className="pi pi-arrow-left text-xs" aria-hidden="true" />Vissza az ajánlatokhoz</button><span className="h-4 w-px bg-[#dbe1df]" /><h1 className="text-sm font-semibold">Ajánlat adatlap</h1></div>
      <div className="px-5 py-6 lg:px-7"><TabView className={tabsClass}><TabPanel header="Alapadatok"><OfferShowComponent key={`${id}-${reloadKey}`} offerId={id} onEdit={openEdit} /></TabPanel></TabView></div>
      {formOpen && <OfferFormComponent mode="edit" offer={activeOffer} onClose={() => setFormOpen(false)} onSaved={onSaved} />}
    </div>;
  }

  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar searchValue={query} onSearchChange={setQuery} onCreate={canCreate ? openCreate : undefined} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><div className="flex flex-wrap gap-2"><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${lightControl} min-w-[145px]`} aria-label="Ajánlatstátusz"><option value="ALL">Minden státusz</option><option value="DRAFT">Piszkozat</option><option value="SENT">Elküldve</option><option value="ACCEPTED">Elfogadva</option><option value="REJECTED">Elutasítva</option><option value="EXPIRED">Lejárt</option><option value="CANCELLED">Visszavonva</option></select>{canUsePartners && <select value={partnerFilter} onChange={(event) => setPartnerFilter(event.target.value)} className={`${lightControl} min-w-[160px]`} aria-label="Partner szűrő"><option value="">Minden partner</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select>}{canUseProjects && <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className={`${lightControl} min-w-[160px]`} aria-label="Projekt szűrő"><option value="">Minden projekt</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>}</div><div className="flex items-center gap-2"><span className="text-xs">Rendezés</span><button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={`${lightControl} inline-flex min-w-[125px] items-center justify-between`}>Létrehozás <i className={`pi pi-chevron-down text-[10px] ${sortDirection === "asc" ? "rotate-180" : ""}`} aria-hidden="true" /></button>{canCreate && <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white">Új ajánlat <i className="pi pi-chevron-down text-[10px]" aria-hidden="true" /></button>}</div></div>
    <div className="px-5 py-5"><OfferListComponent query={query} statusFilter={statusFilter} partnerId={partnerFilter} projectId={projectFilter} sortDirection={sortDirection} reloadKey={reloadKey} onView={(offer) => navigate(`/offer/${offer.id}`)} onEdit={openEdit} canView={hasPermission("OFFERS_VIEW")} canEdit={hasPermission("OFFERS_EDIT")} canDelete={hasPermission("OFFERS_DELETE")} /></div>
    {formOpen && <OfferFormComponent mode={formMode} offer={activeOffer} onClose={() => setFormOpen(false)} onSaved={onSaved} />}
  </div>;
}
