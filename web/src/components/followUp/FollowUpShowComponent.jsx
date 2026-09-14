import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { memberName } from "../lead/leadDisplay.js";
import { followUpAccess, followUpStatusLabels, followUpTypeLabels, formatFollowUpTime, isFollowUpOverdue } from "./followUpDisplay.js";

const card = "rounded-xl border border-[#dbe1df] bg-white p-6";
const button = "inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border bg-white px-3.5 text-xs font-medium disabled:cursor-wait disabled:opacity-60";

function Row({ label, children }) {
  return <div className="grid grid-cols-1 gap-1 sm:grid-cols-3"><dt className="text-[#71807c]">{label}</dt><dd className="min-w-0 font-medium break-words text-[#253238] sm:col-span-2">{children || "—"}</dd></div>;
}

export default function FollowUpShowComponent(props) {
  const { hasModule, hasPermission } = useAuth();
  if (!followUpAccess(hasModule, hasPermission).view) return null;
  return <FollowUpShow key={props.followUpId} {...props} />;
}

function FollowUpShow({ followUpId, reloadKey = 0, onEdit }) {
  const navigate = useNavigate();
  const { hasModule, hasPermission } = useAuth();
  const access = followUpAccess(hasModule, hasPermission);
  const { showSuccess, showError } = useToast();
  const [result, setResult] = useState({ item: null, error: "", resolvedKey: null });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const request = useRef(0);
  const loadKey = `${followUpId}-${reloadKey}`;

  useEffect(() => {
    const token = ++request.current;
    let active = true;
    apiClient.get(`/follow-ups/${followUpId}`, { skipGlobalErrorToast: true })
      .then(({ data }) => { if (active && token === request.current) setResult({ item: data, error: "", resolvedKey: loadKey }); })
      .catch((error) => { if (active && token === request.current) setResult({ item: null, error: error.response?.status === 404 ? "Az utánkövetés nem található." : "Az utánkövetés adatai nem tölthetők be.", resolvedKey: loadKey }); });
    return () => { active = false; };
  }, [followUpId, loadKey]);

  const mutate = async (kind) => {
    const item = result.item;
    if (pending.current || !item || !access[kind] || kind === "complete" && item.status !== "OPEN") return;
    if (kind === "delete" && !window.confirm("Biztosan törölni szeretnéd ezt az utánkövetést?")) return;
    pending.current = true; setBusy(true);
    const token = ++request.current;
    try {
      if (kind === "complete") {
        const { data } = await apiClient.patch(`/follow-ups/${item.id}/complete`, {}, { skipGlobalErrorToast: true });
        if (token === request.current) setResult({ item: data, error: "", resolvedKey: loadKey });
        showSuccess("Utánkövetés sikeresen teljesítve.");
      } else {
        await apiClient.delete(`/follow-ups/${item.id}`, { skipGlobalErrorToast: true });
        showSuccess("Utánkövetés sikeresen törölve.");
        navigate("/follow-up");
      }
    } catch { showError(kind === "complete" ? "Az utánkövetés teljesítése sikertelen." : "Az utánkövetés törlése sikertelen."); }
    finally { pending.current = false; setBusy(false); }
  };

  if (result.resolvedKey !== loadKey) return <div role="status" aria-label="Utánkövetés betöltése" className={`${card} grid min-h-[300px] place-items-center`}><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>;
  if (result.error) return <div role="alert" className={`${card} text-center`}><h3 className="text-sm font-semibold">{result.error}</h3><Link to="/follow-up" className={`${button} mt-5 border-[#d6dddc]`}>Vissza az utánkövetésekhez</Link></div>;
  const item = result.item;
  if (!item) return null;
  const statusClass = item.status === "COMPLETED" ? "border-[#c8dfcb] bg-[#edf5ee] text-[#4d7853]" : item.status === "CANCELLED" ? "border-[#dbe1df] bg-[#f5f7f6] text-[#71807c]" : "border-[#e7ddc3] bg-[#faf6eb] text-[#8a713b]";
  return <div className="space-y-5">
    <section className={`${card} flex flex-wrap items-center justify-between gap-4 shadow-[0_1px_2px_rgba(24,39,43,0.02)]`}>
      <div className="min-w-0"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Utánkövetés</p><div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold break-words">{item.lead.name}</h2><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${statusClass}`}>{followUpStatusLabels[item.status]}</span></div><p className="mt-1 text-xs text-[#71807c]">{followUpTypeLabels[item.type]} · {formatFollowUpTime(item.dueAt)}</p>{isFollowUpOverdue(item) && <p className="mt-1 text-xs text-[#9a4335]">Lejárt utánkövetés</p>}</div>
      <div className="flex flex-wrap gap-2">{access.complete && item.status === "OPEN" && <button type="button" onClick={() => mutate("complete")} disabled={busy} className={`${button} border-[#c8dfcb] text-[#4d7853]`}><i className="pi pi-check text-xs" aria-hidden="true" />Teljesítve</button>}{access.edit && onEdit && <button type="button" onClick={() => { if (!pending.current) onEdit(item); }} disabled={busy} className={`${button} border-[#d6dddc]`}><i className="pi pi-pencil text-xs" aria-hidden="true" />Módosítás</button>}{access.delete && <button type="button" onClick={() => mutate("delete")} disabled={busy} className={`${button} border-[#ecd5d1] text-[#9d3c32]`}><i className="pi pi-trash text-xs" aria-hidden="true" />Törlés</button>}</div>
    </section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Alapadatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Érdeklődő"><Link to={`/lead/${item.lead.id}`} className="text-[#4d7853] hover:underline">{item.lead.name}</Link></Row><Row label="Cégnév">{item.lead.companyName}</Row><Row label="Típus">{followUpTypeLabels[item.type]}</Row><Row label="Időpont">{formatFollowUpTime(item.dueAt)}</Row><Row label="Felelős">{memberName(item.assignedMember)}</Row><Row label="Állapot">{followUpStatusLabels[item.status]}</Row></dl></section>
      <section className={card}><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Metaadatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Létrehozva">{formatFollowUpTime(item.createdAt)}</Row><Row label="Módosítva">{formatFollowUpTime(item.updatedAt)}</Row><Row label="Teljesítve">{formatFollowUpTime(item.completedAt)}</Row></dl></section>
    </div>
    <section className={card}><h3 className="mb-4 text-sm font-semibold">Megjegyzés</h3><p className="text-sm whitespace-pre-wrap break-words text-[#536166]">{item.note || "—"}</p></section>
  </div>;
}
