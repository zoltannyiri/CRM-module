import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import apiClient from "../../api/apiClient.js";
import DocumentFormComponent from "../document/DocumentFormComponent.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

const actionButtonClass =
  "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

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

export default function ProjectDocumentsComponent({ projectId }) {
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const canView = hasPermission("DOCUMENTS_VIEW");
  const canCreate = hasPermission("DOCUMENTS_CREATE");
  const canEdit = hasPermission("DOCUMENTS_EDIT");
  const canDelete = hasPermission("DOCUMENTS_DELETE");
  const canDownload = hasPermission("DOCUMENTS_DOWNLOAD");
  const hasActions = canDownload || canView || canEdit || canDelete;

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient
      .get("/documents", { params: { entityType: "PROJECT", entityId: projectId } })
      .then(({ data }) => {
        if (active) {
          setDocuments(data);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("A dokumentumok nem tölthetők be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, reloadKey]);

  const reloadDocuments = () => {
    setLoading(true);
    setError("");
    setReloadKey((value) => value + 1);
  };

  const openCreate = () => {
    if (!canCreate) {
      showError("Nincs jogosultsága új dokumentum létrehozásához.", "Nincs jogosultság");
      return;
    }
    setActiveDoc(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openEdit = (doc) => {
    if (!canEdit) {
      showError("Nincs jogosultsága a dokumentum módosításához.", "Nincs jogosultság");
      return;
    }
    setActiveDoc(doc);
    setFormMode("edit");
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    reloadDocuments();
  };

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
    setError("");
    try {
      await apiClient.delete(`/documents/${doc.id}`);
      setDocuments((current) => current.filter(({ id }) => id !== doc.id));
      showSuccess("A dokumentum sikeresen törölve.");
    } catch {
      setError("A dokumentum törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-labelledby="project-documents-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="project-documents-title" className="text-base font-semibold text-[#29383d]">
            Dokumentumok
          </h2>
          <p className="mt-1 text-xs text-[#71807c]">A projekthez tartozó dokumentumok listája.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#68aa6e]"
          >
            <i className="pi pi-plus text-[10px]" aria-hidden="true" />
            Új dokumentum
          </button>
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-[#dbe1df] bg-white"
        aria-busy={loading}
      >
        <div
          className={`hidden ${
            hasActions
              ? "grid-cols-[minmax(160px,1.5fr)_130px_90px_110px_130px]"
              : "grid-cols-[minmax(160px,1.5fr)_130px_90px_110px]"
          } border-b border-[#dbe1df] bg-[#fafbfb] px-4 text-[11px] font-medium text-[#657276] md:grid`}
        >
          <span className="py-3">Név</span>
          <span className="py-3">Kategória</span>
          <span className="py-3">Méret</span>
          <span className="py-3">Feltöltve</span>
          {hasActions && <span className="py-3 text-center">Műveletek</span>}
        </div>

        {loading ? (
          <div
            className="grid min-h-40 place-items-center"
            role="status"
            aria-label="Dokumentumok betöltése"
          >
            <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="grid min-h-40 place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-medium text-[#8f3f34]">{error}</p>
              <button
                type="button"
                onClick={reloadDocuments}
                className="mt-3 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 py-2 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]"
              >
                Újrapróbálás
              </button>
            </div>
          </div>
        ) : documents.length === 0 ? (
          <div className="grid min-h-40 place-items-center px-6 text-center text-xs text-[#778286]">
            Ehhez a projekthez még nincs dokumentum.
          </div>
        ) : (
          <div className="divide-y divide-[#e4e9e7]">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className={`grid gap-2 px-4 py-3.5 text-xs text-[#344247] transition-colors hover:bg-[#fafcfc] ${
                  hasActions
                    ? "md:grid-cols-[minmax(160px,1.5fr)_130px_90px_110px_130px]"
                    : "md:grid-cols-[minmax(160px,1.5fr)_130px_90px_110px]"
                } md:items-center md:gap-0`}
              >
                <div className="flex flex-col">
                  {canView ? (
                    <Link
                      to={`/document/${doc.id}`}
                      className="font-semibold text-[#263338] hover:underline"
                    >
                      {doc.name}
                    </Link>
                  ) : (
                    <span className="font-semibold text-[#263338]">{doc.name}</span>
                  )}
                  {doc.originalFileName && (
                    <span className="text-[11px] text-[#8a9693]">{doc.originalFileName}</span>
                  )}
                </div>

                <span>
                  <span className="mr-2 text-[#8a9693] md:hidden">Kategória:</span>
                  <span className="inline-flex rounded border border-[#dbe1df] bg-[#f5f7f6] px-2 py-0.5 text-[11px] font-medium text-[#536166]">
                    {doc.category || "Általános"}
                  </span>
                </span>

                <span>
                  <span className="mr-2 text-[#8a9693] md:hidden">Méret:</span>
                  {formatFileSize(doc.size)}
                </span>

                <span className="whitespace-nowrap">
                  <span className="mr-2 text-[#8a9693] md:hidden">Feltöltve:</span>
                  {formatDate(doc.createdAt)}
                </span>

                {hasActions && (
                  <div className="flex items-center gap-1 md:justify-center">
                    {canDownload && (
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        aria-label={`${doc.name} letöltése`}
                        title="Letöltés"
                        className={actionButtonClass}
                      >
                        <i
                          className={`pi ${
                            downloadingId === doc.id ? "pi-spinner pi-spin" : "pi-download"
                          } pointer-events-none`}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                    {canView && (
                      <Link
                        to={`/document/${doc.id}`}
                        aria-label={`${doc.name} megtekintése`}
                        title="Megtekintés"
                        className={actionButtonClass}
                      >
                        <i className="pi pi-eye pointer-events-none" aria-hidden="true" />
                      </Link>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openEdit(doc)}
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
                        <i
                          className={`pi ${
                            deletingId === doc.id ? "pi-spinner pi-spin" : "pi-trash"
                          } pointer-events-none`}
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {formOpen && (
        <DocumentFormComponent
          mode={formMode}
          document={activeDoc}
          defaultProjectId={projectId}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
