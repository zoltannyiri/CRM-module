import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { formatLeadDate, memberName, leadStatusClasses, leadStatusLabels, leadSourceLabels } from "./leadDisplay.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

export default function LeadListComponent({
  query = "",
  statusFilter = "ALL",
  sourceFilter = "ALL",
  assignedMemberId,
  sortDirection = "desc",
  reloadKey = 0,
  onView,
  onEdit,
  canView = true,
  canEdit = false,
  canDelete = false,
  showTitle = true,
}) {
  const { showSuccess, showError } = useToast();
  const { hasModule, hasPermission } = useAuth();
  canView = canView && hasModule("LEADS") && hasPermission("LEADS_VIEW");
  canEdit = canEdit && hasPermission("LEADS_EDIT");
  canDelete = canDelete && hasPermission("LEADS_DELETE");
  const [result, setResult] = useState({ leads: [], resolvedKey: null, error: "" });
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const rowsPerPage = 10;
  const requestKey = JSON.stringify([query, statusFilter, sourceFilter, assignedMemberId, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;
  const hasActions = canView || canEdit || canDelete;

  useEffect(() => {
    if (!canView) return undefined;
    let active = true;
    apiClient.get("/leads", {
      params: {
        ...(query.trim() ? { search: query.trim() } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(sourceFilter !== "ALL" ? { source: sourceFilter } : {}),
        ...(assignedMemberId ? { assignedMemberId } : {}),
        sortDirection,
      },
    }).then(({ data }) => {
      if (active) setResult({ leads: data, resolvedKey: requestKey, error: "" });
    }).catch((error) => {
      if (active) setResult({ leads: [], resolvedKey: requestKey, error: error.response?.data?.message || "Az érdeklődők betöltése sikertelen." });
    });
    return () => { active = false; };
  }, [canView, assignedMemberId, sourceFilter, query, reloadKey, requestKey, sortDirection, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(result.leads.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => result.leads.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [currentPage, result.leads]);

  const handleDelete = async (lead) => {
    if (!window.confirm(`Biztosan törölni szeretnéd ezt az érdeklődőt: ${lead.name}?`)) return;
    setDeletingId(lead.id);
    try {
      await apiClient.delete(`/leads/${lead.id}`, { skipGlobalErrorToast: true });
      setResult((current) => ({ ...current, leads: current.leads.filter(({ id }) => id !== lead.id) }));
      showSuccess("Az érdeklődő sikeresen törölve.");
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Az érdeklődő törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  if (!canView) return null;

  return (
    <section aria-labelledby={showTitle ? "lead-list-title" : undefined}>
      {showTitle && <div className="mb-4"><p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Értékesítés</p><h2 id="lead-list-title" className="text-base font-semibold text-[#29383d]">Érdeklődők</h2></div>}
      <div className="relative overflow-x-auto rounded-xl border border-[#dbe1df] bg-white shadow-[0_1px_2px_rgba(24,39,43,0.02)]" aria-busy={loading}>
        <DataTable value={loading ? [] : visible} dataKey="id" unstyled tableClassName="w-full min-w-[1120px] border-collapse text-left" onRowDoubleClick={(event) => canView && onView?.(event.data)} emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{loading ? "" : result.error || "Nincs megjeleníthető érdeklődő."}</span>}>
          <Column field="name" header="Név" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => canView ? <button type="button" onClick={() => onView?.(lead)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#263338] hover:underline">{lead.name}</button> : <span className="font-semibold">{lead.name}</span>} />
          <Column field="companyName" header="Cégnév" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => lead.companyName || "—"} />
          <Column header="Státusz" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${leadStatusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span>} />
          <Column header="Forrás" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => leadSourceLabels[lead.source]} />
          <Column field="email" header="E-mail" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => lead.email || "—"} />
          <Column field="phone" header="Telefon" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => lead.phone || "—"} />
          <Column header="Felelős" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => memberName(lead.assignedMember)} />
          <Column header="Létrehozás" headerClassName={headerClass} bodyClassName={cellClass} body={(lead) => formatLeadDate(lead.createdAt)} />
          {hasActions && <Column header="Műveletek" headerClassName={`${headerClass} w-32 text-center`} bodyClassName={`${cellClass} w-32`} body={(lead) => <div className="flex items-center justify-center gap-1">
            {canView && <button type="button" onClick={() => onView?.(lead)} className={actionButtonClass} title="Megtekintés" aria-label={`${lead.name} megtekintése`}><i className="pi pi-eye" aria-hidden="true" /></button>}
            {canEdit && <button type="button" onClick={() => onEdit?.(lead)} className={actionButtonClass} title="Szerkesztés" aria-label={`${lead.name} szerkesztése`}><i className="pi pi-pencil" aria-hidden="true" /></button>}
            {canDelete && <button type="button" onClick={() => handleDelete(lead)} disabled={deletingId === lead.id} className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee]`} title="Törlés" aria-label={`${lead.name} törlése`}><i className={`pi ${deletingId === lead.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" /></button>}
          </div>} />}
        </DataTable>
        {loading && <div className="absolute inset-x-0 top-12 bottom-0 grid min-h-40 place-items-center bg-white" role="status" aria-label="Érdeklődők betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
      </div>
      {!loading && !result.error && result.leads.length > rowsPerPage && <div className="mt-5 flex justify-center"><div className="flex overflow-hidden rounded-md border border-[#d6dddc] bg-white text-xs"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-9 cursor-pointer px-4 disabled:cursor-not-allowed disabled:opacity-40">Előző</button><span className="grid min-w-10 place-items-center border-x border-[#e3e8e6] bg-[#f5f7f6]">{currentPage}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-9 cursor-pointer px-4 disabled:cursor-not-allowed disabled:opacity-40">Következő</button></div></div>}
    </section>
  );
}
