import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";
import { useToast } from "../../hooks/useToast.js";
import { useAuth } from "../../hooks/useAuth.js";

const fieldClass =
  "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:cursor-default disabled:bg-[#f5f7f6] disabled:text-[#536166]";
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
  const { showSuccess } = useToast();
  const { hasModule, hasPermission } = useAuth();
  const isEditing = mode === "edit";

  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canUseProjects = hasModule("PROJECTS") && hasPermission("PROJECTS_VIEW");

  const existingPartnerId = doc?.partner?.id ? String(doc.partner.id) : "";
  const existingProjectId = doc?.project?.id ? String(doc.project.id) : "";

  const [selectedFile, setSelectedFile] = useState(null);
  const [name, setName] = useState(() => doc?.name || "");
  const [nameUserEdited, setNameUserEdited] = useState(() => Boolean(doc?.name));
  const [category, setCategory] = useState(() => doc?.category || "Általános");
  const [partnerId, setPartnerId] = useState(() =>
    defaultPartnerId ? String(defaultPartnerId) : isEditing ? existingPartnerId : "",
  );
  const [projectId, setProjectId] = useState(() =>
    defaultProjectId ? String(defaultProjectId) : isEditing ? existingProjectId : "",
  );
  const [note, setNote] = useState(() => doc?.note || "");

  const [partners, setPartners] = useState(() => (doc?.partner ? [doc.partner] : []));
  const [projects, setProjects] = useState(() => (doc?.project ? [doc.project] : []));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (!canUsePartners) return;
    let active = true;
    apiClient
      .get("/partners")
      .then(({ data }) => {
        if (active) setPartners(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [canUsePartners]);

  useEffect(() => {
    if (!canUseProjects) return;
    let active = true;
    apiClient
      .get("/projects")
      .then(({ data }) => {
        if (active) setProjects(data);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
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
          ...(canUsePartners && { partnerId: partnerId ? Number(partnerId) : null }),
          ...(canUseProjects && { projectId: projectId ? Number(projectId) : null }),
        };
        const response = await apiClient.patch(`/documents/${doc.id}`, payload);
        onSaved?.(response.data);
        showSuccess("A dokumentum adatai sikeresen módosultak.");
        onClose();
      } else {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("name", name.trim());
        if (category) formData.append("category", category.trim());
        if (note) formData.append("note", note.trim());
        if (partnerId) formData.append("partnerId", partnerId);
        if (projectId) formData.append("projectId", projectId);

        const response = await apiClient.post("/documents", formData);
        onSaved?.(response.data);
        showSuccess("A dokumentum sikeresen feltöltve.");
        onClose();
      }
    } catch (requestError) {
      const message =
        requestError.response?.data?.message ||
        requestError.message ||
        "A dokumentum mentése sikertelen.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="document-form-title"
    >
      <button
        type="button"
        aria-label="Dokumentum űrlap bezárása"
        onClick={onClose}
        className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200"
      />

      <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
        <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">
              Dokumentumok
            </p>
            <h2 id="document-form-title" className="text-xl font-semibold text-[#253238]">
              {isEditing ? "Dokumentum szerkesztése" : "Új dokumentum"}
            </h2>
            <p className="mt-1.5 text-sm text-[#71807c]">
              {isEditing
                ? "Módosítsd a dokumentum adatait."
                : "Tölts fel egy új fájlt és add meg az adatait."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]"
          >
            Bezárás
          </button>
        </header>

        <form
          id="document-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-7 py-7"
        >
          <div className="mx-auto grid max-w-3xl gap-7">
            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                {!isEditing ? (
                  <label className={`${labelClass} sm:col-span-2`}>
                    <span>
                      Fájl <span className="text-[#a43b2f]">*</span>
                    </span>
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
                        {selectedFile
                          ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(0)} KB)`
                          : "Nincs fájl kiválasztva"}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#84908e]">
                      Engedélyezett: PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG (max. 20 MB)
                    </span>
                  </label>
                ) : (
                  <div className={`${labelClass} sm:col-span-2`}>
                    <span>Eredeti fájl</span>
                    <div className="flex h-11 items-center rounded-md border border-[#e1e6e4] bg-[#fafbfb] px-3.5 text-xs text-[#526065]">
                      <span className="truncate">
                        {doc?.originalFileName}{" "}
                        {doc?.size ? `(${(doc.size / 1024).toFixed(0)} KB)` : ""}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#84908e]">
                      A feltöltött fájl szerkesztéskor nem cserélhető.
                    </span>
                  </div>
                )}

                <label className={`${labelClass} sm:col-span-2`}>
                  <span>
                    Megnevezés <span className="text-[#a43b2f]">*</span>
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameUserEdited(true);
                    }}
                    placeholder="Dokumentum megnevezése"
                    required
                    autoFocus
                    className={fieldClass}
                  />
                </label>

                <label className={labelClass}>
                  <span>Kategória</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={fieldClass}
                  >
                    {CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </label>

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
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

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
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Megjegyzés</h3>
              <label className={labelClass}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className={`${fieldClass} h-auto resize-y py-3`}
                  placeholder="Megjegyzés a dokumentumról..."
                />
              </label>
            </section>

            {error && (
              <p
                role="alert"
                className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]"
              >
                {error}
              </p>
            )}
          </div>
        </form>

        <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]"
          >
            Mégse
          </button>
          <button
            type="submit"
            form="document-form"
            disabled={submitting}
            className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Dokumentum feltöltése"}
          </button>
        </footer>
      </aside>
    </div>
  );
}
