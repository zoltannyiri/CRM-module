import { useState } from "react";
import { Link } from "react-router-dom";
import { leadSourceLabels, leadStatusLabels, memberName } from "../lead/leadDisplay.js";
import { boardColumns } from "./pipelineDisplay.js";

export default function PipelineBoardComponent({ board, canEdit, moving, onMove }) {
  const [draggedLead, setDraggedLead] = useState(null);
  const columns = boardColumns(board);
  return <div className="flex items-start gap-4 overflow-x-auto pb-5" aria-label="Pipeline board">
    {columns.map((column) => <section key={column.id ?? "unassigned"} className="w-[280px] shrink-0 rounded-lg border border-[#dbe1df] bg-[#eef2f1] p-3"
      onDragOver={(event) => { if (canEdit && !moving && draggedLead !== null) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (canEdit && !moving && draggedLead !== null) onMove(draggedLead, column.id); setDraggedLead(null); }}>
      <header className="mb-3 flex items-center justify-between gap-2 px-1"><h2 className="text-xs font-semibold text-[#344247]">{column.name}</h2><span className="text-[11px] text-[#84918e]">{column.leads.length}</span></header>
      <div className="grid gap-3">{column.leads.map((lead) => <article key={lead.id} draggable={canEdit && !moving}
        onDragStart={(event) => { if (!canEdit || moving) { event.preventDefault(); return; } event.dataTransfer.setData("text/plain", String(lead.id)); event.dataTransfer.effectAllowed = "move"; setDraggedLead(lead.id); }}
        onDragEnd={() => setDraggedLead(null)}
        className={`rounded-md border border-[#dbe1df] bg-white p-4 shadow-[0_1px_2px_rgba(24,39,43,.02)] ${moving ? "cursor-wait" : canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}>
        <Link to={`/lead/${lead.id}`} draggable={false} className="cursor-pointer text-sm font-semibold break-words text-[#29383d] hover:underline">{lead.name}</Link>
        {lead.companyName && <p className="mt-1 text-xs break-words text-[#71807c]">{lead.companyName}</p>}
        <dl className="mt-3 grid gap-1.5 text-[11px] text-[#71807c]"><div className="flex justify-between gap-2"><dt>Felelős</dt><dd className="text-right">{memberName(lead.assignedMember)}</dd></div><div className="flex justify-between gap-2"><dt>Forrás</dt><dd>{leadSourceLabels[lead.source]}</dd></div><div className="flex justify-between gap-2"><dt>Státusz</dt><dd>{leadStatusLabels[lead.status]}</dd></div></dl>
        {canEdit && <label className="mt-3 grid gap-1.5 border-t border-[#edf0ef] pt-3 text-[11px] text-[#71807c]">Szakasz módosítása<select value={column.id ?? ""} disabled={moving} onChange={(event) => onMove(lead.id, event.target.value ? Number(event.target.value) : null)} className="h-8 w-full cursor-pointer rounded-md border border-[#d7dedc] bg-white px-2 text-xs text-[#344247] outline-none disabled:cursor-wait disabled:opacity-60"><option value="">Nincs szakaszhoz rendelve</option>{board.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>}
      </article>)}</div>
      {!column.leads.length && <p className="py-5 text-center text-xs text-[#84918e]">Nincs megjeleníthető érdeklődő.</p>}
    </section>)}
  </div>;
}
