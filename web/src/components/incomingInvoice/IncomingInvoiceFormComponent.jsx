import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import DocumentUploadField from "../document/DocumentUploadField.jsx";
import { calculateGross, dateInputValue, incomingInvoiceStatusLabels, invoiceTransitions, validateIncomingInvoiceForm } from "./incomingInvoiceDisplay.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";
const today = () => new Date().toISOString().slice(0, 10);

export default function IncomingInvoiceFormComponent(props) {
  const { hasPermission } = useAuth();
  const allowed = props.mode === "edit" ? hasPermission("INCOMING_INVOICES_EDIT") : hasPermission("INCOMING_INVOICES_CREATE");
  if (!allowed) return null;
  return <IncomingInvoiceForm {...props} />;
}

function IncomingInvoiceForm({ mode = "create", invoice, defaultSupplierPartnerId, defaultProjectId, onClose, onSaved }) {
  const { hasModule, hasPermission } = useAuth();
  const { showSuccess } = useToast();
  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canUseProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");
  const canUpload = hasModule("DOCUMENTS") && hasPermission("DOCUMENTS_CREATE");
  const [persistedId, setPersistedId] = useState(invoice?.id || null);
  const [supplierPartnerId, setSupplierPartnerId] = useState(String(defaultSupplierPartnerId || invoice?.supplier?.id || ""));
  const [projectId, setProjectId] = useState(String(defaultProjectId || invoice?.project?.id || ""));
  const [invoiceNumber, setInvoiceNumber] = useState(invoice?.invoiceNumber || "");
  const [issueDate, setIssueDate] = useState(dateInputValue(invoice?.issueDate) || today());
  const [performanceDate, setPerformanceDate] = useState(dateInputValue(invoice?.performanceDate));
  const [dueDate, setDueDate] = useState(dateInputValue(invoice?.dueDate));
  const [currency, setCurrency] = useState(invoice?.currency || "HUF");
  const [netAmount, setNetAmount] = useState(invoice?.netAmount || "0.00");
  const [vatAmount, setVatAmount] = useState(invoice?.vatAmount || "0.00");
  const [grossAmount, setGrossAmount] = useState(invoice?.grossAmount || "0.00");
  const [status, setStatus] = useState(invoice?.status || "DRAFT");
  const [note, setNote] = useState(invoice?.note || "");
  const [file, setFile] = useState(null);
  const [partners, setPartners] = useState(invoice?.supplier ? [invoice.supplier] : []);
  const [projects, setProjects] = useState(invoice?.project ? [invoice.project] : []);
  const [loadingRelations, setLoadingRelations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleClose = useCallback(() => {
    if (closeRef.current) return;
    closeRef.current = true;
    setClosing(true);
    setTimeout(() => {
      onClose();
    }, 200);
  }, [onClose]);

  const isEditing = mode === "edit" || Boolean(persistedId);
  const originalStatus = invoice?.status || "DRAFT";
  const allowedStatuses = useMemo(() => isEditing ? [originalStatus, ...(invoiceTransitions[originalStatus] || [])] : ["DRAFT"], [isEditing, originalStatus]);

  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const keydown = (event) => { if (event.key === "Escape" && !submitting) handleClose(); };
    window.addEventListener("keydown", keydown); return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", keydown); };
  }, [handleClose, submitting]);
  useEffect(() => {
    let activeEffect = true;
    Promise.all([canUsePartners ? apiClient.get("/partners") : Promise.resolve({ data: [] }), canUseProjects ? apiClient.get("/projects") : Promise.resolve({ data: [] })])
      .then(([partnerResponse, projectResponse]) => { if (activeEffect) { setPartners(partnerResponse.data); setProjects(projectResponse.data); } })
      .catch(() => { if (activeEffect) setError("A kapcsolódó adatok nem tölthetők be."); })
      .finally(() => { if (activeEffect) setLoadingRelations(false); });
    return () => { activeEffect = false; };
  }, [canUsePartners, canUseProjects]);

  const handleSubmit = async (event) => {
    event.preventDefault(); setError("");
    const validationError = validateIncomingInvoiceForm({ supplierPartnerId: canUsePartners ? supplierPartnerId : "", invoiceNumber, netAmount, vatAmount, grossAmount });
    if (validationError) { setError(validationError); return; }
    const payload = { supplierPartnerId: Number(supplierPartnerId), projectId: projectId ? Number(projectId) : null, invoiceNumber: invoiceNumber.trim(), issueDate, performanceDate: performanceDate || null, dueDate: dueDate || null, currency, netAmount, vatAmount, grossAmount, status, note: note.trim() || null };
    setSubmitting(true);
    try {
      const response = persistedId ? await apiClient.patch(`/incoming-invoices/${persistedId}`, payload) : await apiClient.post("/incoming-invoices", payload);
      const saved = response.data; setPersistedId(saved.id);
      if (file && canUpload) {
        setUploading(true);
        const form = new FormData(); form.append("file", file); form.append("name", `Számla ${saved.invoiceNumber}`); form.append("documentType", "INVOICE"); form.append("incomingInvoiceId", String(saved.id));
        try { await apiClient.post("/documents", form); setFile(null); }
        catch (uploadError) { setError(`A számla mentve, de a dokumentum feltöltése sikertelen: ${uploadError.response?.data?.message || uploadError.message}`); return; }
        finally { setUploading(false); }
      }
      onSaved?.(saved); showSuccess(persistedId ? "A számla módosítva." : "A bejövő számla létrehozva."); handleClose();
    } catch (requestError) { setError(requestError.response?.data?.message || "A számla mentése sikertelen."); }
    finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="invoice-form-title">
    <button type="button" onClick={handleClose} disabled={submitting} className={`starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200 ease-out ${active && !closing ? "opacity-100" : "opacity-0 pointer-events-none"}`} aria-label="Számlaűrlap bezárása" />
    <aside className={`starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 ease-out md:w-1/2 md:min-w-[680px] md:max-w-full ${active && !closing ? "translate-x-0" : "translate-x-full"}`}>
      <header className="flex items-start justify-between border-b border-[#dfe5e3] bg-white px-7 py-6"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Pénzügy</p><h2 id="invoice-form-title" className="mt-1 text-xl font-semibold">{isEditing ? "Bejövő számla szerkesztése" : "Új bejövő számla"}</h2></div><button type="button" onClick={handleClose} disabled={submitting} className="h-9 rounded-md border border-[#d6dddc] bg-white px-4 text-xs">Bezárás</button></header>
      <form id="incoming-invoice-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7"><div className="mx-auto grid max-w-3xl gap-6">
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold">Alapadatok</h3><div className="grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Szállító<select required disabled={loadingRelations || Boolean(defaultSupplierPartnerId)} value={supplierPartnerId} onChange={(event) => setSupplierPartnerId(event.target.value)} className={fieldClass}><option value="">Válassz partnert</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></label>
          <label className={labelClass}>Számlaszám<input required value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} className={fieldClass} /></label>
          <label className={labelClass}>Kiállítás dátuma<input required type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={fieldClass} /></label>
          <label className={labelClass}>Teljesítés dátuma<input type="date" value={performanceDate} onChange={(event) => setPerformanceDate(event.target.value)} className={fieldClass} /></label>
          <label className={labelClass}>Fizetési határidő<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} /></label>
          <label className={labelClass}>Projekt<select disabled={!canUseProjects || loadingRelations || Boolean(defaultProjectId)} value={projectId} onChange={(event) => setProjectId(event.target.value)} className={fieldClass}><option value="">Nincs projekthez kapcsolva</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
          <label className={labelClass}>Pénznem<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={fieldClass}><option>HUF</option><option>EUR</option><option>USD</option></select></label>
          <label className={labelClass}>Státusz<select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}>{allowedStatuses.map((value) => <option key={value} value={value}>{incomingInvoiceStatusLabels[value]}</option>)}</select></label>
        </div></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold">Összegek</h3><div className="grid gap-5 sm:grid-cols-3">
          <label className={labelClass}>Nettó<input type="number" min="0" step="0.01" value={netAmount} onChange={(event) => { setNetAmount(event.target.value); setGrossAmount(calculateGross(event.target.value, vatAmount)); }} className={fieldClass} /></label>
          <label className={labelClass}>ÁFA<input type="number" min="0" step="0.01" value={vatAmount} onChange={(event) => { setVatAmount(event.target.value); setGrossAmount(calculateGross(netAmount, event.target.value)); }} className={fieldClass} /></label>
          <label className={labelClass}>Bruttó<input type="number" min="0" step="0.01" value={grossAmount} onChange={(event) => setGrossAmount(event.target.value)} className={fieldClass} /></label>
        </div></section>
        {canUpload && <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-4 text-sm font-semibold">Dokumentum</h3><DocumentUploadField file={file} onChange={setFile} disabled={submitting} status={uploading ? "uploading" : "idle"} /></section>}
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><label className={labelClass}>Megjegyzés<textarea rows="4" value={note} onChange={(event) => setNote(event.target.value)} className={`${fieldClass} h-auto py-3`} /></label></section>
        {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      </div></form>
      <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4"><button type="button" onClick={handleClose} disabled={submitting} className="h-10 rounded-md border border-[#d6dddc] bg-white px-5 text-xs">Mégse</button><button form="incoming-invoice-form" type="submit" disabled={submitting || loadingRelations} className="h-10 rounded-md bg-[#263b40] px-6 text-xs font-semibold text-white disabled:opacity-60">{submitting ? "Mentés…" : "Mentés"}</button></footer>
    </aside>
  </div>;
}
