import { useEffect, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { leadStatusLabels, leadSourceLabels, memberName } from "./leadDisplay.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

export default function LeadFormComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  if (!hasModule("LEADS") || !hasPermission(props.mode === "edit" ? "LEADS_EDIT" : "LEADS_CREATE")) return null;
  return <LeadForm {...props} />;
}

function LeadForm({ mode = "create", lead, onClose, onSaved }) {
  const { showSuccess } = useToast();
  const isEditing = mode === "edit";
  const [data, setData] = useState(() => ({
    name: lead?.name || "", companyName: lead?.companyName || "", email: lead?.email || "",
    phone: lead?.phone || "", status: lead?.status || "NEW", source: lead?.source || "OTHER",
    assignedMemberId: lead?.assignedMemberId ? String(lead.assignedMemberId) : "", note: lead?.note || "",
  }));
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const change = (event) => setData((current) => ({ ...current, [event.target.name]: event.target.value }));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);

  useEffect(() => {
    let active = true;
    apiClient.get("/members").then(({ data: result }) => { if (active) setMembers(result); })
      .catch(() => { if (active) setMembersError("A felelősök nem tölthetők be."); })
      .finally(() => { if (active) setMembersLoading(false); });
    return () => { active = false; };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    setError("");
    if (!data.name.trim() || data.name.trim().length > 200) { setError("A név kötelező, legfeljebb 200 karakter."); return; }
    if (data.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) { setError("Érvénytelen e-mail cím."); return; }
    const phone = data.phone.trim();
    if (phone && (!/^\+?[\d\s().-]+$/.test(phone) || phone.replace(/\D/g, "").length < 6 || phone.replace(/\D/g, "").length > 15)) { setError("Érvénytelen telefonszám."); return; }
    if (!Object.hasOwn(leadStatusLabels, data.status) || !Object.hasOwn(leadSourceLabels, data.source)) { setError("Érvénytelen státusz vagy forrás."); return; }
    if (data.assignedMemberId && !members.some((member) => String(member.id) === data.assignedMemberId)) { setError("Válassz érvényes felelőst."); return; }
    const payload = {
      ...data, name: data.name.trim(), companyName: data.companyName.trim() || null,
      email: data.email.trim() || null, phone: phone || null, note: data.note.trim() || null,
      assignedMemberId: data.assignedMemberId ? Number(data.assignedMemberId) : null,
    };
    setSubmitting(true);
    try {
      const response = isEditing ? await apiClient.patch(`/leads/${lead.id}`, payload) : await apiClient.post("/leads", payload);
      showSuccess(isEditing ? "Az érdeklődő sikeresen módosítva." : "Az érdeklődő sikeresen létrehozva.");
      onSaved?.(response.data);
      onClose();
    } catch (requestError) { setError(requestError.response?.data?.message || "Az érdeklődő mentése sikertelen."); }
    finally { setSubmitting(false); }
  };

  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="lead-form-title">
    <button type="button" aria-label="Érdeklődő űrlap bezárása" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-pointer border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />
    <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
      <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6"><div><p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Érdeklődők</p><h2 id="lead-form-title" className="text-xl font-semibold text-[#253238]">{isEditing ? "Érdeklődő szerkesztése" : "Új érdeklődő"}</h2><p className="mt-1.5 text-sm text-[#71807c]">Alapadatok és értékesítési adatok kezelése.</p></div><button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button></header>
      <form id="lead-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7"><div className="mx-auto grid max-w-3xl gap-7">
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3><div className="grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Név<input name="name" value={data.name} onChange={change} required maxLength={200} className={fieldClass} /></label>
          <label className={labelClass}>Cégnév<input name="companyName" value={data.companyName} onChange={change} maxLength={200} className={fieldClass} /></label>
          <label className={labelClass}>E-mail<input type="email" name="email" value={data.email} onChange={change} maxLength={254} className={fieldClass} /></label>
          <label className={labelClass}>Telefonszám<input type="tel" name="phone" value={data.phone} onChange={change} maxLength={50} className={fieldClass} /></label>
        </div></section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Értékesítési adatok</h3><div className="grid gap-5 sm:grid-cols-2">
          <label className={labelClass}>Státusz<select name="status" value={data.status} onChange={change} className={`${fieldClass} cursor-pointer`}>{Object.entries(leadStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass}>Forrás<select name="source" value={data.source} onChange={change} className={`${fieldClass} cursor-pointer`}>{Object.entries(leadSourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className={labelClass}>Felelős<select name="assignedMemberId" value={data.assignedMemberId} onChange={change} disabled={membersLoading || Boolean(membersError)} className={`${fieldClass} cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}><option value="">Nincs felelős</option>{members.map((member) => <option key={member.id} value={member.id}>{memberName(member)}</option>)}</select></label>
        </div>{membersError && <p role="alert" className="mt-4 text-xs text-[#9a4335]">{membersError}</p>}</section>
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-6"><h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Megjegyzés</h3><label className={labelClass}>Belső megjegyzés<textarea name="note" value={data.note} onChange={change} maxLength={10000} rows={5} className={`${fieldClass} h-auto resize-y py-3`} /></label></section>
        {error && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      </div></form>
      <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4"><button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Mégse</button><button type="submit" form="lead-form" disabled={submitting || membersLoading || Boolean(membersError)} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Érdeklődő létrehozása"}</button></footer>
    </aside>
  </div>;
}
