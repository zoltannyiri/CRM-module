import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";

import ContactFormComponent from "../components/contact/ContactFormComponent.jsx";
import ContactExportMenu from "../components/contact/ContactExportMenu.jsx";
import ContactListComponent from "../components/contact/ContactListComponent.jsx";
import ContactShowComponent from "../components/contact/ContactShowComponent.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const lightButton =
  "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

function getStoredViewMode() {
  try {
    const stored = localStorage.getItem("contactViewMode");
    return stored === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

export default function ContactPage() {
  const { hasPermission } = useAuth();
  const { showError } = useToast();
  const { id } = useParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [listReloadKey, setListReloadKey] = useState(0);
  const [viewMode, setViewMode] = useState(getStoredViewMode);

  const handleViewModeChange = (mode) => {
    if (mode === "table" || mode === "cards") {
      setViewMode(mode);
      try {
        localStorage.setItem("contactViewMode", mode);
      } catch {
        // ignore storage errors
      }
    }
  };

  const handleCreateContact = () => {
    if (!hasPermission("PARTNERS_CREATE")) {
      showError("Nincs jogosultsága új kapcsolattartó létrehozásához.", "Nincs jogosultság");
      return;
    }
    setActiveContact(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const handleViewContact = (contact) => {
    if (!hasPermission("PARTNERS_VIEW")) {
      showError("Nincs jogosultsága a kapcsolattartó megtekintéséhez.", "Nincs jogosultság");
      return;
    }
    navigate(`/contact/${contact.id}`);
  };

  const handleEditContact = (contact) => {
    if (!hasPermission("PARTNERS_EDIT")) {
      showError("Nincs jogosultsága a kapcsolattartó módosításához.", "Nincs jogosultság");
      return;
    }
    setActiveContact(contact);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleCloseForm = () => setFormOpen(false);
  const handleContactSaved = () => setListReloadKey((value) => value + 1);

  // SHOW NÉZET: ha az URL tartalmaz kapcsolattartó id-t (/contact/:id)
  if (id) {
    return (
      <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
        <Topbar />

        <div className="flex items-center justify-between border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/contact")}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]"
            >
              <i className="pi pi-arrow-left text-xs text-[#748084]" aria-hidden="true" />
              Vissza a kapcsolattartókhoz
            </button>
            <span className="h-4 w-px bg-[#dbe1df]" />
            <h1 className="text-sm font-semibold text-[#253238]">Kapcsolattartó adatlap</h1>
          </div>
        </div>

        <div className="px-5 py-6 lg:px-7">
          <TabView
            className="[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-nav]:m-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:items-center [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-tabview-nav-link]:text-xs [&_.p-tabview-nav-link]:font-medium [&_.p-tabview-nav-link]:text-[#657276] [&_.p-tabview-nav-link]:transition-colors [&_.p-tabview-nav-link]:hover:text-[#202e33] [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-highlight_.p-tabview-nav-link]:font-semibold [&_.p-highlight_.p-tabview-nav-link]:text-[#202e33] [&_.p-tabview-panels]:pt-6 [&_.p-tabview-panels]:p-0"
          >
            <TabPanel header="Alapadatok">
              <ContactShowComponent contactId={id} />
            </TabPanel>
          </TabView>
        </div>
      </div>
    );
  }

  // LISTA / KÁRTYA NÉZET: ha nincs id a paraméterekben (/contact)
  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={hasPermission("PARTNERS_CREATE") ? handleCreateContact : undefined} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="A kapcsolattartó partnerének típusa"
            className={`${lightButton} min-w-[156px] outline-none`}
          >
            <option value="ALL">Minden partner</option>
            <option value="COMPANY">Céges partnerek</option>
            <option value="PERSON">Magánszemélyek</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button
            type="button"
            onClick={() => setSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
            className={`${lightButton} min-w-[130px]`}
          >
            {sortDirection === "desc" ? "Legújabb elöl" : "Legrégebbi elöl"}
          </button>

          <ContactExportMenu
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

          {hasPermission("PARTNERS_CREATE") && (
            <button
              type="button"
              onClick={handleCreateContact}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]"
            >
              <i className="pi pi-plus text-[10px]" aria-hidden="true" />
              Új kapcsolattartó
            </button>
          )}
        </div>
      </div>

      <div className="px-5 py-5">
        <ContactListComponent
          query={query}
          typeFilter={typeFilter}
          sortDirection={sortDirection}
          viewMode={viewMode}
          reloadKey={listReloadKey}
          onView={handleViewContact}
          onEdit={handleEditContact}
          canView={hasPermission("PARTNERS_VIEW")}
          canEdit={hasPermission("PARTNERS_EDIT")}
          canDelete={hasPermission("PARTNERS_DELETE")}
        />
      </div>

      {formOpen && (
        <ContactFormComponent
          mode={formMode}
          contact={activeContact}
          onClose={handleCloseForm}
          onSaved={handleContactSaved}
        />
      )}
    </div>
  );
}
