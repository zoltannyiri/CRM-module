import { useEffect, useState } from "react";

export default function ContactCardView({
  contacts = [],
  selected = [],
  onToggleSelect,
  onView,
  onEdit,
  onDelete,
  deletingId = null,
  loading = false,
  loadError = "",
}) {
  const [openMenuId, setOpenMenuId] = useState(null);

  useEffect(() => {
    if (!openMenuId) return undefined;
    const handlePointerDown = () => setOpenMenuId(null);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuId]);

  if (loading) {
    return (
      <div
        className="grid h-52 place-items-center rounded-2xl border border-[#dbe1df] bg-white"
        role="status"
        aria-label="Kapcsolattartó-kártyák betöltése"
      >
        <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className="grid h-48 place-items-center rounded-2xl border border-[#dbe1df] bg-white text-xs text-[#778286]">
        {loadError || "Nincs megjeleníthető kapcsolattartó."}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
      role="region"
      aria-label="Kapcsolattartó-kártyák"
    >
      {contacts.map((contact) => {
        const isSelected = selected.includes(contact.id);
        const fullName = `${contact.firstName} ${contact.lastName}`;
        const initials = `${contact.firstName[0] || ""}${contact.lastName[0] || ""}`.toUpperCase();
        const partnerName = contact.partner?.name || "—";
        const partnerType = contact.partner?.type === "COMPANY" ? "Cég" : "Magánszemély";

        return (
          <article
            key={contact.id}
            onClick={() => onView?.(contact)}
            className={`group relative flex cursor-pointer flex-col justify-between rounded-xl border bg-white p-5 transition duration-150 ease-out hover:border-[#bcc8c5] hover:shadow-[0_4px_16px_rgba(24,39,43,0.05)] ${
              isSelected ? "border-[#78ad7d] bg-[#f9fbf9] ring-1 ring-[#78ad7d]/30" : "border-[#dbe1df]"
            }`}
          >
            {/* Fejléc: Checkbox, Avatar, Név, Beosztás és Műveleti Menü */}
            <div className="flex items-start justify-between gap-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(event) => {
                    event.stopPropagation();
                    onToggleSelect?.(contact.id);
                  }}
                  aria-label={`${fullName} kijelölése`}
                  className="size-4 shrink-0 cursor-pointer rounded-sm accent-[#78ad7d]"
                />

                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-xs font-semibold text-[#517057]">
                  {initials}
                </span>

                <div className="min-w-0 flex-1">
                  <h3
                    className="m-0 truncate text-sm font-semibold text-[#253338] group-hover:text-[#18272b]"
                    title={fullName}
                  >
                    {fullName}
                  </h3>
                  <span className="mt-0.5 inline-block truncate text-[11px] font-medium text-[#71807c]">
                    {contact.position || "Kapcsolattartó"}
                  </span>
                </div>
              </div>

              {/* 3 pontos műveleti gomb */}
              <div className="relative shrink-0" onClick={(event) => event.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setOpenMenuId((current) => (current === contact.id ? null : contact.id))}
                  aria-label={`${fullName} műveletek`}
                  title="Műveletek"
                  className="grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[#748084] transition hover:bg-[#f1f4f3] hover:text-[#253238]"
                >
                  <i className="pi pi-ellipsis-v text-xs" aria-hidden="true" />
                </button>

                {openMenuId === contact.id && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-[#d9e0de] bg-white py-1 shadow-[0_8px_24px_rgba(28,45,48,.12)] text-xs"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        onView?.(contact);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#344247] hover:bg-[#f2f5f4]"
                    >
                      <i className="pi pi-eye text-xs text-[#627b68]" aria-hidden="true" />
                      <span>Megtekintés</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        onEdit?.(contact);
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#344247] hover:bg-[#f2f5f4]"
                    >
                      <i className="pi pi-pencil text-xs text-[#627b68]" aria-hidden="true" />
                      <span>Módosítás</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setOpenMenuId(null);
                        onDelete?.(contact);
                      }}
                      disabled={deletingId === contact.id}
                      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[#a34b3d] hover:bg-[#fdf1ee] disabled:cursor-wait disabled:opacity-50"
                    >
                      <i
                        className={`pi ${deletingId === contact.id ? "pi-spinner pi-spin" : "pi-trash"} text-xs`}
                        aria-hidden="true"
                      />
                      <span>Törlés</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Kártyatest: Partner szervezet, Email és Telefon, Megjegyzés */}
            <div className="mt-4 space-y-3 border-t border-[#f0f3f2] pt-3.5 text-xs">
              {/* Partner szervezet */}
              <div>
                <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                  Partner szervezet
                </span>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-[#344247]" title={partnerName}>
                    {partnerName}
                  </span>
                  {contact.partner?.type && (
                    <span className="shrink-0 rounded bg-[#f1f4f3] px-1.5 py-0.5 text-[10px] font-medium text-[#556468]">
                      {partnerType}
                    </span>
                  )}
                </div>
              </div>

              {/* Email és Telefon */}
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                    Email
                  </span>
                  <span className="mt-0.5 block truncate font-medium text-[#344247]" title={contact.email || ""}>
                    {contact.email || "—"}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                    Telefon
                  </span>
                  <span className="mt-0.5 block truncate font-medium text-[#344247]" title={contact.phone || ""}>
                    {contact.phone || "—"}
                  </span>
                </div>
              </div>

              {/* Megjegyzés */}
              {contact.note && (
                <div>
                  <span className="block text-[10px] font-semibold tracking-wider text-[#8a9695] uppercase">
                    Megjegyzés
                  </span>
                  <p className="mt-0.5 line-clamp-2 text-[#61706e]" title={contact.note}>
                    {contact.note}
                  </p>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
