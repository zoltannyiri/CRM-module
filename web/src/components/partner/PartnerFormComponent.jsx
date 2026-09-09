import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";

const emptyForm = {
  type: "COMPANY",
  name: "",
  email: "",
  phone: "",
  website: "",
  taxNumber: "",
  address: "",
  note: "",
};

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:cursor-default disabled:bg-[#f5f7f6] disabled:text-[#536166]";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

export default function PartnerFormComponent({ mode = "create", partner, onClose, onSaved }) {
  const { showSuccess } = useToast();
  const [formData, setFormData] = useState(() => partner
    ? Object.fromEntries(Object.keys(emptyForm).map((key) => [key, partner[key] ?? emptyForm[key]]))
    : emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isEditing = mode === "edit";
  const isViewing = mode === "view";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isViewing) return;
    setSubmitting(true);
    setError("");

    const payload = Object.fromEntries(
      Object.entries(formData).map(([key, value]) => [key, typeof value === "string" ? value.trim() || null : value]),
    );
    payload.type = formData.type;

    try {
      const response = isEditing
        ? await apiClient.patch(`/partners/${partner.id}`, payload)
        : await apiClient.post("/partners", payload);
      onSaved?.(response.data);
      showSuccess(isEditing ? "A partner adatai sikeresen módosultak." : "A partner sikeresen létrejött.");
      onClose();
    } catch (requestError) {
      setError(requestError.message || "A partner mentése sikertelen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="partner-form-title">
      <button type="button" aria-label="Partner űrlap bezárása" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />

      <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
        <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Partnerek</p>
            <h2 id="partner-form-title" className="text-xl font-semibold text-[#253338]">{isViewing ? "Partner megtekintése" : isEditing ? "Partner szerkesztése" : "Új partner"}</h2>
            <p className="mt-1.5 text-sm text-[#71807c]">{isViewing ? "A partner mentett adatai." : isEditing ? "Módosítsd a partner adatait." : "Add meg az új partner alapadatait."}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button>
        </header>

        <form id="partner-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7">
          <fieldset disabled={isViewing} className="mx-auto grid max-w-3xl gap-7 border-0 p-0">
            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}>Partner típusa
                  <select name="type" value={formData.type} onChange={handleChange} className={fieldClass}>
                    <option value="COMPANY">Cég</option>
                    <option value="PERSON">Magánszemély</option>
                  </select>
                </label>
                <label className={`${labelClass} sm:col-span-2`}>Partner neve
                  <input name="name" value={formData.name} onChange={handleChange} className={fieldClass} placeholder="Partner neve" required autoFocus />
                </label>
                <label className={labelClass}>Email cím
                  <input type="email" name="email" value={formData.email} onChange={handleChange} className={fieldClass} placeholder="email@pelda.hu" />
                </label>
                <label className={labelClass}>Telefonszám
                  <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className={fieldClass} placeholder="+36 30 123 4567" />
                </label>
                <label className={labelClass}>Weboldal
                  <input name="website" value={formData.website} onChange={handleChange} className={fieldClass} placeholder="pelda.hu" />
                </label>
                <label className={labelClass}>Adószám
                  <input name="taxNumber" value={formData.taxNumber} onChange={handleChange} className={fieldClass} placeholder="12345678-2-42" />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>Cím / Székhely
                  <input name="address" value={formData.address} onChange={handleChange} className={fieldClass} placeholder="Irányítószám, település, cím" />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Megjegyzés</h3>
              <label className={labelClass}>
                <textarea
                  name="note"
                  value={formData.note}
                  onChange={handleChange}
                  rows="6"
                  className={`${fieldClass} h-auto resize-y py-3`}
                  placeholder="Megjegyzés a partnerről..."
                />
              </label>
            </section>

            {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
          </fieldset>
        </form>

        <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">{isViewing ? "Bezárás" : "Mégse"}</button>
          {!isViewing && <button type="submit" form="partner-form" disabled={submitting} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Partner létrehozása"}</button>}
        </footer>
      </aside>
    </div>
  );
}
