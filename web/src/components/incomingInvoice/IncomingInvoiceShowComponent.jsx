import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { formatInvoiceDate, formatInvoiceMoney, incomingInvoiceStatusClasses, incomingInvoiceStatusLabels } from "./incomingInvoiceDisplay.js";

const labelClass = "text-[10px] font-semibold uppercase tracking-[.11em] text-[#899491]";

export default function IncomingInvoiceShowComponent({ invoiceId, invoice: providedInvoice, reloadKey = 0, onLoaded, view = "overview" }) {
  const { hasPermission } = useAuth();
  const { showError } = useToast();
  const [state, setState] = useState({ invoice: null, loading: true, error: "" });
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    if (providedInvoice) return undefined;
    let active = true;
    apiClient.get(`/incoming-invoices/${invoiceId}`, { skipGlobalErrorToast: true })
      .then(({ data }) => { if (active) { setState({ invoice: data, loading: false, error: "" }); onLoaded?.(data); } })
      .catch((error) => { if (active) setState({ invoice: null, loading: false, error: error.response?.data?.message || "A számla nem tölthető be." }); });
    return () => { active = false; };
  }, [invoiceId, onLoaded, providedInvoice, reloadKey]);

  const download = async (document) => {
    setDownloadingId(document.id);
    try {
      const response = await apiClient.get(`/documents/${document.id}/download`, { responseType: "blob", skipGlobalErrorToast: true });
      const url = URL.createObjectURL(response.data);
      const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = document.originalFileName || document.name; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { showError(error.response?.data?.message || "A letöltés sikertelen."); }
    finally { setDownloadingId(null); }
  };

  if (!providedInvoice && state.loading) return <div className="grid min-h-64 place-items-center" role="status"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div>;
  if (state.error) return <div className="rounded-lg border border-[#efd7d1] bg-[#fdf1ee] p-5 text-sm text-[#9a4335]" role="alert">{state.error}</div>;
  const invoice = providedInvoice || state.invoice;
  return <div className="grid gap-5">
    {view === "overview" && <section className="rounded-xl border border-[#dbe1df] bg-white p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><p className={labelClass}>Számlaszám</p><h2 className="mt-1 text-xl font-semibold text-[#263338]">{invoice.invoiceNumber}</h2></div><span className={`rounded-full border px-3 py-1.5 text-xs font-medium ${incomingInvoiceStatusClasses[invoice.status]}`}>{incomingInvoiceStatusLabels[invoice.status]}</span></div>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[["Szállító", invoice.supplier?.name || "—"], ["Projekt", invoice.project?.name || "—"], ["Kiállítás", formatInvoiceDate(invoice.issueDate)], ["Teljesítés", formatInvoiceDate(invoice.performanceDate)], ["Fizetési határidő", formatInvoiceDate(invoice.dueDate)], ["Nettó", formatInvoiceMoney(invoice.netAmount, invoice.currency)], ["ÁFA", formatInvoiceMoney(invoice.vatAmount, invoice.currency)], ["Bruttó", formatInvoiceMoney(invoice.grossAmount, invoice.currency)]].map(([label, value]) => <div key={label}><dt className={labelClass}>{label}</dt><dd className="mt-1 text-sm font-medium text-[#344247]">{value}</dd></div>)}
      </dl>
      {invoice.note && <div className="mt-6 border-t border-[#e5e9e8] pt-5"><p className={labelClass}>Megjegyzés</p><p className="mt-2 whitespace-pre-wrap text-sm text-[#4f5d61]">{invoice.note}</p></div>}
    </section>}
    {view === "documents" && hasPermission("DOCUMENTS_VIEW") && <section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 text-sm font-semibold">Dokumentumok</h3>{invoice.documents?.length ? <div className="divide-y divide-[#e5e9e8]">{invoice.documents.map((document) => <div key={document.id} className="flex items-center justify-between gap-4 py-3 text-xs"><div><p className="font-semibold text-[#344247]">{document.name}</p><p className="mt-1 text-[#84908d]">{document.originalFileName}</p></div>{hasPermission("DOCUMENTS_DOWNLOAD") && <button type="button" onClick={() => download(document)} disabled={downloadingId === document.id} className="grid size-9 place-items-center rounded-md border border-[#d6dddc] bg-white"><i className={`pi ${downloadingId === document.id ? "pi-spinner pi-spin" : "pi-download"}`} /></button>}</div>)}</div> : <p className="py-6 text-center text-xs text-[#778286]">Nincs kapcsolódó dokumentum.</p>}</section>}
  </div>;
}
