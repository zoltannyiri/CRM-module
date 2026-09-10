import { useEffect, useMemo, useState } from "react";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { calculateDraftTotals, formatMoney } from "./offerDisplay.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";
const emptyItem = () => ({ name: "", description: "", quantity: "1", unit: "db", unitPrice: "0", vatRate: "27" });
const dateInput = (value) => value ? new Date(value).toISOString().slice(0, 10) : "";
const defaultIssueDate = new Date().toISOString().slice(0, 10);
const defaultExpiryDate = new Date(new Date(`${defaultIssueDate}T00:00:00.000Z`).getTime() + 30 * 86400000).toISOString().slice(0, 10);

export default function OfferFormComponent(props) {
  const { hasPermission } = useAuth();
  const allowed = (props.mode || "create") === "edit" ? hasPermission("OFFERS_EDIT") : hasPermission("OFFERS_CREATE");
  if (!allowed) return null;
  return <OfferForm {...props} />;
}

function OfferForm({ mode = "create", offer, defaultPartnerId, defaultProjectId, onClose, onSaved }) {
  const { hasModule, hasPermission } = useAuth();
  const { showSuccess } = useToast();
  const isEditing = mode === "edit";
  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canUseProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");
  const [partnerId, setPartnerId] = useState(() => String(defaultPartnerId || offer?.partner?.id || ""));
  const [projectId, setProjectId] = useState(() => String(defaultProjectId || offer?.project?.id || ""));
  const [status, setStatus] = useState(() => offer?.status || "DRAFT");
  const [issueDate, setIssueDate] = useState(() => dateInput(offer?.issueDate) || defaultIssueDate);
  const [validUntil, setValidUntil] = useState(() => dateInput(offer?.validUntil) || defaultExpiryDate);
  const [currency, setCurrency] = useState(() => offer?.currency || "HUF");
  const [note, setNote] = useState(() => offer?.note || "");
  const [items, setItems] = useState(() => offer?.items?.length ? offer.items.map((item) => ({ ...item })) : [emptyItem()]);
  const [partners, setPartners] = useState(() => offer?.partner ? [offer.partner] : []);
  const [projects, setProjects] = useState(() => offer?.project ? [offer.project] : []);
  const [loadingRelations, setLoadingRelations] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const totals = useMemo(() => calculateDraftTotals(items), [items]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    Promise.all([
      canUsePartners ? apiClient.get("/partners") : Promise.resolve({ data: [] }),
      canUseProjects ? apiClient.get("/projects") : Promise.resolve({ data: [] }),
    ]).then(([partnerResponse, projectResponse]) => {
      if (!active) return;
      setPartners(partnerResponse.data);
      setProjects(projectResponse.data);
    }).catch(() => { if (active) setError("A kapcsolódó adatok nem tölthetők be."); }).finally(() => { if (active) setLoadingRelations(false); });
    return () => { active = false; };
  }, [canUsePartners, canUseProjects]);

  const updateItem = (index, field, value) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const removeItem = (index) => setItems((current) => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!isEditing && !canUsePartners) { setError("Ajánlat létrehozásához partner megtekintési jogosultság szükséges."); return; }
    if (canUsePartners && !partnerId) { setError("Partner kiválasztása kötelező."); return; }
    if (validUntil < issueDate) { setError("Az érvényesség vége nem lehet korábbi a kiállítás dátumánál."); return; }
    if (items.some((item) => {
      const values = [Number(item.quantity), Number(item.unitPrice), Number(item.vatRate)];
      return !item.name.trim() || !item.unit.trim() || values.some((value) => !Number.isFinite(value)) || values[0] <= 0 || values[1] < 0 || values[2] < 0 || values[2] > 100;
    })) {
      setError("Ellenőrizd a tételsorok kötelező mezőit és számait.");
      return;
    }
    const payload = {
      ...(canUsePartners && { partnerId: Number(partnerId) }),
      ...(canUseProjects && { projectId: projectId ? Number(projectId) : null }),
      status,
      issueDate,
      validUntil,
      currency,
      note: note.trim() || null,
      items: items.map(({ name, description, quantity, unit, unitPrice, vatRate }) => ({ name: name.trim(), description: description?.trim() || null, quantity, unit: unit.trim(), unitPrice, vatRate })),
    };
    setSubmitting(true);
    try {
      const response = isEditing ? await apiClient.patch(`/offers/${offer.id}`, payload) : await apiClient.post("/offers", payload);
      onSaved?.(response.data);
      showSuccess(isEditing ? "Az ajánlat sikeresen módosítva." : "Az ajánlat sikeresen létrehozva.");
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Az ajánlat mentése sikertelen.");
    } finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="offer-form-title">
    <button type="button" aria-label="Ajánlat űrlap bezárása" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />
    <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
      <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Ajánlatok</p><h2 id="offer-form-title" className="text-xl font-semibold text-[#253238]">{isEditing ? `${offer.offerNumber} szerkesztése` : "Új ajánlat"}</h2><p className="mt-1.5 text-sm text-[#71807c]">Ajánlati alapadatok és tételsorok kezelése.</p></div><button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button></header>
      <form id="offer-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7"><div className="mx-auto grid max-w-3xl gap-7">
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3><div className="grid gap-5 sm:grid-cols-2">
          {canUsePartners && <label className={labelClass}>Partner <span><select value={partnerId} onChange={(event) => setPartnerId(event.target.value)} disabled={loadingRelations || Boolean(defaultPartnerId)} className={fieldClass} required><option value="">Válassz partnert</option>{partners.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}</select></span></label>}
          {canUseProjects && <label className={labelClass}>Projekt (opcionális)<select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={loadingRelations || Boolean(defaultProjectId)} className={fieldClass}><option value="">Nincs projekthez kapcsolva</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>}
          <label className={labelClass}>Státusz<select value={status} onChange={(event) => setStatus(event.target.value)} className={fieldClass}><option value="DRAFT">Piszkozat</option><option value="SENT">Elküldve</option><option value="ACCEPTED">Elfogadva</option><option value="REJECTED">Elutasítva</option><option value="EXPIRED">Lejárt</option><option value="CANCELLED">Visszavonva</option></select></label>
          <label className={labelClass}>Pénznem<select value={currency} onChange={(event) => setCurrency(event.target.value)} className={fieldClass}><option value="HUF">HUF</option><option value="EUR">EUR</option><option value="USD">USD</option></select></label>
          <label className={labelClass}>Kiállítás dátuma<input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} className={fieldClass} required /></label>
          <label className={labelClass}>Érvényes eddig<input type="date" min={issueDate} value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className={fieldClass} required /></label>
        </div></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><div className="mb-5 flex items-center justify-between"><h3 className="text-sm font-semibold text-[#2b393e]">Tételek</h3><button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] hover:bg-[#f5f7f6]">Tétel hozzáadása</button></div><div className="grid gap-4">
          {items.map((item, index) => { const row = calculateDraftTotals([item]); return <div key={index} className="rounded-md border border-[#e1e6e4] bg-[#fafbfb] p-4"><div className="mb-3 flex items-center justify-between"><span className="text-xs font-semibold text-[#536166]">{index + 1}. tétel</span><button type="button" onClick={() => removeItem(index)} disabled={items.length === 1} className="grid size-8 place-items-center rounded-md text-[#9d3c32] hover:bg-[#fdf1ee] disabled:opacity-30" aria-label={`${index + 1}. tétel törlése`}><i className="pi pi-trash text-xs" aria-hidden="true" /></button></div><div className="grid gap-3 sm:grid-cols-2">
            <label className={`${labelClass} sm:col-span-2`}>Megnevezés<input value={item.name} onChange={(event) => updateItem(index, "name", event.target.value)} className={fieldClass} required /></label>
            <label className={`${labelClass} sm:col-span-2`}>Leírás<input value={item.description || ""} onChange={(event) => updateItem(index, "description", event.target.value)} className={fieldClass} /></label>
            <label className={labelClass}>Mennyiség<input type="number" min="0.0001" step="0.0001" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} className={fieldClass} required /></label>
            <label className={labelClass}>Egység<input value={item.unit} maxLength="32" onChange={(event) => updateItem(index, "unit", event.target.value)} className={fieldClass} required /></label>
            <label className={labelClass}>Nettó egységár<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateItem(index, "unitPrice", event.target.value)} className={fieldClass} required /></label>
            <label className={labelClass}>ÁFA %<input type="number" min="0" max="100" step="0.01" value={item.vatRate} onChange={(event) => updateItem(index, "vatRate", event.target.value)} className={fieldClass} required /></label>
          </div><div className="mt-3 flex justify-end gap-5 border-t border-[#e5e9e7] pt-3 text-xs"><span>Nettó: <strong>{formatMoney(row.net, currency)}</strong></span><span>Bruttó: <strong>{formatMoney(row.gross, currency)}</strong></span></div></div>; })}
        </div></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-4 text-sm font-semibold text-[#2b393e]">Összesítés</h3><dl className="ml-auto grid max-w-sm gap-3 text-sm"><div className="flex justify-between"><dt>Nettó összesen</dt><dd className="font-semibold">{formatMoney(totals.net, currency)}</dd></div><div className="flex justify-between"><dt>ÁFA</dt><dd className="font-semibold">{formatMoney(totals.vat, currency)}</dd></div><div className="flex justify-between border-t border-[#dfe5e3] pt-3 text-base"><dt>Bruttó összesen</dt><dd className="font-bold">{formatMoney(totals.gross, currency)}</dd></div></dl></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Megjegyzés</h3><label className={labelClass}>Belső megjegyzés<textarea value={note} onChange={(event) => setNote(event.target.value)} rows="5" className={`${fieldClass} h-auto resize-y py-3`} /></label></section>
        {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      </div></form>
      <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4"><button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Mégse</button><button type="submit" form="offer-form" disabled={submitting || loadingRelations} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Ajánlat létrehozása"}</button></footer>
    </aside>
  </div>;
}
