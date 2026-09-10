import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";

import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hu-HU", { timeZone: "UTC" }).format(new Date(value));
}

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const formatted = (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1);
  return `${formatted} ${units[i]}`;
}

function formatMimeType(mimeType, originalFileName = "") {
  if (originalFileName) {
    const ext = originalFileName.split(".").pop()?.toUpperCase();
    if (ext && ext.length <= 4) return ext;
  }
  if (!mimeType) return "FÁJL";
  if (mimeType === "application/pdf") return "PDF";
  if (mimeType.includes("word") || mimeType.includes("officedocument.wordprocessingml")) return "DOCX";
  if (mimeType.includes("excel") || mimeType.includes("officedocument.spreadsheetml")) return "XLSX";
  if (mimeType === "text/csv") return "CSV";
  if (mimeType === "text/plain") return "TXT";
  if (mimeType === "image/jpeg") return "JPG";
  if (mimeType === "image/png") return "PNG";
  return "FÁJL";
}

export default function DocumentListComponent({
  query = "",
  categoryFilter = "ALL",
  sortDirection = "desc",
  reloadKey = 0,
  onView,
  onEdit,
  canView = true,
  canEdit = false,
  canDelete = false,
  canDownload = true,
}) {
  const { showSuccess, showError } = useToast();
  const hasActions = canDownload || canView || canEdit || canDelete;
  const [result, setResult] = useState({ documents: [], resolvedKey: null, error: "" });
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const rowsPerPage = 10;
  const requestKey = JSON.stringify([query, categoryFilter, sortDirection, reloadKey]);
  const loading = result.resolvedKey !== requestKey;

  useEffect(() => {
    let active = true;
    const params = {
      ...(query.trim() ? { q: query.trim() } : {}),
      ...(categoryFilter !== "ALL" ? { category: categoryFilter } : {}),
      sortDirection,
    };
    apiClient.get("/documents", { params })
      .then(({ data }) => {
        if (active) setResult({ documents: data, resolvedKey: requestKey, error: "" });
      })
      .catch((error) => {
        if (active) setResult({ documents: [], resolvedKey: requestKey, error: error.message || "A dokumentumok betöltése sikertelen." });
      });
    return () => { active = false; };
  }, [categoryFilter, query, reloadKey, requestKey, sortDirection]);

  const documents = result.documents;
  const pageCount = Math.max(1, Math.ceil(documents.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = useMemo(() => documents.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage), [currentPage, documents]);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggleAll = () => setSelected((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
  const toggleDoc = (id) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  const handleDownload = async (doc) => {
    if (!canDownload) {
      showError("Nincs jogosultsága a dokumentum letöltéséhez.", "Nincs jogosultság");
      return;
    }
    setDownloadingId(doc.id);
    try {
      const response = await apiClient.get(`/documents/${doc.id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement("a");
      link.href = url;
      link.setAttribute("download", doc.originalFileName || "dokumentum");
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.response?.data?.message || "A letöltés sikertelen.", "Hiba");
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (doc) => {
    if (!canDelete) {
      showError("Nincs jogosultsága a dokumentum törléséhez.", "Nincs jogosultság");
      return;
    }
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a dokumentumot: ${doc.name}?`)) return;
    setDeletingId(doc.id);
    try {
      await apiClient.delete(`/documents/${doc.id}`);
      setResult((current) => ({ ...current, documents: current.documents.filter(({ id }) => id !== doc.id), error: "" }));
      setSelected((current) => current.filter((id) => id !== doc.id));
      showSuccess("A dokumentum sikeresen törölve.");
    } catch {
      showError("A dokumentum törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-labelledby="document-list-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Dokumentumkezelés</p>
          <h2 id="document-list-title" className="text-base font-semibold text-[#29383d]">Dokumentumok</h2>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#dbe1df] bg-white shadow-[0_1px_2px_rgba(24,39,43,0.02)]" aria-busy={loading}>
        <DataTable
          value={visible}
          dataKey="id"
          unstyled
          tableClassName="w-full min-w-[1050px] border-collapse text-left"
          rowClassName={(doc) => `${selected.includes(doc.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`}
          onRowDoubleClick={(event) => canView && onView?.(event.data)}
          emptyMessage={<span className="block h-40 pt-16 text-center text-xs text-[#778286]">{result.error || "Nincs megjeleníthető dokumentum."}</span>}
        >
          <Column
            headerClassName={`${headerClass} w-12 text-center`}
            bodyClassName={`${cellClass} w-12 text-center`}
            header={<input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Összes kijelölése" className="size-4 cursor-pointer accent-[#79a97e]" />}
            body={(doc) => <input type="checkbox" checked={selected.includes(doc.id)} onChange={() => toggleDoc(doc.id)} aria-label={`${doc.name} kijelölése`} className="size-4 cursor-pointer accent-[#79a97e]" />}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Megnevezés"
            body={(doc) => (
              <div className="flex flex-col gap-0.5">
                {canView ? (
                  <button type="button" onClick={() => onView?.(doc)} className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#263338] hover:underline truncate max-w-[280px]">
                    {doc.name}
                  </button>
                ) : (
                  <span className="font-semibold text-[#263338] truncate max-w-[280px]">{doc.name}</span>
                )}
                <span className="text-[11px] text-[#84908e] truncate max-w-[280px]">{doc.originalFileName}</span>
              </div>
            )}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Kategória"
            body={(doc) => (
              doc.category ? (
                <span className="inline-flex rounded-md border border-[#dbe1df] bg-[#f5f7f6] px-2 py-0.5 text-[11px] font-medium text-[#536166]">
                  {doc.category}
                </span>
              ) : <span className="text-[#84908e]">—</span>
            )}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Kapcsolódó elem"
            body={(doc) => {
              const parts = [];
              if (doc.partner) parts.push(`Partner: ${doc.partner.name}`);
              if (doc.project) parts.push(`Projekt: ${doc.project.name}`);
              return parts.length > 0 ? (
                <span className="truncate max-w-[200px] block" title={parts.join(" · ")}>
                  {parts.join(" · ")}
                </span>
              ) : <span className="text-[#84908e]">—</span>;
            }}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Típus / Méret"
            body={(doc) => (
              <span className="text-xs text-[#536166]">
                <span className="font-medium">{formatMimeType(doc.mimeType, doc.originalFileName)}</span>
                <span className="text-[#a0aba9]"> · </span>
                <span>{formatFileSize(doc.size)}</span>
              </span>
            )}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Feltöltő"
            body={(doc) => (
              doc.uploadedByMember?.user
                ? `${doc.uploadedByMember.user.firstName} ${doc.uploadedByMember.user.lastName}`
                : "—"
            )}
          />
          <Column
            headerClassName={headerClass}
            bodyClassName={cellClass}
            header="Feltöltve"
            body={(doc) => formatDate(doc.createdAt)}
          />
          {hasActions && (
            <Column
              headerClassName={`${headerClass} w-[140px] text-center`}
              bodyClassName={`${cellClass} w-[140px] text-center`}
              header="Műveletek"
              body={(doc) => (
                <div className="flex items-center justify-center gap-1">
                  {canDownload && (
                    <button
                      type="button"
                      onClick={() => handleDownload(doc)}
                      disabled={downloadingId === doc.id}
                      aria-label={`${doc.name} letöltése`}
                      title="Letöltés"
                      className={actionButtonClass}
                    >
                      <i className={`pi ${downloadingId === doc.id ? "pi-spinner pi-spin" : "pi-download"}`} aria-hidden="true" />
                    </button>
                  )}
                  {canView && (
                    <button
                      type="button"
                      onClick={() => onView?.(doc)}
                      aria-label={`${doc.name} megtekintése`}
                      title="Megtekintés"
                      className={actionButtonClass}
                    >
                      <i className="pi pi-eye pointer-events-none" aria-hidden="true" />
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onEdit?.(doc)}
                      aria-label={`${doc.name} módosítása`}
                      title="Módosítás"
                      className={actionButtonClass}
                    >
                      <i className="pi pi-pencil pointer-events-none" aria-hidden="true" />
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(doc)}
                      disabled={deletingId === doc.id}
                      aria-label={`${doc.name} törlése`}
                      title="Törlés"
                      className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}
                    >
                      <i className={`pi ${deletingId === doc.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none`} aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}
            />
          )}
        </DataTable>

        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/70" role="status" aria-label="Dokumentumok betöltése">
            <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#637175]">
        <span>Összesen {documents.length} dokumentum · {selected.length} kijelölve</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage <= 1} className="h-8 rounded-md border border-[#d7dedc] bg-white px-3 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f8f9f9]">Előző</button>
          <span>{currentPage} / {pageCount}</span>
          <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage >= pageCount} className="h-8 rounded-md border border-[#d7dedc] bg-white px-3 disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f8f9f9]">Következő</button>
        </div>
      </div>
    </section>
  );
}
