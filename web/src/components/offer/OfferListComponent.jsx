import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { formatMoney, formatOfferDate, offerStatusClasses, offerStatusLabels } from "./offerDisplay.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

export default function OfferListComponent({
  query = "",
  statusFilter = "ALL",
  partnerId,
  projectId,
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
  const canViewPartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canViewProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");
  const [result, setResult] = useState({ offers: [], resolvedKey: null, error: "" });
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const rowsPerPage = 10;
  const requestKey = JSON.stringify([query, statusFilter, partnerId, projectId, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;
  const hasActions = canView || canEdit || canDelete;

  useEffect(() => {
    let active = true;
    apiClient.get("/offers", {
      params: {
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(partnerId ? { partnerId } : {}),
        ...(projectId ? { projectId } : {}),
        sortDirection,
      },
    }).then(({ data }) => {
      if (active) setResult({ offers: data, resolvedKey: requestKey, error: "" });
    }).catch((error) => {
      if (active) setResult({ offers: [], resolvedKey: requestKey, error: error.message || "Az ajánlatok betöltése sikertelen." });
    });
    return () => { active = false; };
  }, [partnerId, projectId, query, reloadKey, requestKey, sortDirection, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(result.offers.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => result.offers.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [currentPage, result.offers]);

  const handleDelete = async (offer) => {
    if (!window.confirm(`Biztosan törölni szeretnéd ezt az ajánlatot: ${offer.offerNumber}?`)) return;
    setDeletingId(offer.id);
    try {
      await apiClient.delete(`/offers/${offer.id}`, { skipGlobalErrorToast: true });
      setResult((current) => ({ ...current, offers: current.offers.filter(({ id }) => id !== offer.id) }));
      showSuccess("Az ajánlat sikeresen törölve.");
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Az ajánlat törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-labelledby={showTitle ? "offer-list-title" : undefined}>
      {showTitle && <div className="mb-4"><p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Értékesítés</p><h2 id="offer-list-title" className="text-base font-semibold text-[#29383d]">Ajánlatok</h2></div>}
      <div className="relative overflow-hidden rounded-xl border border-[#dbe1df] bg-white shadow-[0_1px_2px_rgba(24,39,43,0.02)]" aria-busy={loading}>
        <DataTable value={visible} dataKey="id" unstyled tableClassName="w-full min-w-[1120px] border-collapse text-left" onRowDoubleClick={(event) => canView && onView?.(event.data)} emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{result.error || "Nincs megjeleníthető ajánlat."}</span>}>
          <Column field="offerNumber" header="Ajánlatszám" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => canView ? <button type="button" onClick={() => onView?.(offer)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#263338] hover:underline">{offer.offerNumber}</button> : <span className="font-semibold">{offer.offerNumber}</span>} />
          {canViewPartners && <Column header="Partner" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => offer.partner?.name || "—"} />}
          {canViewProjects && <Column header="Projekt" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => offer.project?.name || "—"} />}
          <Column header="Státusz" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${offerStatusClasses[offer.status]}`}>{offerStatusLabels[offer.status]}</span>} />
          <Column header="Kiállítás" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => formatOfferDate(offer.issueDate)} />
          <Column header="Érvényes" headerClassName={headerClass} bodyClassName={cellClass} body={(offer) => formatOfferDate(offer.validUntil)} />
          <Column header="Nettó" headerClassName={`${headerClass} text-right`} bodyClassName={`${cellClass} text-right whitespace-nowrap`} body={(offer) => formatMoney(offer.totals.net, offer.currency)} />
          <Column header="Bruttó" headerClassName={`${headerClass} text-right`} bodyClassName={`${cellClass} text-right whitespace-nowrap`} body={(offer) => formatMoney(offer.totals.gross, offer.currency)} />
          {hasActions && <Column header="Műveletek" headerClassName={`${headerClass} w-32 text-center`} bodyClassName={`${cellClass} w-32`} body={(offer) => <div className="flex items-center justify-center gap-1">
            {canView && <button type="button" onClick={() => onView?.(offer)} className={actionButtonClass} title="Megtekintés" aria-label={`${offer.offerNumber} megtekintése`}><i className="pi pi-eye" aria-hidden="true" /></button>}
            {canEdit && <button type="button" onClick={() => onEdit?.(offer)} className={actionButtonClass} title="Szerkesztés" aria-label={`${offer.offerNumber} szerkesztése`}><i className="pi pi-pencil" aria-hidden="true" /></button>}
            {canDelete && <button type="button" onClick={() => handleDelete(offer)} disabled={deletingId === offer.id} className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee]`} title="Törlés" aria-label={`${offer.offerNumber} törlése`}><i className={`pi ${deletingId === offer.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" /></button>}
          </div>} />}
        </DataTable>
        {loading && <div className="absolute inset-x-0 top-12 grid min-h-40 place-items-center bg-white" role="status" aria-label="Ajánlatok betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
      </div>
      {!loading && !result.error && result.offers.length > rowsPerPage && <div className="mt-5 flex justify-center"><div className="flex overflow-hidden rounded-md border border-[#d6dddc] bg-white text-xs"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="h-9 px-4 disabled:opacity-40">Előző</button><span className="grid min-w-10 place-items-center border-x border-[#e3e8e6] bg-[#f5f7f6]">{currentPage}</span><button type="button" disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="h-9 px-4 disabled:opacity-40">Következő</button></div></div>}
    </section>
  );
}
