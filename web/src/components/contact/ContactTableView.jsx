import { DataTable } from "primereact/datatable";
import { Column } from "primereact/column";

const cellClass = "h-[58px] border-r border-b border-[#e1e6e4] px-4 text-xs text-[#344247] last:border-r-0";
const headerClass = "h-12 border-r border-b border-[#dbe1df] px-4 text-left text-[11px] font-medium text-[#445156] last:border-r-0";
const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

export default function ContactTableView({
  contacts = [],
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
  const checkboxTemplate = (contact) => {
    const checked = selected.includes(contact.id);
    return (
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggleSelect?.(contact.id)}
        onClick={(event) => event.stopPropagation()}
        aria-label={`${contact.firstName} ${contact.lastName} kijelölése`}
        className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]"
      />
    );
  };

  const nameTemplate = (contact) => {
    const initials = `${contact.firstName[0] || ""}${contact.lastName[0] || ""}`.toUpperCase();
    return (
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-[11px] font-medium text-[#517057]">
          {initials}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onView?.(contact);
          }}
          className="cursor-pointer border-0 bg-transparent p-0 text-left font-medium text-[#263338] hover:underline"
        >
          {contact.firstName} {contact.lastName}
        </button>
      </div>
    );
  };

  const actionTemplate = (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    return (
      <div
        className="flex items-center justify-center gap-1 whitespace-nowrap"
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onView?.(contact);
          }}
          aria-label={`${fullName} megtekintése`}
          title="Megtekintés"
          className={actionButtonClass}
        >
          <i className="pi pi-eye pointer-events-none" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit?.(contact);
          }}
          aria-label={`${fullName} módosítása`}
          title="Módosítás"
          className={actionButtonClass}
        >
          <i className="pi pi-pencil pointer-events-none" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete?.(contact);
          }}
          disabled={deletingId === contact.id}
          aria-label={`${fullName} törlése`}
          title="Törlés"
          className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}
        >
          <i
            className={`pi ${deletingId === contact.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none`}
            aria-hidden="true"
          />
        </button>
      </div>
    );
  };

  return (
    <div
      className="relative overflow-x-auto rounded-2xl border border-[#dbe1df] bg-white"
      aria-busy={loading}
    >
      {loading && (
        <div
          className="absolute inset-x-0 top-12 bottom-0 z-10 grid place-items-center bg-white/80 backdrop-blur-[1px]"
          role="status"
          aria-label="Kapcsolattartó-lista betöltése"
        >
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
        </div>
      )}

      <DataTable
        value={contacts}
        dataKey="id"
        unstyled
        tableClassName="w-full min-w-[980px] border-collapse text-left"
        rowClassName={(contact) =>
          `${selected.includes(contact.id) ? "bg-[#f5faf5]" : "bg-white"} hover:bg-[#fafcfc]`
        }
        onRowDoubleClick={(event) => onView?.(event.data)}
        emptyMessage={
          <span className="block h-40 pt-16 text-center text-xs text-[#778286]">
            {loadError || "Nincs megjeleníthető kapcsolattartó."}
          </span>
        }
      >
        <Column
          header={
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onToggleAll?.()}
              aria-label="Minden látható kapcsolattartó kijelölése"
              className="size-4 cursor-pointer rounded-sm accent-[#78ad7d]"
            />
          }
          body={checkboxTemplate}
          headerClassName={`${headerClass} w-14 px-5`}
          bodyClassName={`${cellClass} w-14 px-5`}
        />
        <Column
          header="Kapcsolattartó"
          body={nameTemplate}
          headerClassName={`${headerClass} w-[24%]`}
          bodyClassName={`${cellClass} w-[24%]`}
        />
        <Column
          field="partner.name"
          header="Partner"
          body={(contact) => contact.partner?.name || "—"}
          headerClassName={`${headerClass} w-[23%]`}
          bodyClassName={`${cellClass} w-[23%] font-medium`}
        />
        <Column
          field="position"
          header="Beosztás"
          body={(contact) => contact.position || "—"}
          headerClassName={`${headerClass} w-[18%]`}
          bodyClassName={`${cellClass} w-[18%]`}
        />
        <Column
          field="email"
          header="Email"
          body={(contact) => contact.email || "—"}
          headerClassName={`${headerClass} w-[22%]`}
          bodyClassName={`${cellClass} w-[22%]`}
        />
        <Column
          field="phone"
          header="Telefon"
          body={(contact) => contact.phone || "—"}
          headerClassName={`${headerClass} w-[18%]`}
          bodyClassName={`${cellClass} w-[18%] whitespace-nowrap`}
        />
        <Column
          header="Műveletek"
          body={actionTemplate}
          headerClassName={`${headerClass} w-[130px] !px-2 text-center`}
          bodyClassName={`${cellClass} w-[130px] !px-2`}
        />
      </DataTable>
    </div>
  );
}
