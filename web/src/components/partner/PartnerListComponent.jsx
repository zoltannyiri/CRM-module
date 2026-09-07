import { useEffect, useMemo, useState } from "react";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import apiClient from "../../api/apiClient.js";

const iconPaths = {
  plus: <path d="M12 5v14M5 12h14" />,
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
  more: <><circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1" fill="currentColor" stroke="none" /></>,
};

function Icon({ name, className = "size-4" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export default function PartnerListComponent({ query = "", typeFilter = "ALL", sortDirection = "desc", onOpen }) {
  const [partners, setPartners] = useState([]);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const rowsPerPage = 10;

  const filteredPartners = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("hu");
    const filtered = partners.filter((partner) => {
      const typeMatches = typeFilter === "ALL" || partner.type === typeFilter;
      const contactName = partner.contacts?.[0]
        ? `${partner.contacts[0].firstName} ${partner.contacts[0].lastName}`
        : "";
      const queryMatches = !needle || [partner.name, partner.email, partner.phone, partner.website, contactName]
        .some((value) => value?.toLocaleLowerCase("hu").includes(needle));
      return typeMatches && queryMatches;
    });

    return [...filtered].sort((a, b) => sortDirection === "asc" ? a.id - b.id : b.id - a.id);
  }, [partners, query, sortDirection, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPartners.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = filteredPartners.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  function toggleAll() {
    setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  }

  const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
  const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
  const checkboxTemplate = (partner) => {
    const checked = selected.includes(partner.id);
    return <input type="checkbox" checked={checked} onChange={() => setSelected((current) => checked ? current.filter((id) => id !== partner.id) : [...current, partner.id])} aria-label={`${partner.name} kijelölése`} className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />;
  };
  const partnerTemplate = (partner) => {
    const initials = partner.name.split(" ").slice(0, 2).map((word) => word[0]).join("").toUpperCase();
    return <div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f4f3] text-[11px] font-medium text-[#465458]">{initials}</span><button type="button" onClick={() => onOpen?.(partner)} className="cursor-pointer border-0 bg-transparent p-0 text-left text-xs font-medium text-[#263338] hover:underline">{partner.name}</button></div>;
  };
  const actionTemplate = (partner) => <button type="button" onClick={() => onOpen?.(partner)} aria-label={`${partner.name} műveletei`} className="mx-auto grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[#788487] hover:bg-[#eef1f0] hover:text-[#263338]"><Icon name="more" className="size-4" /></button>;

  useEffect(() => {
    let active = true;

    apiClient.get("/partners")
      .then(({ data }) => {
        if (active) setPartners(data);
      })
      .catch((error) => {
        if (active) setLoadError(error.message || "A partnerlista betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);


  return (
    <section className="bg-[#f3f5f6] px-5 pb-5" aria-label="Partnerlista">
      {selected.length > 0 && <div className="border-x border-t border-[#dbe1df] bg-white px-4 py-2.5 text-xs font-medium text-[#4f7954]">{selected.length} partner kiválasztva</div>}

      <div className="overflow-x-auto border border-[#dbe1df] bg-white rounded-2xl">
        <DataTable
          value={visible}
          dataKey="id"
          loading={loading}
          unstyled
          tableClassName="w-full min-w-[820px] border-collapse text-left"
          rowClassName={(partner) => `${selected.includes(partner.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`}
          onRowDoubleClick={(event) => onOpen?.(event.data)}
          emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{loadError || "Nincs megjeleníthető partner."}</span>}
        >
          <Column header={<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Minden látható partner kijelölése" className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]" />} body={checkboxTemplate} headerClassName={`${headerClass} w-14 px-5`} bodyClassName={`${cellClass} w-14 px-5`} />
          <Column field="name" header="Partner neve" body={partnerTemplate} headerClassName={`${headerClass} w-[26%]`} bodyClassName={`${cellClass} w-[26%]`} />
          <Column field="type" header="Típus" body={(partner) => partner.type === "COMPANY" ? "Cég" : "Magánszemély"} headerClassName={`${headerClass} w-[15%]`} bodyClassName={`${cellClass} w-[15%]`} />
          <Column field="email" header="Email" body={(partner) => partner.email || "—"} headerClassName={`${headerClass} w-[21%]`} bodyClassName={`${cellClass} w-[21%]`} />
          <Column field="phone" header="Telefon" body={(partner) => partner.phone || "—"} headerClassName={`${headerClass} w-[17%]`} bodyClassName={`${cellClass} w-[17%] whitespace-nowrap`} />
          <Column field="contacts" header="Kapcsolattartó" body={(partner) => partner.contacts?.[0] ? `${partner.contacts[0].firstName} ${partner.contacts[0].lastName}` : "—"} headerClassName={`${headerClass} w-[18%]`} bodyClassName={`${cellClass} w-[18%]`} />
          <Column header={<span className="mx-auto grid size-[18px] place-items-center rounded-full bg-[#26393e] text-white"><Icon name="plus" className="size-3" /></span>} body={actionTemplate} headerClassName={`${headerClass} w-14 px-3 text-center`} bodyClassName={`${cellClass} w-14 px-3 text-center`} />
        </DataTable>
      </div>

      <nav className="mt-5 flex justify-center" aria-label="Partnerlista lapozása">
        <div className="inline-flex overflow-hidden rounded-md border border-[#d6dddc] bg-white shadow-[0_1px_1px_rgba(26,39,35,.025)]">
          <button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-r border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40"><Icon name="left" className="size-3.5" />Előző</button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <button key={number} type="button" onClick={() => setPage(number)} aria-current={number === currentPage ? "page" : undefined} className={`size-9 cursor-pointer border-0 border-r border-[#dfe4e3] text-xs last:border-0 ${number === currentPage ? "bg-[#f0f3f2] font-semibold text-[#1f3035]" : "bg-white text-[#445156] hover:bg-[#f7f8f8]"}`}>{number}</button>)}
          <button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)} className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-l border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40">Következő<Icon name="right" className="size-3.5" /></button>
        </div>
      </nav>
    </section>
  );
}
