import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";

const emptyForm = {
  name: "",
  partnerId: "",
  status: "PLANNED",
  startDate: "",
  deadline: "",
  description: "",
};

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

function dateInputValue(value) {
  return value ? String(value).slice(0, 10) : "";
}

export default function ProjectFormComponent({ mode = "create", project, onClose, onSaved }) {
  const [formData, setFormData] = useState(() => project ? {
    name: project.name || "",
    partnerId: project.partnerId ? String(project.partnerId) : "",
    status: project.status || "PLANNED",
    startDate: dateInputValue(project.startDate),
    deadline: dateInputValue(project.deadline),
    description: project.description || "",
  } : emptyForm);
  const [partners, setPartners] = useState(() => project?.partner ? [project.partner] : []);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const isEditing = mode === "edit";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    apiClient.get("/partners")
      .then(({ data }) => {
        if (active) {
          setPartners(data);
          setError("");
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.message || "A partnerek betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setPartnersLoading(false);
      });
    return () => { active = false; };
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (formData.startDate && formData.deadline && formData.deadline < formData.startDate) {
      setError("A határidő nem lehet korábbi a kezdési dátumnál.");
      return;
    }

    setSubmitting(true);
    setError("");
    const payload = {
      name: formData.name.trim(),
      partnerId: formData.partnerId ? Number(formData.partnerId) : null,
      status: formData.status,
      startDate: formData.startDate || null,
      deadline: formData.deadline || null,
      description: formData.description.trim() || null,
    };

    try {
      const response = isEditing
        ? await apiClient.patch(`/projects/${project.id}`, payload)
        : await apiClient.post("/projects", payload);
      onSaved?.(response.data);
      onClose();
    } catch (requestError) {
      setError(requestError.message || "A projekt mentése sikertelen.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="project-form-title">
      <button type="button" aria-label="Projekt űrlap bezárása" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />

      <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
        <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Projektek</p>
            <h2 id="project-form-title" className="text-xl font-semibold text-[#253338]">{isEditing ? "Projekt szerkesztése" : "Új projekt"}</h2>
            <p className="mt-1.5 text-sm text-[#71807c]">{isEditing ? "Módosítsd a projekt alapadatait." : "Add meg az új projekt legfontosabb adatait."}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button>
        </header>

        <form id="project-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7">
          <div className="mx-auto grid max-w-3xl gap-7">
            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={`${labelClass} sm:col-span-2`}>Projekt neve
                  <input name="name" value={formData.name} onChange={handleChange} className={fieldClass} placeholder="Projekt neve" required autoFocus />
                </label>
                <label className={labelClass}>Partner
                  <select name="partnerId" value={formData.partnerId} onChange={handleChange} disabled={partnersLoading} className={`${fieldClass} disabled:cursor-wait disabled:bg-[#f5f7f6]`}>
                    <option value="">{partnersLoading ? "Partnerek betöltése…" : "Nincs partner hozzárendelve"}</option>
                    {partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
                  </select>
                </label>
                <label className={labelClass}>Státusz
                  <select name="status" value={formData.status} onChange={handleChange} className={fieldClass}>
                    <option value="PLANNED">Tervezett</option>
                    <option value="ACTIVE">Aktív</option>
                    <option value="ON_HOLD">Szüneteltetve</option>
                    <option value="COMPLETED">Befejezve</option>
                    <option value="CANCELLED">Megszakítva</option>
                  </select>
                </label>
                <label className={labelClass}>Kezdés
                  <input type="date" name="startDate" value={formData.startDate} onChange={handleChange} className={fieldClass} />
                </label>
                <label className={labelClass}>Határidő
                  <input type="date" name="deadline" min={formData.startDate || undefined} value={formData.deadline} onChange={handleChange} className={fieldClass} />
                </label>
              </div>
            </section>

            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Leírás</h3>
              <label className={labelClass}>Projekt leírása
                <textarea name="description" value={formData.description} onChange={handleChange} rows="7" className={`${fieldClass} h-auto resize-y py-3`} placeholder="Rövid összefoglaló a projektről…" />
              </label>
            </section>

            {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
          </div>
        </form>

        <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Mégse</button>
          <button type="submit" form="project-form" disabled={submitting || partnersLoading} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Projekt létrehozása"}</button>
        </footer>
      </aside>
    </div>
  );
}
