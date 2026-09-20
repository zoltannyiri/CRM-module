import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { canConvertLead, partnerPrefillFromLead } from "./leadConversion.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:cursor-default disabled:bg-[#f5f7f6]";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

export default function LeadConversionFormComponent({ lead, onClose, onConverted }) {
  const { hasModule, hasPermission } = useAuth();
  const { showSuccess } = useToast();
  const [formData, setFormData] = useState(() => partnerPrefillFromLead(lead));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const allowed = canConvertLead({ lead, hasModule, hasPermission });

  useEffect(() => {
    if (!allowed) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => { if (event.key === "Escape" && !submitting) onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [allowed, onClose, submitting]);

  if (!allowed) return null;

  const change = ({ target: { name, value } }) => setFormData((current) => ({ ...current, [name]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true); setError("");
    const partner = Object.fromEntries(Object.entries(formData).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value]));
    partner.type = formData.type;
    try {
      const { data } = await apiClient.post(`/leads/${lead.id}/convert`, { partner }, { skipGlobalErrorToast: true });
      showSuccess("Partner sikeresen létrehozva.");
      onConverted?.(data);
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Az érdeklődő partnerré alakítása sikertelen.");
    } finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="lead-conversion-title">
    <button type="button" aria-label="Konverziós űrlap bezárása" disabled={submitting} onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200 disabled:cursor-wait" />
    <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
      <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-5 py-5 sm:px-7 sm:py-6"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Érdeklődők</p><h2 id="lead-conversion-title" className="text-xl font-semibold text-[#253338]">Partnerré alakítás</h2><p className="mt-1.5 text-sm text-[#71807c]">Új partner létrehozása az érdeklődőből.</p></div><button type="button" onClick={onClose} disabled={submitting} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium disabled:cursor-wait">Bezárás</button></header>
      <form id="lead-conversion-form" onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-6 sm:px-7 sm:py-7"><div className="mx-auto grid max-w-3xl gap-6">
        <p className="rounded-lg border border-[#d9e5da] bg-[#f4f8f3] px-4 py-3 text-sm leading-6 text-[#506458]">A művelet új Partnert hoz létre az érdeklődő adatai alapján. Az eredeti érdeklődő és annak előzményei megmaradnak.</p>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-5 sm:p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Partner adatai</h3><div className="grid gap-5 sm:grid-cols-2">
          <label className={`${labelClass} sm:col-span-2`}>Partner típusa<select name="type" value={formData.type} onChange={change} className={fieldClass}><option value="COMPANY">Cég</option><option value="PERSON">Magánszemély</option></select></label>
          <label className={`${labelClass} sm:col-span-2`}>Partner neve<input name="name" value={formData.name} onChange={change} className={fieldClass} required autoFocus maxLength="200" /></label>
          <label className={labelClass}>Email cím<input type="email" name="email" value={formData.email} onChange={change} className={fieldClass} /></label>
          <label className={labelClass}>Telefonszám<input type="tel" name="phone" value={formData.phone} onChange={change} className={fieldClass} /></label>
          <label className={labelClass}>Weboldal<input name="website" value={formData.website} onChange={change} className={fieldClass} /></label>
          <label className={labelClass}>Adószám<input name="taxNumber" value={formData.taxNumber} onChange={change} className={fieldClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Cím / Székhely<input name="address" value={formData.address} onChange={change} className={fieldClass} /></label>
          <label className={`${labelClass} sm:col-span-2`}>Megjegyzés<textarea name="note" value={formData.note} onChange={change} rows="5" className={`${fieldClass} h-auto resize-y py-3`} /></label>
        </div></section>
        {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      </div></form>
      <footer className="flex flex-col-reverse gap-3 border-t border-[#dfe5e3] bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7"><button type="button" onClick={onClose} disabled={submitting} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium disabled:cursor-wait">Mégse</button><button type="submit" form="lead-conversion-form" disabled={submitting} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{submitting ? "Átalakítás…" : "Partnerré alakítás"}</button></footer>
    </aside>
  </div>;
}
