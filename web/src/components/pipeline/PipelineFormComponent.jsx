import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { pipelineAccess } from "./pipelineDisplay.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const buttonClass = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6] disabled:cursor-not-allowed disabled:opacity-40";
const defaults = ["Új érdeklődő", "Kapcsolatfelvétel", "Igényfelmérés", "Ajánlat", "Tárgyalás", "Megnyert", "Elveszett"];

export default function PipelineFormComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  const access = pipelineAccess(hasModule, hasPermission);
  if (!(props.mode === "edit" ? access.edit : access.create)) return null;
  return <PipelineForm {...props} canDelete={access.delete} />;
}

function PipelineForm({ mode = "create", pipeline, canDelete, onClose, onSaved }) {
  const editing = mode === "edit";
  const { showSuccess } = useToast();
  const [name, setName] = useState(pipeline?.name || "");
  const [isDefault, setIsDefault] = useState(pipeline?.isDefault || false);
  const [stages, setStages] = useState(() => pipeline?.stages.map(({ id, name }) => ({ id, name })) || defaults.map((name) => ({ name })));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", keyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", keyDown); };
  }, [onClose]);

  const reorder = (index, direction) => setStages((current) => {
    const next = [...current];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    return next;
  });
  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    if (!name.trim() || name.trim().length > 200 || !stages.length || stages.some((stage) => !stage.name.trim() || stage.name.trim().length > 200)) {
      setError("Adj meg érvényes nevet a Pipeline-nak és minden szakasznak."); return;
    }
    setSubmitting(true);
    const payload = { name: name.trim(), isDefault, stages: stages.map((stage) => ({ ...(stage.id !== undefined && { id: stage.id }), name: stage.name.trim() })) };
    try {
      const { data } = editing ? await apiClient.patch(`/pipelines/${pipeline.id}`, payload) : await apiClient.post("/pipelines", payload);
      showSuccess(editing ? "Pipeline sikeresen módosítva." : "Pipeline sikeresen létrehozva.");
      onSaved?.(data); onClose();
    } catch (requestError) { setError(requestError.response?.data?.message || "A Pipeline mentése sikertelen."); }
    finally { setSubmitting(false); }
  };
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="pipeline-form-title">
    <button type="button" onClick={onClose} aria-label="Pipeline űrlap bezárása" className="starting:opacity-0 absolute inset-0 cursor-pointer border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />
    <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
      <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Pipeline</p><h2 id="pipeline-form-title" className="text-xl font-semibold">{editing ? "Pipeline beállítások" : "Új Pipeline"}</h2><p className="mt-1.5 text-sm text-[#71807c]">Pipeline és értékesítési szakaszok kezelése.</p></div><button type="button" onClick={onClose} className={buttonClass}>Bezárás</button></header>
      <form id="pipeline-form" onSubmit={submit} className="flex-1 overflow-y-auto px-7 py-7"><div className="mx-auto grid max-w-3xl gap-7">
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold">Alapadatok</h3><label className="grid gap-2 text-xs font-medium text-[#536166]">Név<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={200} className={fieldClass} /></label><label className="mt-5 flex cursor-pointer items-center gap-2 text-xs text-[#536166]"><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} className="cursor-pointer accent-[#78ad7d]" />Alapértelmezett Pipeline</label></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><div className="mb-5 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">Szakaszok</h3><button type="button" disabled={stages.length >= 100} onClick={() => setStages((current) => [...current, { name: "" }])} className={buttonClass}>Szakasz hozzáadása</button></div><div className="grid gap-3">
          {stages.map((stage, index) => <div key={stage.id || `new-${index}`} className="flex items-center gap-2"><label className="min-w-0 flex-1"><span className="sr-only">{index + 1}. szakasz neve</span><input value={stage.name} onChange={(event) => setStages((current) => current.map((item, at) => at === index ? { ...item, name: event.target.value } : item))} required maxLength={200} className={fieldClass} /></label><button type="button" disabled={index === 0} onClick={() => reorder(index, -1)} className={buttonClass} aria-label={`${index + 1}. szakasz feljebb`}><i className="pi pi-arrow-up" aria-hidden="true" /></button><button type="button" disabled={index === stages.length - 1} onClick={() => reorder(index, 1)} className={buttonClass} aria-label={`${index + 1}. szakasz lejjebb`}><i className="pi pi-arrow-down" aria-hidden="true" /></button>{(!stage.id || canDelete) && <button type="button" disabled={stages.length === 1} onClick={() => setStages((current) => current.filter((_, at) => at !== index))} className={`${buttonClass} text-[#9d3c32]`} aria-label={`${index + 1}. szakasz törlése`}><i className="pi pi-trash" aria-hidden="true" /></button>}</div>)}
        </div><p className="mt-4 text-xs text-[#84918e]">Foglalt szakasz törlése előtt helyezd át az érdeklődőket. A változtatások a mentéskor lépnek életbe.</p></section>
        {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      </div></form>
      <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4"><button type="button" onClick={onClose} className={`${buttonClass} h-10 px-5`}>Mégse</button><button type="submit" form="pipeline-form" disabled={submitting} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : "Mentés"}</button></footer>
    </aside>
  </div>;
}
