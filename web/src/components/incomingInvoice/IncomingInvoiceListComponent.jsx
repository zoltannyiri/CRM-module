import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";
import { buildIncomingInvoiceParams, formatInvoiceDate, formatInvoiceMoney, incomingInvoiceStatusClasses, incomingInvoiceStatusLabels } from "./incomingInvoiceDisplay.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent text-xs text-[#657276] hover:border-[#d8dfdd] hover:bg-[#f1f4f3] disabled:opacity-50";

export default function IncomingInvoiceListComponent({ query = "", status = "ALL", currency = "ALL", supplierPartnerId, projectId, dueFrom, dueTo, issueFrom, issueTo, sortBy = "createdAt", sortDirection = "desc", reloadKey = 0, onView, onEdit, canView = true, canEdit = false, canDelete = false, showTitle = true }) {
  const { showSuccess, showError } = useToast();
  const [result, setResult] = useState({ invoices: [], key: null, error: "" });
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const key = JSON.stringify([query, status, currency, supplierPartnerId, projectId, dueFrom, dueTo, issueFrom, issueTo, sortBy, sortDirection, reloadKey]);
  const loading = result.key !== key;
  useEffect(() => {
    let active = true;
    apiClient.get("/incoming-invoices", { params: buildIncomingInvoiceParams({ query, status, currency, supplierPartnerId, projectId, dueFrom, dueTo, issueFrom, issueTo, sortBy, sortDirection }) }).then(({ data }) => { if (active) setResult({ invoices: data, key, error: "" }); }).catch((error) => { if (active) setResult({ invoices: [], key, error: error.response?.data?.message || "A számlák betöltése sikertelen." }); });
    return () => { active = false; };
  }, [currency, dueFrom, dueTo, issueFrom, issueTo, key, projectId, query, sortBy, sortDirection, status, supplierPartnerId]);
  const pages = Math.max(1, Math.ceil(result.invoices.length / 10));
  const current = Math.min(page, pages);
  const visible = useMemo(() => result.invoices.slice((current - 1) * 10, current * 10), [current, result.invoices]);
  const remove = async (invoice) => {
    if (!window.confirm(`Biztosan törlöd ezt a számlát: ${invoice.invoiceNumber}?`)) return;
    setDeletingId(invoice.id);
    try { await apiClient.delete(`/incoming-invoices/${invoice.id}`, { skipGlobalErrorToast: true }); setResult((state) => ({ ...state, invoices: state.invoices.filter(({ id }) => id !== invoice.id) })); showSuccess("A számla törölve."); }
    catch (error) { showError(error.response?.data?.message || "A számla törlése sikertelen."); }
    finally { setDeletingId(null); }
  };
  const hasActions = canView || canEdit || canDelete;
  return <section aria-labelledby={showTitle ? "incoming-invoice-list-title" : undefined}>
    {showTitle && <div className="mb-4"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Pénzügy</p><h2 id="incoming-invoice-list-title" className="text-base font-semibold text-[#29383d]">Bejövő számlák</h2></div>}
    <div className="relative overflow-x-auto rounded-xl border border-[#dbe1df] bg-white shadow-[0_1px_2px_rgba(24,39,43,.02)]" aria-busy={loading}>
      <DataTable value={visible} dataKey="id" unstyled tableClassName="w-full min-w-[1120px] border-collapse text-left" onRowDoubleClick={(event) => canView && onView?.(event.data)} emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{result.error || "Nincs megjeleníthető bejövő számla."}</span>}>
        <Column header="Számlaszám" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => canView ? <button type="button" onClick={() => onView?.(row)} className="cursor-pointer font-semibold hover:underline">{row.invoiceNumber}</button> : <strong>{row.invoiceNumber}</strong>} />
        <Column header="Szállító" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => row.supplier?.name || "—"} />
        <Column header="Kiállítás" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => formatInvoiceDate(row.issueDate)} />
        <Column header="Határidő" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => formatInvoiceDate(row.dueDate)} />
        <Column header="Bruttó" headerClassName={`${headerClass} text-right`} bodyClassName={`${cellClass} whitespace-nowrap text-right`} body={(row) => formatInvoiceMoney(row.grossAmount, row.currency)} />
        <Column header="Pénznem" headerClassName={headerClass} bodyClassName={cellClass} field="currency" />
        <Column header="Státusz" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${incomingInvoiceStatusClasses[row.status]}`}>{incomingInvoiceStatusLabels[row.status]}</span>} />
        <Column header="Projekt" headerClassName={headerClass} bodyClassName={cellClass} body={(row) => row.project?.name || "—"} />
        {hasActions && <Column header="Műveletek" headerClassName={`${headerClass} w-32 text-center`} bodyClassName={`${cellClass} w-32`} body={(row) => <div className="flex justify-center gap-1">
          {canView && <button type="button" className={actionClass} onClick={() => onView?.(row)} aria-label={`${row.invoiceNumber} megtekintése`}><i className="pi pi-eye" /></button>}
          {canEdit && <button type="button" className={actionClass} onClick={() => onEdit?.(row)} aria-label={`${row.invoiceNumber} módosítása`}><i className="pi pi-pencil" /></button>}
          {canDelete && <button type="button" className={`${actionClass} text-[#9a4335]`} disabled={deletingId === row.id} onClick={() => remove(row)} aria-label={`${row.invoiceNumber} törlése`}><i className={`pi ${deletingId === row.id ? "pi-spinner pi-spin" : "pi-trash"}`} /></button>}
        </div>} />}
      </DataTable>
      {loading && <div className="absolute inset-x-0 top-12 bottom-0 grid min-h-40 place-items-center bg-white" role="status"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div>}
    </div>
    {!loading && result.invoices.length > 10 && <div className="mt-5 flex justify-center gap-3 text-xs"><button disabled={current === 1} onClick={() => setPage((value) => value - 1)} className="h-9 rounded-md border bg-white px-4 disabled:opacity-40">Előző</button><span className="grid place-items-center">{current} / {pages}</span><button disabled={current === pages} onClick={() => setPage((value) => value + 1)} className="h-9 rounded-md border bg-white px-4 disabled:opacity-40">Következő</button></div>}
  </section>;
}
