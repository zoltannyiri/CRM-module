import { useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import IncomingInvoiceFormComponent from "./IncomingInvoiceFormComponent.jsx";
import IncomingInvoiceListComponent from "./IncomingInvoiceListComponent.jsx";

export default function RelatedIncomingInvoicesComponent({ partnerId, projectId }) {
  const navigate = useNavigate(); const { hasPermission } = useAuth(); const { showError } = useToast();
  const [form, setForm] = useState(null); const [reloadKey, setReloadKey] = useState(0);
  const edit = async (row) => { try { const { data } = await apiClient.get(`/incoming-invoices/${row.id}`, { skipGlobalErrorToast: true }); setForm(data); } catch (error) { showError(error.response?.data?.message || "A számla nem tölthető be."); } };
  const saved = () => { setReloadKey((value) => value + 1); setForm(null); };
  return <section><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">Bejövő számlák</h2><p className="mt-1 text-xs text-[#71807c]">A kapcsolódó szállítói számlák.</p></div>{hasPermission("INCOMING_INVOICES_CREATE") && <button type="button" onClick={() => setForm({ create: true })} className="h-9 rounded-md bg-[#78b97d] px-4 text-xs font-semibold text-white"><i className="pi pi-plus mr-2 text-[10px]" />Új számla</button>}</div>
    <IncomingInvoiceListComponent supplierPartnerId={partnerId} projectId={projectId} reloadKey={reloadKey} showTitle={false} canView onView={(row) => navigate(`/incoming-invoice/${row.id}`)} canEdit={hasPermission("INCOMING_INVOICES_EDIT")} canDelete={hasPermission("INCOMING_INVOICES_DELETE")} onEdit={edit} />
    {form && <IncomingInvoiceFormComponent mode={form.create ? "create" : "edit"} invoice={form.create ? null : form} defaultSupplierPartnerId={partnerId} defaultProjectId={projectId} onClose={() => setForm(null)} onSaved={saved} />}
  </section>;
}
