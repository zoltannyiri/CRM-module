import { useRef, useState } from "react";
import { formatFileSize } from "./documentDisplay.js";
import { ACCEPTED_DOCUMENT_TYPES, validateDocumentFile } from "./documentUploadValidation.js";

export default function DocumentUploadField({ file, onChange, disabled = false, status = "idle" }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const select = (nextFile) => {
    const message = validateDocumentFile(nextFile);
    setError(message);
    if (!message) onChange(nextFile);
    else if (inputRef.current) inputRef.current.value = "";
  };
  return <div className="grid gap-2">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#344247] hover:bg-[#f5f7f6] disabled:cursor-wait disabled:opacity-50">Fájl kiválasztása</button>
      <input ref={inputRef} type="file" className="sr-only" accept={ACCEPTED_DOCUMENT_TYPES.join(",")} onChange={(event) => select(event.target.files?.[0])} />
      {file && <div className="min-w-0 flex-1 text-xs"><p className="truncate font-medium text-[#344247]">{file.name}</p><p className="text-[#7b8885]">{formatFileSize(file.size)} · {file.type || "ismeretlen típus"}</p></div>}
      {file && <button type="button" disabled={disabled} onClick={() => { onChange(null); setError(""); if (inputRef.current) inputRef.current.value = ""; }} className="grid size-8 cursor-pointer place-items-center rounded-md text-[#9a4335] hover:bg-[#fdf1ee]" aria-label="Fájl eltávolítása"><i className="pi pi-times text-xs" /></button>}
    </div>
    {status === "uploading" && <p className="text-xs text-[#657276]"><i className="pi pi-spinner pi-spin mr-2" />Feltöltés…</p>}
    {status === "done" && <p className="text-xs text-[#3c7547]">Feltöltve</p>}
    {error && <p role="alert" className="text-xs text-[#9a4335]">{error}</p>}
    <p className="text-[11px] text-[#84908e]">PDF, DOC, DOCX, XLS, XLSX, CSV, TXT, JPG, PNG vagy WEBP; maximum 20 MB.</p>
  </div>;
}
