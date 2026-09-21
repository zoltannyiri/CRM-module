import { useEffect, useState } from "react";
import { useToast } from "../../hooks/useToast.js";
import { columnIdentity, moveListColumn, toggleListColumn } from "./listColumns.js";

function ColumnSettingsDrawerContent({ preference, loading, error, onClose, onSave, onReset, onChanged }) {
  const { showSuccess } = useToast();
  const [columns, setColumns] = useState(preference.columns);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  useEffect(() => {
    const previous = document.body.style.overflow; document.body.style.overflow = "hidden";
    const keydown = (event) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", keydown);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", keydown); };
  }, [onClose, saving]);

  const persist = async (reset = false) => {
    if (saving) return; setSaving(true); setLocalError("");
    try {
      const result = reset ? await onReset() : await onSave(columns);
      setColumns(result.columns); showSuccess(reset ? "Az alapértelmezett oszlopok visszaálltak." : "Az oszlopbeállítások mentve."); onChanged?.();
      if (!reset) onClose();
    } catch (requestError) { setLocalError(requestError.response?.data?.message || "Az oszlopbeállítások mentése sikertelen."); }
    finally { setSaving(false); }
  };
  const core = preference.availableColumns.filter(({ type }) => type === "CORE");
  const custom = preference.availableColumns.filter(({ type }) => type === "CUSTOM_FIELD");
  const selected = new Set(columns.map(columnIdentity));
  return <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="column-settings-title">
    <button type="button" aria-label="Oszlopbeállítások bezárása" disabled={saving} onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] disabled:cursor-wait" />
    <aside className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] sm:max-w-[560px]">
      <header className="flex items-start justify-between gap-5 border-b border-[#dfe5e3] bg-white px-6 py-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Listanézet</p><h2 id="column-settings-title" className="mt-1 text-xl font-semibold">Oszlopok testreszabása</h2><p className="mt-1 text-sm text-[#71807c]">Válaszd ki és rendezd a táblázat oszlopait.</p></div><button type="button" onClick={onClose} disabled={saving} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs disabled:cursor-wait">Bezárás</button></header>
      <div className="flex-1 overflow-y-auto p-6">{loading ? <div className="grid min-h-48 place-items-center"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div> : <div className="grid gap-6">
        {(error || localError) && <p role="alert" className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{localError || error}</p>}
        {[['Alapadatok', core], ['Egyéni mezők', custom]].map(([title, available]) => <section key={title} className="rounded-lg border border-[#dfe5e3] bg-white p-5"><h3 className="mb-3 text-sm font-semibold">{title}</h3>{available.length ? <div className="grid gap-1">{available.map((column) => <label key={columnIdentity(column)} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-xs hover:bg-[#f5f8f5]"><input type="checkbox" checked={selected.has(columnIdentity(column))} disabled={column.required} onChange={(event) => setColumns((current) => toggleListColumn(current, column, event.target.checked))} className="size-4 accent-[#6fa675]" /><span>{column.label}</span>{column.required && <span className="ml-auto text-[10px] text-[#84918e]">Kötelező</span>}</label>)}</div> : <p className="text-xs text-[#7b8885]">Nincs elérhető egyéni mező.</p>}</section>)}
        <section className="rounded-lg border border-[#dfe5e3] bg-white p-5"><h3 className="mb-3 text-sm font-semibold">Megjelenési sorrend</h3><div className="grid gap-2">{columns.map((column, index) => <div key={columnIdentity(column)} className="flex items-center gap-2 rounded-md border border-[#e2e7e5] px-3 py-2"><span className="min-w-0 flex-1 truncate text-xs font-medium">{column.label}</span><button type="button" disabled={index === 0} onClick={() => setColumns((current) => moveListColumn(current, index, -1))} className="grid size-8 cursor-pointer place-items-center rounded border border-[#d6dddc] disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${column.label} feljebb`}><i className="pi pi-arrow-up text-[10px]" /></button><button type="button" disabled={index === columns.length - 1} onClick={() => setColumns((current) => moveListColumn(current, index, 1))} className="grid size-8 cursor-pointer place-items-center rounded border border-[#d6dddc] disabled:cursor-not-allowed disabled:opacity-35" aria-label={`${column.label} lejjebb`}><i className="pi pi-arrow-down text-[10px]" /></button></div>)}</div></section>
      </div>}</div>
      <footer className="flex flex-col-reverse gap-3 border-t border-[#dfe5e3] bg-white px-6 py-4 sm:flex-row sm:justify-between"><button type="button" onClick={() => persist(true)} disabled={saving || loading} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium disabled:cursor-wait disabled:opacity-50">Alapértelmezett visszaállítása</button><div className="flex gap-3"><button type="button" onClick={onClose} disabled={saving} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs disabled:cursor-wait">Mégse</button><button type="button" onClick={() => persist(false)} disabled={saving || loading} className="h-10 cursor-pointer rounded-md bg-[#263b40] px-6 text-xs font-semibold text-white disabled:cursor-wait disabled:opacity-60">{saving ? "Mentés…" : "Mentés"}</button></div></footer>
    </aside>
  </div>;
}

export default function ColumnSettingsDrawer({ open, preference, ...props }) {
  if (!open) return null;
  const preferenceKey = preference.columns.map(columnIdentity).join("|");
  return <ColumnSettingsDrawerContent key={preferenceKey} preference={preference} {...props} />;
}
