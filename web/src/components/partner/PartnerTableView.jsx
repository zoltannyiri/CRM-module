import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

export default function PartnerTableView({
  partners = [],
  selected = [],
  allSelected = false,
  onToggleSelect,
  onToggleAll,
  onView,
  onEdit,
  onDelete,
  deletingId = null,
  loading = false,
  loadError = "",
}) {
  const checkboxTemplate = (partner) => {
    const checked = selected.includes(partner.id);
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggleSelect?.(partner.id)}
        aria-label={`${partner.name} kijelölése`}
        className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]"
      />
    );
  };

  const partnerTemplate = (partner) => {
    const initials = partner.name
      .split(" ")
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase();

    return (
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f4f3] text-[11px] font-medium text-[#465458]">
          {initials}
        </span>
        <button
          type="button"
          onClick={() => onView?.(partner)}
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-xs font-medium text-[#263338] hover:underline"
        >
          {partner.name}
        </button>
      </div>
    );
  };

  const actionTemplate = (partner) => (
    <div className="flex items-center justify-center gap-1 whitespace-nowrap">
      <button
        type="button"
        onClick={() => onView?.(partner)}
        aria-label={`${partner.name} megtekintése`}
        title="Megtekintés"
        className={actionButtonClass}
      >
        <i className="pi pi-eye" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onEdit?.(partner)}
        aria-label={`${partner.name} módosítása`}
        title="Módosítás"
        className={actionButtonClass}
      >
        <i className="pi pi-pencil" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete?.(partner)}
        disabled={deletingId === partner.id}
        aria-label={`${partner.name} törlése`}
        title="Törlés"
        className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}
      >
        <i className={`pi ${deletingId === partner.id ? "pi-spinner pi-spin" : "pi-trash"}`} aria-hidden="true" />
      </button>
    </div>
  );

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-[#dbe1df] bg-white" aria-busy={loading}>
      {loading && (
        <div
          className="absolute inset-x-0 top-12 bottom-0 z-10 grid place-items-center bg-white/80 backdrop-blur-[1px]"
          role="status"
          aria-label="Partnerlista betöltése"
        >
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
        </div>
      )}

      <DataTable
        value={partners}
        dataKey="id"
        unstyled
        tableClassName="w-full min-w-[1100px] border-collapse text-left"
        rowClassName={(partner) => `${selected.includes(partner.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`}
        onRowDoubleClick={(event) => onView?.(event.data)}
        emptyMessage={
          <span className="block h-40 pt-16 text-center text-xs text-[#778286]">
            {loadError || "Nincs megjeleníthető partner."}
          </span>
        }
      >
        <Column
          header={
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleAll?.()}
              aria-label="Minden látható partner kijelölése"
              className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]"
            />
          }
          body={checkboxTemplate}
          headerClassName={`${headerClass} w-14 px-5`}
          bodyClassName={`${cellClass} w-14 px-5`}
        />
        <Column
          field="name"
          header="Partner neve"
          body={partnerTemplate}
          headerClassName={`${headerClass} w-[26%]`}
          bodyClassName={`${cellClass} w-[26%]`}
        />
        <Column
          field="type"
          header="Típus"
          body={(partner) => (partner.type === "COMPANY" ? "Cég" : "Magánszemély")}
          headerClassName={`${headerClass} w-[15%]`}
          bodyClassName={`${cellClass} w-[15%]`}
        />
        <Column
          field="email"
          header="Email"
          body={(partner) => partner.email || "—"}
          headerClassName={`${headerClass} w-[21%]`}
          bodyClassName={`${cellClass} w-[21%]`}
        />
        <Column
          field="phone"
          header="Telefon"
          body={(partner) => partner.phone || "—"}
          headerClassName={`${headerClass} w-[17%]`}
          bodyClassName={`${cellClass} w-[17%] whitespace-nowrap`}
        />
        <Column
          field="website"
          header="Weboldal"
          body={(partner) =>
            partner.website ? (
              <a
                href={partner.website.startsWith("http") ? partner.website : `https://${partner.website}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[#1f3035] underline hover:text-[#445156]"
              >
                {partner.website}
              </a>
            ) : (
              "—"
            )
          }
          headerClassName={`${headerClass} w-[21%]`}
          bodyClassName={`${cellClass} w-[21%]`}
        />
        <Column
          header="Műveletek"
          body={actionTemplate}
          headerClassName={`${headerClass} w-[130px] text-center`}
          bodyClassName={`${cellClass} w-[130px]`}
        />
      </DataTable>
    </div>
  );
}
