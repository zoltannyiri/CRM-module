import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../api/apiClient.js";

export default function ContactShowComponent({ contactId }) {
  const [contact, setContact] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    apiClient
      .get(`/contacts/${contactId}`)
      .then(({ data }) => {
        if (active) {
          setContact(data);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Hiba a kapcsolattartó betöltésekor:", err);
          const status = err.response?.status;
          if (status === 404) {
            setError("A kapcsolattartó nem található.");
          } else {
            setError("A kapcsolattartó adatai nem tölthetők be.");
          }
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [contactId]);

  if (loading) {
    return (
      <div
        className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white p-8"
        role="status"
        aria-label="Kapcsolattartó adatainak betöltése"
      >
        <div className="flex flex-col items-center gap-3">
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          <span className="text-xs text-[#71807c]">Kapcsolattartó adatainak betöltése…</span>
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
        <p className="mt-1 text-xs text-[#71807c]">
          A keresett kapcsolattartó nem található vagy törölve lett. Térj vissza a kapcsolattartók listájához.
        </p>
        <Link
          to="/contact"
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9]"
        >
          <i className="pi pi-arrow-left text-xs" aria-hidden="true" />
          Vissza a kapcsolattartókhoz
        </Link>
      </div>
    );
  }

  if (!contact) return null;

  const fullName = `${contact.firstName} ${contact.lastName}`.trim();
  const initials = `${contact.firstName?.[0] || ""}${contact.lastName?.[0] || ""}`.toUpperCase() || "KT";
  const partnerName = contact.partner?.name || "—";
  const partnerTypeLabel = contact.partner?.type === "COMPANY" ? "Cég" : "Magánszemély";

  return (
    <div className="space-y-5">
      {/* Összegző kártya */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#eef4ee] text-base font-bold text-[#517057]">
            {initials}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-[#253238]">{fullName}</h2>
              {contact.position && (
                <span className="inline-flex items-center rounded-md bg-[#f1f4f3] px-2 py-0.5 text-xs font-medium text-[#536166]">
                  {contact.position}
                </span>
              )}
            </div>
            {contact.partner?.name && (
              <p className="mt-1 text-xs text-[#71807c]">
                Partner:{" "}
                <Link
                  to={`/partner/${contact.partner.id}`}
                  className="font-medium text-[#1f3035] underline hover:text-[#445156]"
                >
                  {contact.partner.name}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Részletes adatkártyák grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 1. Alapadatok */}
        <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
          <h3 className="mb-4 flex items-center gap-2 border-b border-[#f0f3f2] pb-3 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
            <i className="pi pi-id-card text-sm text-[#78ad7d]" aria-hidden="true" />
            Alapadatok
          </h3>
          <dl className="grid gap-3.5 text-xs">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Keresztnév</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{contact.firstName || "—"}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Vezetéknév</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{contact.lastName || "—"}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Beosztás</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{contact.position || "—"}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Partner szervezet</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">
                {contact.partner?.id ? (
                  <Link
                    to={`/partner/${contact.partner.id}`}
                    className="text-[#1f3035] underline hover:text-[#445156]"
                  >
                    {partnerName}
                  </Link>
                ) : (
                  partnerName
                )}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Partner típusa</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{partnerTypeLabel}</dd>
            </div>
          </dl>
        </section>

        {/* 2. Elérhetőségek */}
        <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
          <h3 className="mb-4 flex items-center gap-2 border-b border-[#f0f3f2] pb-3 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
            <i className="pi pi-phone text-sm text-[#78ad7d]" aria-hidden="true" />
            Elérhetőségek
          </h3>
          <dl className="grid gap-3.5 text-xs">
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Email cím</dt>
              <dd className="font-medium sm:col-span-2">
                {contact.email ? (
                  <a
                    href={`mailto:${contact.email}`}
                    className="text-[#1f3035] underline hover:text-[#445156]"
                  >
                    {contact.email}
                  </a>
                ) : (
                  <span className="text-[#253238]">—</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Telefonszám</dt>
              <dd className="font-medium sm:col-span-2">
                {contact.phone ? (
                  <a
                    href={`tel:${contact.phone}`}
                    className="text-[#1f3035] hover:underline hover:text-[#445156]"
                  >
                    {contact.phone}
                  </a>
                ) : (
                  <span className="text-[#253238]">—</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* 3. Megjegyzés */}
        <section className="rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)] lg:col-span-2">
          <h3 className="mb-4 flex items-center gap-2 border-b border-[#f0f3f2] pb-3 text-xs font-bold tracking-wider text-[#8a9695] uppercase">
            <i className="pi pi-file-edit text-sm text-[#78ad7d]" aria-hidden="true" />
            Megjegyzés
          </h3>
          <div className="text-xs text-[#344247]">
            {contact.note ? (
              <p className="whitespace-pre-wrap leading-relaxed">{contact.note}</p>
            ) : (
              <span className="text-[#71807c]">—</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
