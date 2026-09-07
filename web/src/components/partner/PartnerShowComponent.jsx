import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import apiClient from "../../api/apiClient.js";

export default function PartnerShowComponent({ partnerId }) {
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    apiClient
      .get(`/partners/${partnerId}`)
      .then(({ data }) => {
        if (active) {
          setPartner(data);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Hiba a partner betöltésekor:", err);
          const status = err.response?.status;
          if (status === 404) {
            setError("A partner nem található.");
          } else {
            setError("A partner adatai nem tölthetők be.");
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
  }, [partnerId]);

  if (loading) {
    return (
      <div
        className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white p-8"
        role="status"
        aria-label="Partner adatainak betöltése"
      >
        <div className="flex flex-col items-center gap-3">
          <i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" />
          <span className="text-xs text-[#71807c]">Partner adatainak betöltése…</span>
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
          A keresett partner nem található vagy törölve lett. Térj vissza a partnerek listájához.
        </p>
        <Link
          to="/partner"
          className="mt-5 inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#344247] shadow-xs hover:bg-[#f8f9f9]"
        >
          <i className="pi pi-arrow-left text-xs" aria-hidden="true" />
          Vissza a partnerekhez
        </Link>
      </div>
    );
  }

  if (!partner) return null;

  const initials = partner.name
    ? partner.name
        .split(" ")
        .slice(0, 2)
        .map((word) => word[0])
        .join("")
        .toUpperCase()
    : "PA";

  const typeLabel = partner.type === "COMPANY" ? "Cég" : "Magánszemély";

  return (
    <div className="space-y-5">
      {/* Összegző kártya */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
        <div className="flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-[#f1f4f3] text-base font-bold text-[#465458]">
            {initials}
          </span>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold tracking-tight text-[#253238]">{partner.name}</h2>
              <span className="inline-flex items-center rounded-md bg-[#eff6ee] px-2 py-0.5 text-xs font-medium text-[#3c7547]">
                {typeLabel}
              </span>
            </div>
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
              <dt className="text-[#71807c]">Partner neve</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{partner.name || "—"}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Típus</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{typeLabel}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Adószám</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{partner.taxNumber || "—"}</dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Cím / Székhely</dt>
              <dd className="font-medium text-[#253238] sm:col-span-2">{partner.address || "—"}</dd>
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
                {partner.email ? (
                  <a
                    href={`mailto:${partner.email}`}
                    className="text-[#1f3035] underline hover:text-[#445156]"
                  >
                    {partner.email}
                  </a>
                ) : (
                  <span className="text-[#253238]">—</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Telefonszám</dt>
              <dd className="font-medium sm:col-span-2">
                {partner.phone ? (
                  <a
                    href={`tel:${partner.phone}`}
                    className="text-[#1f3035] hover:underline hover:text-[#445156]"
                  >
                    {partner.phone}
                  </a>
                ) : (
                  <span className="text-[#253238]">—</span>
                )}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-3">
              <dt className="text-[#71807c]">Weboldal</dt>
              <dd className="font-medium sm:col-span-2">
                {partner.website ? (
                  <a
                    href={
                      partner.website.startsWith("http")
                        ? partner.website
                        : `https://${partner.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#1f3035] underline hover:text-[#445156]"
                  >
                    {partner.website}
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
            {partner.note ? (
              <p className="whitespace-pre-wrap leading-relaxed">{partner.note}</p>
            ) : (
              <span className="text-[#71807c]">—</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
