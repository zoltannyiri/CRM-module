import { useState } from "react";

import ContactFormComponent from "../components/contact/ContactFormComponent.jsx";
import ContactExportMenu from "../components/contact/ContactExportMenu.jsx";
import ContactListComponent from "../components/contact/ContactListComponent.jsx";
import Topbar from "../components/Topbar.jsx";

const lightButton = "inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]";

export default function ContactPage() {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [sortDirection, setSortDirection] = useState("desc");
  const [formOpen, setFormOpen] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [listReloadKey, setListReloadKey] = useState(0);

  const handleCreateContact = () => {
    setActiveContact(null);
    setFormMode("create");
    setFormOpen(true);
  };
  const handleViewContact = (contact) => {
    setActiveContact(contact);
    setFormMode("view");
    setFormOpen(true);
  };
  const handleEditContact = (contact) => {
    setActiveContact(contact);
    setFormMode("edit");
    setFormOpen(true);
  };
  const handleCloseForm = () => setFormOpen(false);
  const handleContactSaved = () => setListReloadKey((value) => value + 1);

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar searchValue={query} onSearchChange={setQuery} onCreate={handleCreateContact} />

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7">
        <div className="flex items-center gap-2">
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} aria-label="A kapcsolattartó partnerének típusa" className={`${lightButton} min-w-[156px] outline-none`}>
            <option value="ALL">Minden partner</option>
            <option value="COMPANY">Céges partnerek</option>
            <option value="PERSON">Magánszemélyek</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="mr-1 text-xs">Rendezés</span>
          <button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={`${lightButton} min-w-[130px]`}>
            {sortDirection === "desc" ? "Legújabb elöl" : "Legrégebbi elöl"}
          </button>
          <ContactExportMenu query={query} typeFilter={typeFilter} sortDirection={sortDirection} buttonClassName={lightButton} />
          <button type="button" onClick={handleCreateContact} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]"><i className="pi pi-plus text-[10px]" aria-hidden="true" />Új kapcsolattartó</button>
        </div>
      </div>

      <div className="px-5 py-5">
        <ContactListComponent query={query} typeFilter={typeFilter} sortDirection={sortDirection} reloadKey={listReloadKey} onView={handleViewContact} onEdit={handleEditContact} />
      </div>

      {formOpen && <ContactFormComponent mode={formMode} contact={activeContact} onClose={handleCloseForm} onSaved={handleContactSaved} />}
    </div>
  );
}
