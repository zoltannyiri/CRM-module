import { useEffect, useRef, useState } from "react";

export default function PartnerCardView({
  partners = [],
  selected = [],
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  canView = true,
  canEdit = false,
  canDelete = false,
  deletingId = null,
  loading = false,
  loadError = "",
}) {
  const hasActions = canEdit || canDelete;
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuContainerRef = useRef(null);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const handlePointerDown = (event) => {
      if (menuContainerRef.current && menuContainerRef.current.contains(event.target)) {
        return;
      }
      setOpenMenuId(null);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuId]);

  if (loading) {
    return (
      <div
        className="grid h-52 place-items-center rounded-2xl border border-[#dbe1df] bg-white"
        role="status"
        aria-label="Partnerkártyák betöltése"
      >
        <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-2xl border border-[#dbe1df] bg-white text-xs text-[#778286]">
        {loadError || "Nincs megjeleníthető partner."}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="region"
      aria-label="Partnerkártyák"
    >
      {partners.map((partner) => {
        const isSelected = selected.includes(partner.id);
        const initials = partner.name
          .split(" ")
          .slice(0, 2)
          .map((word) => word[0])
          .join("")
          .toUpperCase();

        const contactName = partner.contacts?.[0]
          ? `${partner.contacts[0].firstName} ${partner.contacts[0].lastName}`
          : "—";

        const typeLabel = partner.type === "COMPANY" ? "Cég" : "Magánszemély";

        return (
          <article
            key={partner.id}
            onClick={() => canView && onView?.(partner)}
            className={`group relative flex flex-col justify-between rounded-xl border bg-white p-5 transition duration-150 ease-out hover:border-[#bcc8c5] hover:shadow-[0_4px_16px_rgba(24,39,43,0.05)] ${
              canView && onView ? "cursor-pointer" : "cursor-default"
            } ${
              isSelected ? "border-[#78ad7d] bg-[#f9fbf9] ring-1 ring-[#78ad7d]/30" : "border-[#dbe1df]"
            }`}
          >
            {/* Fejléc: Checkbox, Avatar, Név, Típus, és Műveleti Menü */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) => {
                    event.stopPropagation();
                    onToggleSelect?.(partner.id);
                  }}
                  aria-label={`${partner.name} kijelölése`}
                  className="size-4 shrink-0 cursor-pointer rounded-sm accent-[#78ad7d]"
                />

                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#f1f4f3] text-xs font-semibold text-[#465458]">
                  {initials}
                </span>

                <div className="min-w-0 flex-1">
                  <h3
                    className="m-0 truncate text-sm font-semibold text-[#253238] group-hover:text-[#18272b]"
                    title={partner.name}
                  >
                    {partner.name}
                  </h3>
                  <span className="mt-0.5 inline-block text-[11px] font-medium text-[#71807c]">
                    {typeLabel}
                  </span>
                </div>
              </div>

              {/* 3 pontos műveleti gomb */}
              {hasActions && (
                <div
                  ref={openMenuId === partner.id ? menuContainerRef : null}
                  className="relative shrink-0"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setOpenMenuId((current) => (current === partner.id ? null : partner.id))}
                    aria-label={`${partner.name} műveletek`}
                    title="Műveletek"
                    className="grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[#748084] transition hover:bg-[#f1f4f3] hover:text-[#253238]"
                  >
                    <i className="pi pi-ellipsis-v pointer-events-none text-xs" aria-hidden="true" />
                  </button>

                  {openMenuId === partner.id && (
                    <div
                      role="menu"
                      className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-[#d9e0de] bg-white py-1 shadow-[0_8px_24px_rgba(28,45,48,.12)] text-xs"
                    >
                      {canView && onView && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(null);
                            onView(partner);
                          }}
                          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#344247] hover:bg-[#f2f5f4]"
                        >
                          <i className="pi pi-eye pointer-events-none text-xs text-[#627b68]" aria-hidden="true" />
                          <span>Megtekintés</span>
                        </button>
                      )}
                      {canEdit && onEdit && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(null);
                            onEdit(partner);
                          }}
                          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#344247] hover:bg-[#f2f5f4]"
                        >
                          <i className="pi pi-pencil pointer-events-none text-xs text-[#627b68]" aria-hidden="true" />
                          <span>Módosítás</span>
                        </button>
                      )}
                      {canDelete && onDelete && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenMenuId(null);
                            onDelete(partner);
                          }}
                          disabled={deletingId === partner.id}
                          className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#a34b3d] hover:bg-[#fdf1ee] disabled:cursor-wait disabled:opacity-50"
                        >
                          <i
                            className={`pi ${deletingId === partner.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none text-xs`}
                            aria-hidden="true"
                          />
                          <span>Törlés</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Kártyatest: Email, Telefon & Weboldal, Kapcsolattartó */}
            <div className="mt-4 space-y-3 border-t border-[#f0f3f2] pt-3.5 text-xs">
              {/* Email */}
              <div>
                <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                  Email
                </span>
                <span className="mt-0.5 block truncate font-medium text-[#344247]" title={partner.email || ""}>
                  {partner.email || "—"}
                </span>
              </div>

              {/* Telefon és Weboldal */}
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                    Telefon
                  </span>
                  <span className="mt-0.5 block truncate font-medium text-[#344247]" title={partner.phone || ""}>
                    {partner.phone || "—"}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                    Weboldal
                  </span>
                  {partner.website ? (
                    <a
                      href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="mt-0.5 block truncate font-medium text-[#1f3035] underline hover:text-[#445156]"
                      title={partner.website}
                    >
                      {partner.website}
                    </a>
                  ) : (
                    <span className="mt-0.5 block font-medium text-[#344247]">—</span>
                  )}
                </div>
              </div>

              {/* Kapcsolattartó */}
              <div>
                <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                  Kapcsolattartó
                </span>
                <span className="mt-0.5 block truncate font-medium text-[#344247]" title={contactName}>
                  {contactName}
                </span>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
