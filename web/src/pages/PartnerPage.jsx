import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";

import PartnerFormComponent from "../components/partner/PartnerFormComponent.jsx";
import PartnerExportMenu from "../components/partner/PartnerExportMenu.jsx";
import PartnerListComponent from "../components/partner/PartnerListComponent.jsx";
import PartnerShowComponent from "../components/partner/PartnerShowComponent.jsx";
import PartnerContactsComponent from "../components/partner/PartnerContactsComponent.jsx";
import Topbar from "../components/Topbar.jsx";

const iconPaths = {
  filter: <path d="M4 6h16M7 12h10m-7 6h4" />,
  chevron: <path d="m8 10 4 4 4-4" />,
};

function Icon({ name, className = "size-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

const lightButton =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

function getStoredViewMode() {
  try {
    const stored = localStorage.getItem("partnerViewMode");
    return stored === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

export default function PartnerPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activePartner, setActivePartner] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [listReloadKey, setListReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState(getStoredViewMode);

  const handleViewModeChange = (mode) => {
    if (mode === "table" || mode === "cards") {
      setViewMode(mode);
      try {
        localStorage.setItem("partnerViewMode", mode);
      } catch {
        // ignore storage errors
      }
    }
  };

  const handleCreatePartner = () => {
    setActivePartner(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const handleViewPartner = (partner) => {
    navigate(`/partner/${partner.id}`);
  };

  const handleEditPartner = (partner) => {
    setActivePartner(partner);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleCloseForm = () => setFormOpen(false);
  const handlePartnerSaved = () => setListReloadKey((value) => value + 1);

  // SHOW NÉZET: ha az URL tartalmaz partner id-t (/partner/:id)
  if (id) {
    return (
      <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
        <Topbar />

        <div className="flex items-center justify-between border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/partner")}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]"
            >
              <i className="pi pi-arrow-left text-xs text-[#748084]" aria-hidden="true" />
              Vissza a partnerekhez
            </button>
            <span className="h-4 w-px bg-[#dbe1df]" />
            <h1 className="text-sm font-semibold text-[#253238]">Partner adatlap</h1>
          </div>
        </div>

        <div className="px-5 py-6 lg:px-7">
          <TabView
            className="[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-nav]:m-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:items-center [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-tabview-nav-link]:text-xs [&_.p-tabview-nav-link]:font-medium [&_.p-tabview-nav-link]:text-[#657276] [&_.p-tabview-nav-link]:transition-colors [&_.p-tabview-nav-link]:hover:text-[#202e33] [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-highlight_.p-tabview-nav-link]:font-semibold [&_.p-highlight_.p-tabview-nav-link]:text-[#202e33] [&_.p-tabview-panels]:pt-6 [&_.p-tabview-panels]:p-0"
          >
            <TabPanel header="Alapadatok">
              <PartnerShowComponent partnerId={id} />
            </TabPanel>
            <TabPanel header="Kapcsolattartók">
              <PartnerContactsComponent key={id} partnerId={id} />
            </TabPanel>
          </TabView>
        </div>
      </div>
    );
  }

  // LISTA / KÁRTYA NÉZET: ha nincs id a paraméterekben (/partner)
  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={handleCreatePartner} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Partner típus"
              className={`${lightButton} min-w-[128px] appearance-none pr-9 outline-none`}
            >
              <option value="ALL">Összes partner</option>
              <option value="COMPANY">Cégek</option>
              <option value="PERSON">Magánszemélyek</option>
            </select>
            <Icon
              name="chevron"
              className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2"
            />
          </div>
          <button type="button" className={lightButton}>
            <Icon name="filter" className="size-3.5 text-[#748084]" />
            Szűrés
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button
            type="button"
            onClick={() => setSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
            className={`${lightButton} min-w-[125px] justify-between`}
          >
            Létrehozás
            <Icon
              name="chevron"
              className={`size-3.5 transition-transform ${sortDirection === "asc" ? "rotate-180" : ""}`}
            />
          </button>

          <PartnerExportMenu
            query={query}
            typeFilter={typeFilter}
            sortDirection={sortDirection}
            buttonClassName={lightButton}
          />

          {/* Table / Cards nézetváltó kapcsoló */}
          <div
            className="inline-flex h-9 items-center rounded-md border border-[#d6dddc] bg-white p-0.5 shadow-[0_1px_1px_rgba(26,39,35,.025)]"
            role="group"
            aria-label="Nézetváltás"
          >
            <button
              type="button"
              onClick={() => handleViewModeChange("table")}
              aria-label="Táblázat nézet"
              title="Táblázat nézet"
              aria-pressed={viewMode === "table"}
              className={`grid size-8 cursor-pointer place-items-center rounded-[5px] text-xs transition-colors ${
                viewMode === "table"
                  ? "bg-[#eff6ee] font-semibold text-[#3c7547]"
                  : "bg-transparent text-[#657276] hover:bg-[#f7f8f8] hover:text-[#202e33]"
              }`}
            >
              <i className="pi pi-list" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => handleViewModeChange("cards")}
              aria-label="Kártya nézet"
              title="Kártya nézet"
              aria-pressed={viewMode === "cards"}
              className={`grid size-8 cursor-pointer place-items-center rounded-[5px] text-xs transition-colors ${
                viewMode === "cards"
                  ? "bg-[#eff6ee] font-semibold text-[#3c7547]"
                  : "bg-transparent text-[#657276] hover:bg-[#f7f8f8] hover:text-[#202e33]"
              }`}
            >
              <i className="pi pi-th-large" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleCreatePartner}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]"
          >
            Új partner
            <Icon name="chevron" className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="px-5 py-5">
        <PartnerListComponent
          query={query}
          typeFilter={typeFilter}
          sortDirection={sortDirection}
          viewMode={viewMode}
          reloadKey={listReloadKey}
          onView={handleViewPartner}
          onEdit={handleEditPartner}
        />
      </div>

      {formOpen && (
        <PartnerFormComponent
          mode={formMode}
          partner={activePartner}
          onClose={handleCloseForm}
          onSaved={handlePartnerSaved}
        />
      )}
    </div>
  );
}
