import { useEffect, useRef, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { memberName } from "../lead/leadDisplay.js";
import { followUpAccess, followUpTypeLabels, followUpStatusLabels, toLocalDateTime, toApiTimestamp, formatFollowUpTime } from "./followUpDisplay.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3 text-sm text-[#263338] outline-none focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:bg-[#f5f7f6]";
const buttonClass = "h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6] disabled:cursor-wait disabled:opacity-50";
export default function FollowUpFormComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  const access = followUpAccess(hasModule, hasPermission);
  if (!(props.mode === "edit" ? access.edit : props.mode === "view" ? access.view : access.create)) return null;
  return <FollowUpForm {...props} />;
}
function FollowUpForm({ mode = "create", followUp, leadId: presetLeadId, onClose, onSaved }) {
  const editing = mode === "edit", viewing = mode === "view";
  const { showSuccess } = useToast();
  const [leadId, setLeadId] = useState(String(followUp?.leadId || presetLeadId || ""));
  const [type, setType] = useState(followUp?.type || "CALL");
  const [dueAt, setDueAt] = useState(toLocalDateTime(followUp?.dueAt));
  const [assignedMemberId, setAssignedMemberId] = useState(String(followUp?.assignedMemberId || ""));
  const [note, setNote] = useState(followUp?.note || "");
  const [status, setStatus] = useState(followUp?.status || "OPEN");
  const [options, setOptions] = useState({ leads: [], members: [], loading: !viewing, error: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [onClose]);
  useEffect(() => {
    if (viewing) return undefined;
    let active = true;
    Promise.all([editing ? Promise.resolve({ data: [followUp.lead] }) : apiClient.get("/leads", { skipGlobalErrorToast: true }), apiClient.get("/members", { skipGlobalErrorToast: true })])
      .then(([leads, members]) => { if (active) setOptions({ leads: leads.data, members: members.data, loading: false, error: "" }); })
      .catch(() => { if (active) setOptions({ leads: [], members: [], loading: false, error: "Az érdeklődők vagy felelősök nem tölthetők be." }); });
    return () => { active = false; };
  }, [editing, viewing, followUp]);
  const submit = async (event) => {
    event.preventDefault();
    if (viewing || pending.current || options.loading || options.error) return;
    // Preserve the exact instant on metadata-only edits, even in the autumn
    // repeated hour and when the original value contains seconds/milliseconds.
    const timestamp = editing && dueAt === toLocalDateTime(followUp.dueAt) ? followUp.dueAt : toApiTimestamp(dueAt);
    if (!timestamp || !Object.hasOwn(followUpTypeLabels, type) || !options.leads.some(({ id }) => String(id) === leadId) ||
      assignedMemberId && !options.members.some(({ id }) => String(id) === assignedMemberId)) { setError("Válassz érvényes érdeklődőt, időpontot és felelőst."); return; }
    pending.current = true; setSubmitting(true); setError("");
    const payload = { ...(!editing && { leadId: Number(leadId) }), type, dueAt: timestamp, assignedMemberId: assignedMemberId ? Number(assignedMemberId) : null, note: note.trim() || null,
      ...(editing && status !== followUp.status && { status }),
    };
    try {
      const { data } = editing ? await apiClient.patch(`/follow-ups/${followUp.id}`, payload, { skipGlobalErrorToast: true }) : await apiClient.post("/follow-ups", payload, { skipGlobalErrorToast: true });
      showSuccess(editing ? "Utánkövetés sikeresen módosítva." : "Utánkövetés sikeresen létrehozva.");
      onSaved?.(data); onClose();
    } catch (requestError) { setError(requestError.response?.data?.message || "Az utánkövetés mentése sikertelen."); }
    finally { pending.current = false; setSubmitting(false); }
  };
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="follow-up-form-title">
    <button type="button" onClick={onClose} aria-label="Utánkövetés bezárása" className="starting:opacity-0 absolute inset-0 cursor-pointer border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />
    <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
      <header className="flex items-start justify-between gap-4 border-b border-[#dfe5e3] bg-white px-7 py-6"><div><p className="mb-1 text-[10px] uppercase tracking-[.12em] text-[#84918e]">Értékesítés</p><h2 id="follow-up-form-title" className="text-xl font-semibold">{editing ? "Utánkövetés szerkesztése" : viewing ? "Utánkövetés" : "Új utánkövetés"}</h2></div><button type="button" onClick={onClose} className={buttonClass}>Bezárás</button></header>
      <form id="follow-up-form" onSubmit={submit} className="flex-1 overflow-y-auto px-7 py-7">
        {options.loading ? <div role="status" aria-label="Űrlap betöltése" className="grid min-h-40 place-items-center"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div> : <fieldset disabled={viewing || submitting || Boolean(options.error)} className="mx-auto grid max-w-3xl gap-5 rounded-lg border border-[#dfe5e3] bg-white p-6">
          <label className="grid gap-2 text-xs font-medium text-[#536166]">Érdeklődő{editing || viewing ? <span className="text-sm text-[#263338]">{followUp.lead.name}</span> : <select value={leadId} onChange={(event) => setLeadId(event.target.value)} required className={`${fieldClass} cursor-pointer`}><option value="">Válassz érdeklődőt</option>{options.leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}{lead.companyName ? ` · ${lead.companyName}` : ""}</option>)}</select>}</label>
          <label className="grid gap-2 text-xs font-medium text-[#536166]">Típus<select value={type} onChange={(event) => setType(event.target.value)} className={`${fieldClass} cursor-pointer`}>{Object.entries(followUpTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="grid gap-2 text-xs font-medium text-[#536166]">Időpont<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} required className={fieldClass} /></label>
          <label className="grid gap-2 text-xs font-medium text-[#536166]">Felelős{viewing ? <span className="text-sm">{memberName(followUp.assignedMember)}</span> : <select value={assignedMemberId} onChange={(event) => setAssignedMemberId(event.target.value)} className={`${fieldClass} cursor-pointer`}><option value="">Nincs felelős</option>{options.members.map((member) => <option key={member.id} value={member.id}>{memberName(member)}</option>)}</select>}</label>
          {editing && <label className="grid gap-2 text-xs font-medium text-[#536166]">Állapot<select value={status} onChange={(event) => setStatus(event.target.value)} className={`${fieldClass} cursor-pointer`}>{followUp.status === "COMPLETED" && <option value="COMPLETED">Teljesítve</option>}<option value="OPEN">Nyitott</option><option value="CANCELLED">Lemondva</option></select></label>}
          <label className="grid gap-2 text-xs font-medium text-[#536166]">Megjegyzés<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={10000} rows={5} className={`${fieldClass} h-auto py-3`} /></label>
          {viewing && followUp.completedAt && <p className="text-xs text-[#71807c]">Teljesítve: {formatFollowUpTime(followUp.completedAt)}</p>}
          {viewing && <p className="text-xs text-[#71807c]">Állapot: {followUpStatusLabels[followUp.status]}</p>}
        </fieldset>}
        {(error || options.error) && <p role="alert" className="mt-5 rounded-md border border-[#efd7d1] bg-[#fdf1ee] p-4 text-sm text-[#9a4335]">{error || options.error}</p>}
      </form>
      <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4"><button type="button" onClick={onClose} className={buttonClass}>{viewing ? "Bezárás" : "Mégse"}</button>{!viewing && <button type="submit" form="follow-up-form" disabled={submitting || options.loading || Boolean(options.error)} className="h-10 cursor-pointer rounded-md bg-[#263b40] px-6 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-50">{submitting ? "Mentés…" : "Mentés"}</button>}</footer>
    </aside>
  </div>;
}
