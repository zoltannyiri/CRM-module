import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";
import { useAuth } from "../../hooks/useAuth.js";

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:bg-[#f6f8f7] disabled:text-[#7d8b88]";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

const CATEGORY_OPTIONS = [
  "Általános",
  "Szerződés",
  "Műszaki dokumentum",
  "Pénzügyi dokumentum",
  "Egyéb",
];

export default function DocumentFormComponent(props) {
  const { hasPermission } = useAuth();
  const mode = props.mode || "create";

  const allowed =
    mode === "edit"
      ? hasPermission("DOCUMENTS_EDIT")
      : hasPermission("DOCUMENTS_CREATE");

  if (!allowed) {
    return null;
  }

  return <DocumentForm {...props} />;
}

function DocumentForm({
  mode = "create",
  document: doc,
  defaultPartnerId,
  defaultProjectId,
  onClose,
  onSaved,
}) {
  const { showSuccess, showError } = useToast();
  const { hasModule, hasPermission } = useAuth();
  const isEditing = mode === "edit";

  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canUseProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");

  // Initial partner / project from existing doc links if editing
  const existingPartnerId = doc?.partner?.id ? String(doc.partner.id) : (doc?.links?.find((l) => l.entityType === "PARTNER")?.entityId ? String(doc.links.find((l) => l.entityType === "PARTNER").entityId) : "");
  const existingProjectId = doc?.project?.id ? String(doc.project.id) : (doc?.links?.find((l) => l.entityType === "PROJECT")?.entityId ? String(doc.links.find((l) => l.entityType === "PROJECT").entityId) : "");

  const [selectedFile, setSelectedFile] = useState(null);
  const [name, setName] = useState(() => doc?.name || "");
  const [nameUserEdited, setNameUserEdited] = useState(() => Boolean(doc?.name));
  const [category, setCategory] = useState(() => doc?.category || "Általános");
  const [partnerId, setPartnerId] = useState(() => (defaultPartnerId ? String(defaultPartnerId) : (isEditing ? existingPartnerId : "")));
  const [projectId, setProjectId] = useState(() => (defaultProjectId ? String(defaultProjectId) : (isEditing ? existingProjectId : "")));
  const [note, setNote] = useState(() => doc?.note || "");

  const [partners, setPartners] = useState(() => (doc?.partner ? [doc.partner] : []));
  const [projects, setProjects] = useState(() => (doc?.project ? [doc.project] : []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!canUsePartners) return;
    let active = true;
    apiClient.get("/partners")
      .then(({ data }) => { if (active) setPartners(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [canUsePartners]);

  useEffect(() => {
    if (!canUseProjects) return;
    let active = true;
    apiClient.get("/projects")
      .then(({ data }) => { if (active) setProjects(data); })
      .catch(() => {});
    return () => { active = false; };
  }, [canUseProjects]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!nameUserEdited || !name.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setName(baseName);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!isEditing && !selectedFile) {
      setError("Fájl kiválasztása kötelező.");
      return;
    }

    if (!name.trim()) {
      setError("A megnevezés kitöltése kötelező.");
      return;
    }

    setSubmitting(true);
    try {
      if (isEditing) {
        const payload = {
          name: name.trim(),
          category: category ? category.trim() : null,
          note: note ? note.trim() : null,
          partnerId: partnerId ? Number(partnerId) : null,
          projectId: projectId ? Number(projectId) : null,
        };
        await apiClient.patch(`/documents/${doc.id}`, payload);
        showSuccess("A dokumentum adatai sikeresen módosultak.");
      } else {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("name", name.trim());
        if (category) formData.append("category", category.trim());
        if (note) formData.append("note", note.trim());
        if (partnerId) formData.append("partnerId", partnerId);
        if (projectId) formData.append("projectId", projectId);

        await apiClient.post("/documents", formData);
        showSuccess("A dokumentum sikeresen feltöltve.");
      }

      onSaved?.();
      onClose?.();
    } catch (requestError) {
      const message = requestError.response?.data?.message || requestError.message || "A művelet sikertelen.";
      setError(message);
      showError(message, "Mentési hiba");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity" role="dialog" aria-modal="true" aria-labelledby="document-form-title">
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        {/* Fejléc */}
        <div className="flex items-start justify-between border-b border-[#e1e6e4] px-6 py-5">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Dokumentumok</p>
            <h2 id="document-form-title" className="text-xl font-semibold text-[#253338]">
              {isEditing ? "Dokumentum szerkesztése" : "Új dokumentum"}
            </h2>
            <p className="mt-1 text-xs text-[#71807c]">
              {isEditing ? "Módosítsd a dokumentum metaadatait és kapcsolatait." : "Tölts fel egy új fájlt és add meg az adatait."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bezárás"
            className="grid size-9 cursor-pointer place-items-center rounded-md border border-[#d6dddc] bg-white text-[#5f6d71] transition hover:bg-[#f3f5f5]"
          >
            <i className="pi pi-times text-xs" aria-hidden="true" />
          </button>
        </div>

        {/* Űrlap törzs */}
        <form id="document-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
          {error && (
            <div className="rounded-md border border-[#f0c2bb] bg-[#fff5f4] p-3 text-xs text-[#8f3224]">
              {error}
            </div>
          )}

          {/* Fájl választó */}
          {!isEditing ? (
            <label className={labelClass}>
              <span>Fájl <span className="text-[#a43b2f]">*</span></span>
              <div className="flex items-center gap-3">
                <label className="inline-flex h-11 cursor-pointer items-center justify-center rounded-md border border-[#d7dedc] bg-[#fafbfb] px-4 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f1f4f3]">
                  <span>Fájl kiválasztása</span>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="sr-only"
                    required
                  />
                </label>
                <span className="truncate text-xs text-[#637175]">
                  {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)` : "Nincs fájl kiválasztva"}
                </span>
              </div>
              <span className="text-[11px] text-[#84908e]">
                Engedélyezett: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG (max. 20 MB)
              </span>
            </label>
          ) : (
            <div className={labelClass}>
              <span>Eredeti fájl</span>
              <div className="flex h-11 items-center rounded-md border border-[#e1e6e4] bg-[#fafbfb] px-3.5 text-xs text-[#526065]">
                <span className="truncate">{doc?.originalFileName} ({doc?.size ? `${(doc.size / 1024).toFixed(0)} KB` : ""})</span>
              </div>
              <span className="text-[11px] text-[#84908e]">A feltöltött fájl szerkesztéskor nem cserélhető.</span>
            </div>
          )}

          {/* Megnevezés */}
          <label className={labelClass}>
            <span>Megnevezés <span className="text-[#a43b2f]">*</span></span>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameUserEdited(true);
              }}
              placeholder="Dokumentum neve vagy leírása"
              required
              className={fieldClass}
            />
          </label>

          {/* Kategória */}
          <label className={labelClass}>
            <span>Kategória</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldClass}
            >
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </label>

          {/* Partner kapcsolat */}
          {canUsePartners && (
            <label className={labelClass}>
              <span>Kapcsolódó partner</span>
              <select
                value={partnerId}
                onChange={(e) => setPartnerId(e.target.value)}
                disabled={Boolean(defaultPartnerId)}
                className={fieldClass}
              >
                <option value="">Nincs partnerhez rendelve</option>
                {partners.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Projekt kapcsolat */}
          {canUseProjects && (
            <label className={labelClass}>
              <span>Kapcsolódó projekt</span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                disabled={Boolean(defaultProjectId)}
                className={fieldClass}
              >
                <option value="">Nincs projekthez rendelve</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          )}

          {/* Megjegyzés */}
          <label className={labelClass}>
            <span>Megjegyzés</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Opcionális megjegyzés a dokumentumhoz…"
              className="w-full rounded-md border border-[#d7dedc] bg-white p-3 text-xs text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 resize-none"
            />
          </label>
        </form>

        {/* Lábléc */}
        <div className="flex items-center justify-end gap-3 border-t border-[#e1e6e4] bg-[#fafbfb] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#465459] shadow-xs hover:bg-[#f4f6f5] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mégse
          </button>
          <button
            type="submit"
            form="document-form"
            disabled={submitting}
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-5 text-xs font-semibold text-white shadow-xs hover:bg-[#68aa6e] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting && <i className="pi pi-spinner pi-spin text-xs" aria-hidden="true" />}
            {isEditing ? "Módosítások mentése" : "Dokumentum feltöltése"}
          </button>
        </div>
      </div>
    </div>
  );
}
