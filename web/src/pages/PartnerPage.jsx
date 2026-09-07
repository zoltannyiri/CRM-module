import { useState } from "react";
import PartnerFormComponent from "../components/partner/PartnerFormComponent.jsx";
import PartnerExportMenu from "../components/partner/PartnerExportMenu.jsx";
import PartnerListComponent from "../components/partner/PartnerListComponent.jsx";
import Topbar from "../components/Topbar.jsx";

const iconPaths = {
  filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
  chevron: <path d="m8 10 4 4 4-4" />,
};

function Icon({ name, className = "size-4" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

const lightButton = "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function PartnerPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activePartner, setActivePartner] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [listReloadKey, setListReloadKey] = useState(0);

  const handleCreatePartner = () => {
    setActivePartner(null);
    setFormMode("create");
    setFormOpen(true);
  };
  const handleViewPartner = (partner) => {
    setActivePartner(partner);
    setFormMode("view");
    setFormOpen(true);
  };
  const handleEditPartner = (partner) => {
    setActivePartner(partner);
    setFormMode("edit");
    setFormOpen(true);
  };
  const handleCloseForm = () => setFormOpen(false);
  const handlePartnerSaved = () => setListReloadKey((value) => value + 1);

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={handleCreatePartner} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex items-center gap-2">
          <div className="relative"><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="Partner típus" className={`${lightButton} min-w-[128px] appearance-none pr-9 outline-none`}><option value="ALL">Összes partner</option><option value="COMPANY">Cégek</option><option value="PERSON">Magánszemélyek</option></select><Icon name="chevron" className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2" /></div>
          <button type="button" className={lightButton}><Icon name="filter" className="size-3.5 text-[#748084]" />Szűrés</button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={`${lightButton} min-w-[125px] justify-between`}>Létrehozás<Icon name="chevron" className={`size-3.5 transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`} /></button>
          <PartnerExportMenu query={query} typeFilter={typeFilter} sortDirection={sortDirection} buttonClassName={lightButton} />
          <button type="button" onClick={handleCreatePartner} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]">Új partner<Icon name="chevron" className="size-3.5" /></button>
        </div>
      </div>

      <div className="px-5 py-5">
        <PartnerListComponent query={query} typeFilter={typeFilter} sortDirection={sortDirection} reloadKey={listReloadKey} onView={handleViewPartner} onEdit={handleEditPartner} />
      </div>

      {formOpen && <PartnerFormComponent mode={formMode} partner={activePartner} onClose={handleCloseForm} onSaved={handlePartnerSaved} />}
    </div>
  );
}
