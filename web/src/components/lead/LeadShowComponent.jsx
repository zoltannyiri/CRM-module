import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { formatLeadDate, memberName, leadStatusClasses, leadStatusLabels, leadSourceLabels } from "./leadDisplay.js";

function Row({ label, children }) {
  return <div className="grid grid-cols-1 gap-1 sm:grid-cols-3"><dt className="text-[#71807c]">{label}</dt><dd className="font-medium break-words text-[#253238] sm:col-span-2">{children || "—"}</dd></div>;
}

export default function LeadShowComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  if (!hasModule("LEADS") || !hasPermission("LEADS_VIEW")) return null;
  return <LeadShow {...props} />;
}

function LeadShow({ leadId, onEdit }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get(`/leads/${leadId}`).then(({ data }) => { if (active) setLead(data); })
      .catch((requestError) => { if (active) setError(requestError.response?.status === 404 ? "Az érdeklődő nem található." : "Az érdeklődő adatai nem tölthetők be."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [leadId]);

  const handleDelete = async () => {
    if (deleting || !window.confirm(`Biztosan törölni szeretnéd ezt az érdeklődőt: ${lead.name}?`)) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/leads/${lead.id}`, { skipGlobalErrorToast: true });
      showSuccess("Az érdeklődő sikeresen törölve.");
      navigate("/lead");
    } catch (requestError) { showError(requestError.response?.data?.message || "Az érdeklődő törlése sikertelen."); setDeleting(false); }
  };

  if (loading) return <div role="status" aria-label="Érdeklődő betöltése" className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>;
  if (error) return <div role="alert" className="rounded-xl border border-[#efd7d1] bg-white p-8 text-center"><h3 className="text-sm font-semibold">{error}</h3><Link to="/lead" className="mt-5 inline-flex h-9 cursor-pointer items-center rounded-md border border-[#d6dddc] px-4 text-xs">Vissza az érdeklődőkhöz</Link></div>;
  if (!lead) return null;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
      <div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Érdeklődő</p><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold break-words">{lead.name}</h2><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${leadStatusClasses[lead.status]}`}>{leadStatusLabels[lead.status]}</span></div><p className="mt-1 text-xs text-[#71807c]">{lead.companyName}</p></div>
      <div className="flex gap-2">{hasPermission("LEADS_EDIT") && <button type="button" onClick={() => onEdit?.(lead)} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3.5 text-xs font-medium"><i className="pi pi-pencil text-xs" aria-hidden="true" />Módosítás</button>}{hasPermission("LEADS_DELETE") && <button type="button" onClick={handleDelete} disabled={deleting} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#ecd5d1] bg-white px-3.5 text-xs font-medium text-[#9d3c32] disabled:cursor-wait disabled:opacity-60"><i className={`pi ${deleting ? "pi-spinner pi-spin" : "pi-trash"} text-xs`} aria-hidden="true" />Törlés</button>}</div>
    </div>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Alapadatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Név">{lead.name}</Row><Row label="Cégnév">{lead.companyName}</Row><Row label="E-mail">{lead.email}</Row><Row label="Telefon">{lead.phone}</Row><Row label="Státusz">{leadStatusLabels[lead.status]}</Row><Row label="Forrás">{leadSourceLabels[lead.source]}</Row><Row label="Felelős">{memberName(lead.assignedMember)}</Row></dl></section>
      <section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Metaadatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Létrehozta">{memberName(lead.createdByMember)}</Row><Row label="Létrehozva">{formatLeadDate(lead.createdAt)}</Row><Row label="Módosítva">{formatLeadDate(lead.updatedAt)}</Row></dl></section>
    </div>
    <section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 text-sm font-semibold">Megjegyzés</h3><p className="text-sm whitespace-pre-wrap break-words text-[#536166]">{lead.note || "—"}</p></section>
  </div>;
}
