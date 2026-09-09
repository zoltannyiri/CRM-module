import { useEffect, useState } from "react";

import apiClient from "../../api/apiClient.js";
import ContactFormComponent from "../contact/ContactFormComponent.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";

const actionButtonClass = "grid size-8 cursor-pointer place-items-center rounded-md border border-transparent bg-transparent text-xs text-[#657276] transition hover:border-[#d8dfdd] hover:bg-[#f1f4f3] hover:text-[#27373c] disabled:cursor-wait disabled:opacity-50";

export default function PartnerContactsComponent({ partnerId }) {
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  const canView = hasPermission("PARTNERS_VIEW");
  const canCreate = hasPermission("PARTNERS_CREATE");
  const canEdit = hasPermission("PARTNERS_EDIT");
  const canDelete = hasPermission("PARTNERS_DELETE");
  const hasActions = canEdit || canDelete;
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [activeContact, setActiveContact] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [deletingId, setDeletingId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.get("/contacts", { params: { partnerId } })
      .then(({ data }) => {
        if (active) {
          setContacts(data);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("A kapcsolattartók nem tölthetők be.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [partnerId, reloadKey]);

  const reloadContacts = () => {
    setLoading(true);
    setError("");
    setReloadKey((value) => value + 1);
  };

  const openCreate = () => {
    if (!canCreate) {
      showError("Nincs jogosultsága új kapcsolattartó létrehozásához.", "Nincs jogosultság");
      return;
    }
    setActiveContact(null);
    setFormMode("create");
    setFormOpen(true);
  };

  const openContact = (contact, mode) => {
    if (mode === "edit" && !canEdit) {
      showError("Nincs jogosultsága a kapcsolattartó módosításához.", "Nincs jogosultság");
      return;
    }
    if (mode === "view" && !canView) {
      showError("Nincs jogosultsága a kapcsolattartó megtekintéséhez.", "Nincs jogosultság");
      return;
    }
    setActiveContact(contact);
    setFormMode(mode);
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    reloadContacts();
  };

  const handleDelete = async (contact) => {
    if (!canDelete) {
      showError("Nincs jogosultsága a kapcsolattartó törléséhez.", "Nincs jogosultság");
      return;
    }
    const fullName = `${contact.firstName} ${contact.lastName}`;
    if (!window.confirm(`Biztosan törölni szeretnéd ezt a kapcsolattartót: ${fullName}?`)) return;

    setDeletingId(contact.id);
    setError("");
    try {
      await apiClient.delete(`/contacts/${contact.id}`);
      setContacts((current) => current.filter(({ id }) => id !== contact.id));
      showSuccess("A kapcsolattartó sikeresen törölve.");
    } catch {
      setError("A kapcsolattartó törlése sikertelen.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section aria-labelledby="partner-contacts-title">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="partner-contacts-title" className="text-base font-semibold text-[#29383d]">Kapcsolattartók</h2>
          <p className="mt-1 text-xs text-[#71807c]">A partnerhez tartozó személyek és elérhetőségeik.</p>
        </div>
        {canCreate && <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#68aa6e]">
          <i className="pi pi-plus text-[10px]" aria-hidden="true" />
          Új kapcsolattartó
        </button>}
      </div>

      <div className="relative overflow-hidden rounded-xl border border-[#dbe1df] bg-white" aria-busy={loading}>
        <div className={`hidden ${hasActions ? "grid-cols-[minmax(150px,1.25fr)_minmax(110px,.8fr)_minmax(170px,1.2fr)_minmax(125px,.9fr)_108px]" : "grid-cols-[minmax(150px,1.25fr)_minmax(110px,.8fr)_minmax(170px,1.2fr)_minmax(125px,.9fr)]"} border-b border-[#dbe1df] bg-[#fafbfb] px-4 text-[11px] font-medium text-[#657276] md:grid`}>
          <span className="py-3">Név</span>
          <span className="py-3">Beosztás</span>
          <span className="py-3">Email</span>
          <span className="py-3">Telefon</span>
          {hasActions && <span className="py-3 text-center">Műveletek</span>}
        </div>

        {loading ? (
          <div className="grid min-h-40 place-items-center" role="status" aria-label="Kapcsolattartók betöltése">
            <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          </div>
        ) : error ? (
          <div className="grid min-h-40 place-items-center px-6 text-center">
            <div>
              <p className="text-sm font-medium text-[#8f3f34]">{error}</p>
              <button type="button" onClick={reloadContacts} className="mt-3 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 py-2 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Újrapróbálás</button>
            </div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="grid min-h-52 place-items-center px-6 py-10 text-center">
            <div>
              <span className="mx-auto grid size-11 place-items-center rounded-full bg-[#eff6ee] text-[#69a46e]"><i className="pi pi-users text-base" aria-hidden="true" /></span>
              <p className="mt-4 text-sm font-medium text-[#344247]">Ehhez a partnerhez még nincs kapcsolattartó.</p>
              {canCreate && <button type="button" onClick={openCreate} className="mt-4 inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white hover:bg-[#68aa6e]"><i className="pi pi-plus text-[10px]" aria-hidden="true" />Új kapcsolattartó</button>}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#e4e9e7]">
            {contacts.map((contact) => {
              const fullName = `${contact.firstName} ${contact.lastName}`;
              return (
                <div key={contact.id} className={`grid gap-2 px-4 py-3.5 text-xs text-[#344247] transition-colors hover:bg-[#fafcfc] ${hasActions ? "md:grid-cols-[minmax(150px,1.25fr)_minmax(110px,.8fr)_minmax(170px,1.2fr)_minmax(125px,.9fr)_108px]" : "md:grid-cols-[minmax(150px,1.25fr)_minmax(110px,.8fr)_minmax(170px,1.2fr)_minmax(125px,.9fr)]"} md:items-center md:gap-0`}>
                  {canView ? (
                    <button type="button" onClick={() => openContact(contact, "view")} className="cursor-pointer border-0 bg-transparent p-0 text-left font-semibold text-[#263338] hover:underline">{fullName}</button>
                  ) : (
                    <span className="font-semibold text-[#263338]">{fullName}</span>
                  )}
                  <span><span className="mr-2 text-[#8a9693] md:hidden">Beosztás:</span>{contact.position || "—"}</span>
                  <span className="truncate"><span className="mr-2 text-[#8a9693] md:hidden">Email:</span>{contact.email || "—"}</span>
                  <span className="whitespace-nowrap"><span className="mr-2 text-[#8a9693] md:hidden">Telefon:</span>{contact.phone || "—"}</span>
                  {hasActions && (
                    <div className="flex items-center gap-1 md:justify-center">
                      {canView && <button type="button" onClick={() => openContact(contact, "view")} aria-label={`${fullName} megtekintése`} title="Megtekintés" className={actionButtonClass}><i className="pi pi-eye pointer-events-none" aria-hidden="true" /></button>}
                      {canEdit && <button type="button" onClick={() => openContact(contact, "edit")} aria-label={`${fullName} szerkesztése`} title="Szerkesztés" className={actionButtonClass}><i className="pi pi-pencil pointer-events-none" aria-hidden="true" /></button>}
                      {canDelete && <button type="button" onClick={() => handleDelete(contact)} disabled={deletingId === contact.id} aria-label={`${fullName} törlése`} title="Törlés" className={`${actionButtonClass} text-[#a34b3d] hover:border-[#e7c9c2] hover:bg-[#fdf1ee] hover:text-[#8f392d]`}><i className={`pi ${deletingId === contact.id ? "pi-spinner pi-spin" : "pi-trash"} pointer-events-none`} aria-hidden="true" /></button>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <ContactFormComponent
          mode={formMode}
          contact={activeContact}
          defaultPartnerId={partnerId}
          onClose={() => setFormOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </section>
  );
}
