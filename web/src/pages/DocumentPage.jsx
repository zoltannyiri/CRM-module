import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabView, TabPanel } from "primereact/tabview";

import DocumentFormComponent from "../components/document/DocumentFormComponent.jsx";
import DocumentListComponent from "../components/document/DocumentListComponent.jsx";
import DocumentShowComponent from "../components/document/DocumentShowComponent.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const lightControl =
  "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showError } = useToast();

  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [reloadKey, setReloadKey] = useState(0);

  const openCreate = () => {
    if (!hasPermission("DOCUMENTS_CREATE")) {
      showError("Nincs jogosultsága új dokumentum létrehozásához.", "Nincs jogosultság");
      return;
    }
    setActiveDoc(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (doc) => {
    if (!hasPermission("DOCUMENTS_EDIT")) {
      showError("Nincs jogosultsága a dokumentum módosításához.", "Nincs jogosultság");
      return;
    }
    setActiveDoc(doc);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleView = (doc) => {
    if (!hasPermission("DOCUMENTS_VIEW")) {
      showError("Nincs jogosultsága a dokumentum megtekintéséhez.", "Nincs jogosultság");
      return;
    }
    navigate(`/document/${doc.id}`);
  };

  // Show nézet, ha van :id
  if (id) {
    return (
      <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
        <Topbar />
        <div className="flex items-center justify-between border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/document")}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]"
            >
              <i className="pi pi-arrow-left text-xs text-[#748084]" aria-hidden="true" />
              Vissza a dokumentumokhoz
            </button>
            <span className="h-4 w-px bg-[#dbe1df]" />
            <h1 className="text-sm font-semibold text-[#253238]">Dokumentum adatlap</h1>
          </div>
        </div>
        <div className="px-5 py-6 lg:px-7">
          <TabView className="[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:m-0 [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:items-center [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-tabview-nav-link]:text-xs [&_.p-tabview-nav-link]:font-medium [&_.p-tabview-nav-link]:text-[#657276] [&_.p-tabview-nav-link]:transition-colors [&_.p-tabview-nav-link]:hover:text-[#202e33] [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-highlight_.p-tabview-nav-link]:font-semibold [&_.p-highlight_.p-tabview-nav-link]:text-[#202e33] [&_.p-tabview-panels]:p-0 [&_.p-tabview-panels]:pt-6">
            <TabPanel header="Alapadatok">
              <DocumentShowComponent key={`${id}-${reloadKey}`} documentId={id} onEdit={openEdit} />
            </TabPanel>
          </TabView>
        </div>
        {formOpen && (
          <DocumentFormComponent
            mode={formMode}
            document={activeDoc}
            onClose={() => setFormOpen(false)}
            onSaved={() => {
              setFormOpen(false);
              setReloadKey((value) => value + 1);
            }}
          />
        )}
      </div>
    );
  }

  // Lista nézet
  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar
        searchValue={query}
        onSearchChange={setQuery}
        onCreate={hasPermission("DOCUMENTS_CREATE") ? openCreate : undefined}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            aria-label="Dokumentum kategória"
            className={`${lightControl} min-w-[150px]`}>
            <option value="ALL">Minden kategória</option>
            <option value="Általános">Általános</option>
            <option value="Szerződés">Szerződés</option>
            <option value="Műszaki dokumentum">Műszaki dokumentum</option>
            <option value="Pénzügyi dokumentum">Pénzügyi dokumentum</option>
            <option value="Egyéb">Egyéb</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button
            type="button"
            onClick={() => setSortDirection((value) => (value === "desc" ? "asc" : "desc"))}
            className={`${lightControl} inline-flex min-w-[125px] items-center justify-between gap-3`}>
            Feltöltés{" "}
            <i
              className={`pi pi-chevron-down text-[10px] transition-transform ${
                sortDirection === "asc" ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>
          {hasPermission("DOCUMENTS_CREATE") && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]">
              Új dokumentum <i className="pi pi-chevron-down text-[10px]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="px-5 py-5">
        <DocumentListComponent
          query={query}
          categoryFilter={categoryFilter}
          sortDirection={sortDirection}
          reloadKey={reloadKey}
          onView={handleView}
          onEdit={openEdit}
          canView={hasPermission("DOCUMENTS_VIEW")}
          canEdit={hasPermission("DOCUMENTS_EDIT")}
          canDelete={hasPermission("DOCUMENTS_DELETE")}
          canDownload={hasPermission("DOCUMENTS_DOWNLOAD")}
        />
      </div>
      {formOpen && (
        <DocumentFormComponent
          mode={formMode}
          document={activeDoc}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            setReloadKey((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}
