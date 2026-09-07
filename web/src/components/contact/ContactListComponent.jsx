import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";

const iconPaths = {
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
};

function Icon({ name, className = "size-4" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export default function ContactListComponent({ query = "", typeFilter = "ALL", sortDirection = "desc", reloadKey = 0, onView, onEdit }) {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const rowsPerPage = 10;

  useEffect(() => {
    let active = true;

    apiClient.get("/contacts")
      .then(({ data }) => {
        if (active) {
          setContacts(data);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message || "A kapcsolattartók betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("hu");
    const filtered = contacts.filter((contact) => {
      const typeMatches = typeFilter === "ALL" || contact.partner.type === typeFilter;
      const fullName = `${contact.firstName} ${contact.lastName}`;
      const queryMatches = !needle || [fullName, contact.partner.name, contact.position, contact.email, contact.phone]
        .some((value) => value?.toLocaleLowerCase("hu").includes(needle));
      return typeMatches && queryMatches;
    });
    return [...filtered].sort((a, b) => sortDirection === "asc" ? a.id - b.id : b.id - a.id);
  }, [contacts, query, sortDirection, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredContacts.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = filteredContacts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggleAll = () => {
    setSelected((current) => allSelected
      ? current.filter((id) => !visibleIds.includes(id))
      : [...new Set([...current, ...visibleIds])]);
  };

  const toggleContact = (contact) => {
    setSelected((current) => current.includes(contact.id)
      ? current.filter((id) => id !== contact.id)
      : [...current, contact.id]);
  };

  const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
  const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
  const checkboxTemplate = (contact) => <input type="checkbox" checked={selected.includes(contact.id)} onChange={() => toggleContact(contact)} aria-label={`${contact.firstName} ${contact.lastName} kijelölése`} className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />;
  const nameTemplate = (contact) => {
    const initials = `${contact.firstName[0] || ""}${contact.lastName[0] || ""}`.toUpperCase();
    return <div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-[11px] font-medium text-[#517057]">{initials}</span><button type="button" onClick={() => onView?.(contact)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[#263338] hover:underline">{contact.firstName} {contact.lastName}</button></div>;
  };
  const handleDelete = async (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a kapcsolattartót: ${fullName}?`)) return;

    setDeletingId(contact.id);
    setLoadError("");
    try {
      await apiClient.delete(`/contacts/${contact.id}`);
      setContacts((current) => current.filter(({ id }) => id !== contact.id));
      setSelected((current) => current.filter((id) => id !== contact.id));
    } catch (error) {
      setLoadError(error.message || "A kapcsolattartó törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };
  const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";
  const actionTemplate = (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    return <div className="flex items-center justify-center gap-1 whitespace-nowrap">
      <button type="button" onClick={() => onView?.(contact)} aria-label={`${fullName} megtekintése`} title="Megtekintés" className={actionButtonClass}><i className="pi pi-eye" aria-hidden="true" /></button>
      <button type="button" onClick={() => onEdit?.(contact)} aria-label={`${fullName} módosítása`} title="Módosítás" className={actionButtonClass}><i className="pi pi-pencil" aria-hidden="true" /></button>
      <button type="button" onClick={() => handleDelete(contact)} disabled={deletingId === contact.id} aria-label={`${fullName} törlése`} title="Törlés" className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}><i className={`pi ${deletingId === contact.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" /></button>
    </div>;
  };

  return (
    <section className="bg-[#f3f5f6] px-5 pb-5" aria-labelledby="contact-list-title">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Kapcsolatok</p>
          <h2 id="contact-list-title" className="text-base font-semibold text-[#29383d]">Kapcsolattartók</h2>
        </div>
        <span className="text-xs text-[#7b8885]">{filteredContacts.length} találat</span>
      </div>

      {selected.length > 0 && <div className="rounded-t-lg border-x border-t border-[#dbe1df] bg-white px-4 py-2.5 text-xs font-medium text-[#4f7954]">{selected.length} kapcsolattartó kiválasztva</div>}

      <div className={`relative overflow-x-auto border border-[#dbe1df] bg-white ${selected.length > 0 ? "rounded-b-2xl" : "rounded-2xl"}`} aria-busy={loading}>
        {loading && <div className="absolute inset-x-0 top-12 bottom-0 z-10 grid place-items-center bg-white" role="status" aria-label="Kapcsolattartó-lista betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
        <DataTable
          value={visible}
          dataKey="id"
          unstyled
          tableClassName="w-full min-w-[980px] border-collapse text-left"
          rowClassName={(contact) => `${selected.includes(contact.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`}
          onRowDoubleClick={(event) => onView?.(event.data)}
          emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{loadError || "Nincs megjeleníthető kapcsolattartó."}</span>}
        >
          <Column header={<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Minden látható kapcsolattartó kijelölése" className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />} body={checkboxTemplate} headerClassName={`${headerClass} w-14 px-5`} bodyClassName={`${cellClass} w-14 px-5`} />
          <Column header="Kapcsolattartó" body={nameTemplate} headerClassName={`${headerClass} w-[24%]`} bodyClassName={`${cellClass} w-[24%]`} />
          <Column field="partner.name" header="Partner" body={(contact) => contact.partner.name} headerClassName={`${headerClass} w-[23%]`} bodyClassName={`${cellClass} w-[23%] font-medium`} />
          <Column field="position" header="Beosztás" body={(contact) => contact.position || "—"} headerClassName={`${headerClass} w-[18%]`} bodyClassName={`${cellClass} w-[18%]`} />
          <Column field="email" header="Email" body={(contact) => contact.email || "—"} headerClassName={`${headerClass} w-[22%]`} bodyClassName={`${cellClass} w-[22%]`} />
          <Column field="phone" header="Telefon" body={(contact) => contact.phone || "—"} headerClassName={`${headerClass} w-[18%]`} bodyClassName={`${cellClass} w-[18%] whitespace-nowrap`} />
          <Column header="Műveletek" body={actionTemplate} headerClassName={`${headerClass} w-[130px] text-center`} bodyClassName={`${cellClass} w-[130px]`} />
        </DataTable>
      </div>

      <nav className="mt-5 flex justify-center" aria-label="Kapcsolattartó-lista lapozása">
        <div className="inline-flex overflow-hidden rounded-md border border-[#d6dddc] bg-white shadow-[0_1px_1px_rgba(26,39,35,.025)]">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-r border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40"><Icon name="left" className="size-3.5" />Előző</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? "page" : undefined} className={`size-9 cursor-pointer border-0 border-r border-[#dfe4e3] text-xs last:border-0 ${number === currentPage ? "bg-[#f0f3f2] font-semibold text-[#1f3035]" : "bg-white text-[#445156] hover:bg-[#f7f8f8]"}`}>{number}</button>)}
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-l border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Következő<Icon name="right" className="size-3.5" /></button>
        </div>
      </nav>
    </section>
  );
}
