import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabPanel, TabView } from "primereact/tabview";
import apiClient from "../api/apiClient.js";
import IncomingInvoiceFormComponent from "../components/incomingInvoice/IncomingInvoiceFormComponent.jsx";
import IncomingInvoiceListComponent from "../components/incomingInvoice/IncomingInvoiceListComponent.jsx";
import IncomingInvoiceShowComponent from "../components/incomingInvoice/IncomingInvoiceShowComponent.jsx";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const controlClass = "h-9 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] outline-none";
const tabClass = "[&_.p-tabview-nav-container]:border-b [&_.p-tabview-nav-container]:border-[#dfe5e3] [&_.p-tabview-nav]:m-0 [&_.p-tabview-nav]:flex [&_.p-tabview-nav]:list-none [&_.p-tabview-nav]:gap-6 [&_.p-tabview-nav]:p-0 [&_.p-tabview-header]:list-none [&_.p-tabview-nav-link]:inline-flex [&_.p-tabview-nav-link]:cursor-pointer [&_.p-tabview-nav-link]:border-b-2 [&_.p-tabview-nav-link]:border-transparent [&_.p-tabview-nav-link]:pb-3 [&_.p-tabview-nav-link]:text-xs [&_.p-tabview-nav-link]:font-medium [&_.p-tabview-nav-link]:text-[#657276] [&_.p-highlight_.p-tabview-nav-link]:border-[#78ad7d] [&_.p-highlight_.p-tabview-nav-link]:font-semibold [&_.p-highlight_.p-tabview-nav-link]:text-[#202e33] [&_.p-tabview-panels]:p-0 [&_.p-tabview-panels]:pt-6";

export default function IncomingInvoicePage() {
  const { id } = useParams(); const navigate = useNavigate(); const { hasModule, hasPermission } = useAuth(); const { showError } = useToast();
  const [query, setQuery] = useState(""); const [status, setStatus] = useState("ALL"); const [currency, setCurrency] = useState("ALL"); const [sortDirection, setSortDirection] = useState("desc");
  const [form, setForm] = useState(null); const [reloadKey, setReloadKey] = useState(0); const [detail, setDetail] = useState(null);
  const openEdit = async (row = detail) => { try { const { data } = await apiClient.get(`/incoming-invoices/${row.id}`, { skipGlobalErrorToast: true }); setForm(data); } catch (error) { showError(error.response?.data?.message || "A számla nem tölthető be."); } };
  const saved = (invoice) => { setReloadKey((value) => value + 1); setForm(null); if (id) { setDetail(invoice); } };

  if (id) return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]"><Topbar /><div className="flex items-center justify-between border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><div className="flex items-center gap-3"><button type="button" onClick={() => navigate("/incoming-invoice")} className={controlClass}><i className="pi pi-arrow-left mr-2" />Vissza a számlákhoz</button><span className="h-4 w-px bg-[#dbe1df]" /><h1 className="text-sm font-semibold">Bejövő számla</h1></div>{hasPermission("INCOMING_INVOICES_EDIT") && detail && <button type="button" onClick={() => openEdit()} className="h-9 rounded-md bg-[#263b40] px-4 text-xs font-semibold text-white"><i className="pi pi-pencil mr-2" />Szerkesztés</button>}</div>
    <div className="px-5 py-6 lg:px-7"><TabView className={tabClass}><TabPanel header="Áttekintés"><IncomingInvoiceShowComponent invoiceId={id} reloadKey={reloadKey} onLoaded={setDetail} /></TabPanel>{hasModule("DOCUMENTS") && hasPermission("DOCUMENTS_VIEW") && <TabPanel header="Dokumentumok">{detail ? <IncomingInvoiceShowComponent invoiceId={id} invoice={detail} view="documents" /> : <div className="grid min-h-64 place-items-center" role="status"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div>}</TabPanel>}</TabView></div>
    {form && <IncomingInvoiceFormComponent mode="edit" invoice={form} onClose={() => setForm(null)} onSaved={saved} />}</div>;

  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]"><Topbar searchValue={query} onSearchChange={setQuery} onCreate={hasPermission("INCOMING_INVOICES_CREATE") ? () => setForm({ create: true }) : undefined} />
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><div className="flex gap-2"><select value={status} onChange={(event) => setStatus(event.target.value)} className={`${controlClass} min-w-36`} aria-label="Számlastátusz"><option value="ALL">Minden státusz</option><option value="DRAFT">Piszkozat</option><option value="RECEIVED">Beérkezett</option><option value="APPROVED">Jóváhagyott</option><option value="PAID">Fizetve</option><option value="REJECTED">Elutasított</option></select><select value={currency} onChange={(event) => setCurrency(event.target.value)} className={controlClass} aria-label="Pénznem"><option value="ALL">Minden pénznem</option><option>HUF</option><option>EUR</option><option>USD</option></select></div><button type="button" onClick={() => setSortDirection((value) => value === "desc" ? "asc" : "desc")} className={controlClass}>Létrehozás <i className={`pi pi-chevron-${sortDirection === "desc" ? "down" : "up"} ml-2`} /></button></div>
    <div className="px-5 py-5"><IncomingInvoiceListComponent query={query} status={status} currency={currency} sortDirection={sortDirection} reloadKey={reloadKey} canView onView={(row) => navigate(`/incoming-invoice/${row.id}`)} canEdit={hasPermission("INCOMING_INVOICES_EDIT")} canDelete={hasPermission("INCOMING_INVOICES_DELETE")} onEdit={openEdit} /></div>
    {form && <IncomingInvoiceFormComponent mode={form.create ? "create" : "edit"} invoice={form.create ? null : form} onClose={() => setForm(null)} onSaved={saved} />}</div>;
}
