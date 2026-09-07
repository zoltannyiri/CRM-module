import { useEffect, useMemo, useState } from "react";
import apiClient from "../../api/apiClient.js";
import ContactTableView from "./ContactTableView.jsx";
import ContactCardView from "./ContactCardView.jsx";

const iconPaths = {
  left: <path d="m15 18-6-6 6-6" />,
  right: <path d="m9 18 6-6-6-6" />,
};

function Icon({ name, className = "size-4" }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {iconPaths[name]}
    </svg>
  );
}

function getStoredViewMode() {
  try {
    const stored = localStorage.getItem("contactViewMode");
    return stored === "cards" ? "cards" : "table";
  } catch {
    return "table";
  }
}

export default function ContactListComponent({
  query = "",
  typeFilter = "ALL",
  sortDirection = "desc",
  reloadKey = 0,
  viewMode: controlledViewMode,
  onView,
  onEdit,
}) {
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [internalViewMode] = useState(getStoredViewMode);
  const rowsPerPage = 10;

  const currentViewMode = controlledViewMode ?? internalViewMode;

  useEffect(() => {
    let active = true;

    apiClient
      .get("/contacts")
      .then(({ data }) => {
        if (active) {
          setContacts(data);
          setLoadError("");
        }
      })
      .catch((error) => {
        if (active) setLoadError(error.message || "A kapcsolattartók betöltése sikertelen.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filteredContacts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("hu");
    const filtered = contacts.filter((contact) => {
      const typeMatches = typeFilter === "ALL" || contact.partner?.type === typeFilter;
      const fullName = `${contact.firstName} ${contact.lastName}`;
      const queryMatches =
        !needle ||
        [fullName, contact.partner?.name, contact.position, contact.email, contact.phone].some((value) =>
          value?.toLocaleLowerCase("hu").includes(needle),
        );
      return typeMatches && queryMatches;
    });
    return [...filtered].sort((a, b) => (sortDirection === "asc" ? a.id - b.id : b.id - a.id));
  }, [contacts, query, sortDirection, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredContacts.length / rowsPerPage));
  const currentPage = Math.min(page, pageCount);
  const visible = filteredContacts.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  const visibleIds = visible.map(({ id }) => id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));

  const toggleAll = () => {
    setSelected((current) =>
      allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])],
    );
  };

  const toggleContact = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const handleDelete = async (contact) => {
    const fullName = `${contact.firstName} ${contact.lastName}`;
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a kapcsolattartót: ${fullName}?`)) return;

    setDeletingId(contact.id);
    setLoadError("");
    try {
      await apiClient.delete(`/contacts/${contact.id}`);
      setContacts((current) => current.filter(({ id }) => id !== contact.id));
      setSelected((current) => current.filter((id) => id !== contact.id));
    } catch (error) {
      setLoadError(error.message || "A kapcsolattartó törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="bg-[#f3f5f6] px-5 pb-5" aria-labelledby="contact-list-title">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[.12em] text-[#8a9693] uppercase">Kapcsolatok</p>
          <h2 id="contact-list-title" className="text-base font-semibold text-[#29383d]">
            Kapcsolattartók
          </h2>
        </div>
        <span className="text-xs text-[#7b8885]">{filteredContacts.length} találat</span>
      </div>

      {selected.length > 0 && (
        <div
          className={`border border-[#dbe1df] bg-white px-4 py-2.5 text-xs font-medium text-[#4f7954] flex items-center justify-between ${
            currentViewMode === "table" ? "border-b-0 rounded-t-2xl" : "mb-3 rounded-xl"
          }`}
        >
          <span>{selected.length} kapcsolattartó kiválasztva</span>
          <button
            type="button"
            onClick={() => setSelected([])}
            className="cursor-pointer text-[11px] text-[#657276] hover:text-[#253238] underline"
          >
            Kijelölés megszüntetése
          </button>
        </div>
      )}

      {currentViewMode === "table" ? (
        <ContactTableView
          contacts={visible}
          selected={selected}
          allSelected={allSelected}
          onToggleSelect={toggleContact}
          onToggleAll={toggleAll}
          onView={onView}
          onEdit={onEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
          loading={loading}
          loadError={loadError}
        />
      ) : (
        <ContactCardView
          contacts={visible}
          selected={selected}
          allSelected={allSelected}
          onToggleSelect={toggleContact}
          onToggleAll={toggleAll}
          onView={onView}
          onEdit={onEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
          loading={loading}
          loadError={loadError}
        />
      )}

      <nav className="mt-5 flex justify-center" aria-label="Kapcsolattartó-lista lapozása">
        <div className="inline-flex overflow-hidden rounded-md border border-[#d6dddc] bg-white shadow-[0_1px_1px_rgba(26,39,35,.025)]">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => value - 1)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-r border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="left" className="size-3.5" />
            Előző
          </button>
          {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
            <button
              key={number}
              type="button"
              onClick={() => setPage(number)}
              aria-current={number === currentPage ? "page" : undefined}
              className={`size-9 cursor-pointer border-0 border-r border-[#dfe4e3] text-xs last:border-0 ${
                number === currentPage
                  ? "bg-[#f0f3f2] font-semibold text-[#1f3035]"
                  : "bg-white text-[#445156] hover:bg-[#f7f8f8]"
              }`}
            >
              {number}
            </button>
          ))}
          <button
            type="button"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => value + 1)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 border-0 border-l border-[#dfe4e3] bg-white px-3 text-xs hover:bg-[#f7f8f8] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Következő
            <Icon name="right" className="size-3.5" />
          </button>
        </div>
      </nav>
    </section>
  );
}
