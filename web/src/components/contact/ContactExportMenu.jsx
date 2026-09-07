import { useEffect, useRef, useState } from "react";

import apiClient from "../../api/apiClient.js";

const formats = [
  { value: "xlsx", label: "Excel munkafüzet", detail: ".xlsx", icon: "pi-file-excel" },
  { value: "pdf", label: "PDF dokumentum", detail: ".pdf", icon: "pi-file-pdf" },
  { value: "csv", label: "CSV adatfájl", detail: ".csv", icon: "pi-table" },
];

export default function ContactExportMenu({ query, typeFilter, sortDirection, buttonClassName }) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const downloadExport = async (format) => {
    setExporting(format);
    setError("");
    try {
      const response = await apiClient.get("/contacts/export", {
        params: { format, q: query || undefined, type: typeFilter, sort: sortDirection },
        responseType: "blob",
      });
      const disposition = response.headers["content-disposition"] || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1]
        || `kapcsolattartok-${new Date().toISOString().slice(0, 10)}.${format}`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setOpen(false);
    } catch (requestError) {
      setError(requestError.message || "Az exportálás sikertelen.");
    } finally {
      setExporting("");
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} className={buttonClassName}>
        <i className="pi pi-download text-[11px] text-[#748084]" aria-hidden="true" />Export
        <i className={`pi pi-chevron-down text-[9px] transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && <div role="menu" className="absolute top-[calc(100%+6px)] right-0 z-30 w-64 overflow-hidden rounded-lg border border-[#d9e0de] bg-white p-1.5 shadow-[0_14px_35px_rgba(28,45,48,.14)]">
        <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-[#8a9693]">Formátum kiválasztása</p>
        {formats.map((format) => <button key={format.value} type="button" role="menuitem" disabled={Boolean(exporting)} onClick={() => downloadExport(format.value)} className="flex w-full cursor-pointer items-center gap-3 rounded-md border-0 bg-white px-3 py-2.5 text-left hover:bg-[#f2f5f4] disabled:cursor-wait disabled:opacity-55">
          <i className={`pi ${exporting === format.value ? "pi-spinner pi-spin" : format.icon} w-4 text-sm text-[#627b68]`} aria-hidden="true" />
          <span className="flex-1 text-xs font-medium text-[#344247]">{format.label}</span>
          <span className="text-[10px] text-[#929d9a]">{format.detail}</span>
        </button>)}
        {error && <p role="alert" className="mx-2 my-1 rounded bg-[#fdf1ee] px-2.5 py-2 text-[11px] text-[#9a4335]">{error}</p>}
      </div>}
    </div>
  );
}
