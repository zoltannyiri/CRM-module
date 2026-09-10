import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

export default function DocumentShowComponent({ documentId, onEdit }) {
  const navigate = useNavigate();
  const { hasPermission, hasModule } = useAuth();
  const { showSuccess, showError } = useToast();

  const canDownload = hasPermission("DOCUMENTS_DOWNLOAD");
  const canEdit = hasPermission("DOCUMENTS_EDIT");
  const canDelete = hasPermission("DOCUMENTS_DELETE");
  const canViewPartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canViewProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");

  const [documentData, setDocumentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;

    apiClient.get(`/documents/${documentId}`)
      .then(({ data }) => {
        if (active) setDocumentData(data);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.response?.status === 404 ? "A dokumentum nem található." : "A dokumentum adatai nem tölthetők be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [documentId]);

  const handleDownload = async () => {
    if (!canDownload || !documentData) return;
    setDownloading(true);
    try {
      const response = await apiClient.get(`/documents/${documentData.id}/download`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = window.document.createElement("a");
      link.href = url;
      link.setAttribute("download", documentData.originalFileName || "dokumentum");
      window.document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.response?.data?.message || "A letöltés sikertelen.", "Hiba");
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete || !documentData) return;
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a dokumentumot: ${documentData.name}?`)) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/documents/${documentData.id}`);
      showSuccess("A dokumentum sikeresen törölve.");
      navigate("/document");
    } catch {
      showError("A dokumentum törlése sikertelen.");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white p-8" role="status" aria-label="Dokumentum adatainak betöltése">
        <div className="flex flex-col items-center gap-3">
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          <span className="text-xs text-[#71807c]">Dokumentum adatainak betöltése…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#efd7d1] bg-white p-8 text-center shadow-xs">
        <div className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-[#fdf1ee] text-[#a34b3d]">
          <i className="pi pi-exclamation-triangle text-lg" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-[#253238]">{error}</h3>
        <p className="mt-1 text-xs text-[#71807c]">Térj vissza a dokumentumlistához, és válassz egy elérhető elemet.</p>
        <Link to="/document" className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9]">
          <i className="pi pi-arrow-left text-xs" aria-hidden="true" />
          Vissza a dokumentumokhoz
        </Link>
      </div>
    );
  }

  if (!documentData) return null;

  return (
    <div className="space-y-5">
      {/* Fejléc kártya */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Dokumentum</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold tracking-tight text-[#253238]">{documentData.name}</h2>
            {documentData.category && (
              <span className="inline-flex rounded-md border border-[#dbe1df] bg-[#f5f7f6] px-2.5 py-0.5 text-xs font-medium text-[#536166]">
                {documentData.category}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[#71807c]">{documentData.originalFileName}</p>
        </div>

        {/* Akció gombok */}
        <div className="flex flex-wrap items-center gap-2">
          {canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3.5 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9] disabled:cursor-wait disabled:opacity-50"
            >
              <i className={`pi ${downloading ? "pi-spinner pi-spin" : "pi-download"} text-xs text-[#748084]`} aria-hidden="true" />
              Letöltés
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onEdit?.(documentData)}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3.5 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9]"
            >
              <i className="pi pi-pencil text-xs text-[#748084]" aria-hidden="true" />
              Módosítás
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#ecd5d1] bg-white px-3.5 text-xs font-medium text-[#9d3c32] shadow-xs hover:bg-[#fdf4f3] disabled:cursor-wait disabled:opacity-50"
            >
              <i className="pi pi-trash text-xs text-[#9d3c32]" aria-hidden="true" />
              Törlés
            </button>
          )}
        </div>
      </div>

      {/* Részletek rács */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Fájl és metaadatok */}
        <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
          <h3 className="mb-4 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
            Fájladatok
          </h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3.5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[#71807c]">Eredeti fájlnév</dt>
              <dd className="mt-1 font-medium text-[#253238] break-all">{documentData.originalFileName}</dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Fájltípus</dt>
              <dd className="mt-1 font-medium text-[#253238]">{formatMimeType(documentData.mimeType, documentData.originalFileName)}</dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Méret</dt>
              <dd className="mt-1 font-medium text-[#253238]">{formatFileSize(documentData.size)}</dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Kategória</dt>
              <dd className="mt-1 font-medium text-[#253238]">{documentData.category || "—"}</dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Feltöltő</dt>
              <dd className="mt-1 font-medium text-[#253238]">
                {documentData.uploadedByMember?.user
                  ? `${documentData.uploadedByMember.user.firstName} ${documentData.uploadedByMember.user.lastName}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Feltöltve</dt>
              <dd className="mt-1 font-medium text-[#253238]">{formatDate(documentData.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Utolsó módosítás</dt>
              <dd className="mt-1 font-medium text-[#253238]">{formatDate(documentData.updatedAt)}</dd>
            </div>
          </dl>
        </section>

        {/* Kapcsolódó elemek */}
        <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
          <h3 className="mb-4 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
            Kapcsolódó elemek
          </h3>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-3.5 text-xs">
            <div>
              <dt className="text-[#71807c]">Partner</dt>
              <dd className="mt-1 font-medium text-[#253238]">
                {documentData.partner ? (
                  canViewPartners ? (
                    <Link to={`/partner/${documentData.partner.id}`} className="text-[#2e5d38] hover:underline font-semibold">
                      {documentData.partner.name}
                    </Link>
                  ) : (
                    documentData.partner.name
                  )
                ) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[#71807c]">Projekt</dt>
              <dd className="mt-1 font-medium text-[#253238]">
                {documentData.project ? (
                  canViewProjects ? (
                    <Link to={`/project/${documentData.project.id}`} className="text-[#2e5d38] hover:underline font-semibold">
                      {documentData.project.name}
                    </Link>
                  ) : (
                    documentData.project.name
                  )
                ) : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Megjegyzés */}
        {documentData.note && (
          <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)] lg:col-span-2">
            <h3 className="mb-3 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
              Megjegyzés
            </h3>
            <p className="text-xs text-[#344247] whitespace-pre-wrap leading-relaxed">
              {documentData.note}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
