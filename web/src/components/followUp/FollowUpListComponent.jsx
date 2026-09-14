import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { memberName } from "../lead/leadDisplay.js";
import { followUpAccess, followUpQuery, followUpStatusLabels, followUpTypeLabels, formatFollowUpTime, isFollowUpOverdue } from "./followUpDisplay.js";

const cell = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const header = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const action = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent text-[#657276] hover:border-[#d8dfdd] hover:bg-[#f1f4f3] disabled:cursor-wait disabled:opacity-50";
export default function FollowUpListComponent({ filters = {}, reloadKey = 0, onView, onEdit, onChanged }) {
  const { hasModule, hasPermission } = useAuth();
  const access = followUpAccess(hasModule, hasPermission);
  const { showSuccess, showError } = useToast();
  const queryKey = JSON.stringify(followUpQuery(filters));
  const requestKey = JSON.stringify([queryKey, reloadKey]);
  const [result, setResult] = useState({ items: [], resolvedKey: null, error: "" });
  const [page, setPage] = useState(1);
  const [previousQuery, setPreviousQuery] = useState(queryKey);
  if (previousQuery !== queryKey) { setPreviousQuery(queryKey); setPage(1); }
  const [busy, setBusy] = useState(null);
  const pending = useRef(false);
  const loading = result.resolvedKey !== requestKey;
  const pages = Math.max(1, Math.ceil(result.items.length / 10));
  const currentPage = Math.min(page, pages);
  useEffect(() => {
    if (!access.view) return undefined;
    let active = true;
    apiClient.get("/follow-ups", { params: JSON.parse(queryKey), skipGlobalErrorToast: true })
      .then(({ data }) => { if (active) setResult({ items: data, resolvedKey: requestKey, error: "" }); })
      .catch((error) => { if (active) setResult({ items: [], resolvedKey: requestKey, error: error.response?.data?.message || "Az utánkövetések nem tölthetők be." }); });
    return () => { active = false; };
  }, [access.view, queryKey, requestKey]);
  const mutate = async (item, kind) => {
    if (pending.current || !(kind === "complete" ? access.complete && item.status === "OPEN" : access.delete)) return;
    if (kind === "delete" && !window.confirm("Biztosan törölni szeretnéd ezt az utánkövetést?")) return;
    pending.current = true; setBusy(item.id);
    try {
      if (kind === "complete") await apiClient.patch(`/follow-ups/${item.id}/complete`, {}, { skipGlobalErrorToast: true });
      else await apiClient.delete(`/follow-ups/${item.id}`, { skipGlobalErrorToast: true });
      showSuccess(kind === "complete" ? "Utánkövetés teljesítve." : "Utánkövetés törölve.");
      onChanged?.();
    } catch (error) { showError(error.response?.data?.message || "A művelet sikertelen."); }
    finally { pending.current = false; setBusy(null); }
  };
  if (!access.view) return null;
  const hasActions = Boolean(onView || access.edit && onEdit || access.delete || access.complete);
  return <section>
    <div className="relative overflow-x-auto rounded-xl border border-[#dbe1df] bg-white" aria-busy={loading}>
      <DataTable value={loading ? [] : result.items.slice((currentPage - 1) * 10, currentPage * 10)} dataKey="id" unstyled tableClassName="w-full min-w-[900px] border-collapse text-left" emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{loading ? "" : result.error || "Nincs megjeleníthető utánkövetés."}</span>}>
        <Column header="Érdeklődő" headerClassName={header} bodyClassName={cell} body={(item) => <div><Link to={`/lead/${item.lead.id}`} className="cursor-pointer font-semibold hover:underline">{item.lead.name}</Link>{item.lead.companyName && <p className="mt-1 text-[11px] text-[#84918e]">{item.lead.companyName}</p>}</div>} />
        <Column header="Időpont" headerClassName={header} bodyClassName={cell} body={(item) => <span className={isFollowUpOverdue(item) ? "text-[#a34b3d]" : ""}>{formatFollowUpTime(item.dueAt)}{isFollowUpOverdue(item) && <span className="mt-1 block text-[10px]">Lejárt</span>}</span>} />
        <Column header="Típus" headerClassName={header} bodyClassName={cell} body={(item) => followUpTypeLabels[item.type]} />
        <Column header="Felelős" headerClassName={header} bodyClassName={cell} body={(item) => memberName(item.assignedMember)} />
        <Column header="Állapot" headerClassName={header} bodyClassName={cell} body={(item) => <span className={`rounded-md px-2 py-1 text-[10px] ${item.status === "COMPLETED" ? "bg-[#edf5ee] text-[#4d7853]" : "bg-[#f1f4f3] text-[#657276]"}`}>{followUpStatusLabels[item.status]}</span>} />
        {hasActions && <Column header="Műveletek" headerClassName={`${header} text-center`} bodyClassName={cell} body={(item) => <div className="flex items-center justify-center gap-1">
          {access.complete && item.status === "OPEN" && <button type="button" onClick={() => mutate(item, "complete")} disabled={busy !== null} className={`${action} text-[#4d7853]`} title="Teljesítve" aria-label="Utánkövetés teljesítése"><i className="pi pi-check" aria-hidden="true" /></button>}
          {onView && <button type="button" onClick={() => onView(item)} className={action} title="Megtekintés" aria-label="Utánkövetés megtekintése"><i className="pi pi-eye" aria-hidden="true" /></button>}
          {access.edit && onEdit && <button type="button" onClick={() => onEdit(item)} className={action} title="Szerkesztés" aria-label="Utánkövetés szerkesztése"><i className="pi pi-pencil" aria-hidden="true" /></button>}
          {access.delete && <button type="button" onClick={() => mutate(item, "delete")} disabled={busy !== null} className={`${action} text-[#a34b3d]`} title="Törlés" aria-label="Utánkövetés törlése"><i className={`pi ${busy === item.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" /></button>}
        </div>} />}
      </DataTable>
      {loading && <div className="absolute inset-x-0 top-12 bottom-0 grid min-h-40 place-items-center bg-white" role="status" aria-label="Utánkövetések betöltése"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>}
    </div>
    {!loading && !result.error && pages > 1 && <div className="mt-5 flex justify-center"><div className="flex overflow-hidden rounded-md border border-[#d6dddc] bg-white text-xs"><button type="button" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)} className="h-9 cursor-pointer px-4 disabled:cursor-not-allowed disabled:opacity-40">Előző</button><span className="grid min-w-10 place-items-center border-x border-[#e3e8e6]">{currentPage}</span><button type="button" disabled={currentPage === pages} onClick={() => setPage((value) => value + 1)} className="h-9 cursor-pointer px-4 disabled:cursor-not-allowed disabled:opacity-40">Következő</button></div></div>}
  </section>;
}
