import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { formatMoney, formatOfferDate, offerStatusClasses, offerStatusLabels } from "./offerDisplay.js";

function Row({ label, children }) { return <div className="grid grid-cols-1 gap-1 sm:grid-cols-3"><dt className="text-[#71807c]">{label}</dt><dd className="font-medium text-[#253238] sm:col-span-2">{children}</dd></div>; }

export default function OfferShowComponent({ offerId, onEdit }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  const [offer, setOffer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get(`/offers/${offerId}`).then(({ data }) => { if (active) setOffer(data); }).catch((requestError) => { if (active) setError(requestError.response?.status === 404 ? "Az ajánlat nem található." : "Az ajánlat adatai nem tölthetők be."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [offerId]);

  const handleDelete = async () => {
    if (!window.confirm(`Biztosan törölni szeretnéd ezt az ajánlatot: ${offer.offerNumber}?`)) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/offers/${offer.id}`, { skipGlobalErrorToast: true });
      showSuccess("Az ajánlat sikeresen törölve.");
      navigate("/offer");
    } catch (requestError) {
      showError(requestError.response?.data?.message || "Az ajánlat törlése sikertelen.");
      setDeleting(false);
    }
  };

  if (loading) return <div className="grid min-h-[300px] place-items-center rounded-xl border border-[#dbe1df] bg-white"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-label="Ajánlat betöltése" /></div>;
  if (error) return <div className="rounded-xl border border-[#efd7d1] bg-white p-8 text-center"><h3 className="text-sm font-semibold">{error}</h3><Link to="/offer" className="mt-5 inline-flex h-9 items-center rounded-md border border-[#d6dddc] px-4 text-xs">Vissza az ajánlatokhoz</Link></div>;
  if (!offer) return null;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#dbe1df] bg-white p-6 shadow-[0_1px_2px_rgba(24,39,43,0.02)]"><div><p className="mb-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Ajánlat</p><div className="flex items-center gap-3"><h2 className="text-lg font-bold">{offer.offerNumber}</h2><span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium ${offerStatusClasses[offer.status]}`}>{offerStatusLabels[offer.status]}</span></div><p className="mt-1 text-xs text-[#71807c]">{offer.partner?.name || "Partneradat nem elérhető"}</p></div><div className="flex gap-2">{hasPermission("OFFERS_EDIT") && <button type="button" onClick={() => onEdit?.(offer)} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#d6dddc] bg-white px-3.5 text-xs font-medium"><i className="pi pi-pencil text-xs" />Módosítás</button>}{hasPermission("OFFERS_DELETE") && <button type="button" onClick={handleDelete} disabled={deleting} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#ecd5d1] bg-white px-3.5 text-xs font-medium text-[#9d3c32]"><i className={`pi ${deleting ? "pi-spinner pi-spin" : "pi-trash"} text-xs`} />Törlés</button>}</div></div>
    <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Alapadatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Ajánlatszám">{offer.offerNumber}</Row><Row label="Partner">{offer.partner ? <Link to={`/partner/${offer.partner.id}`} className="text-[#2e5d38] hover:underline">{offer.partner.name}</Link> : "—"}</Row><Row label="Projekt">{offer.project ? <Link to={`/project/${offer.project.id}`} className="text-[#2e5d38] hover:underline">{offer.project.name}</Link> : "—"}</Row><Row label="Státusz">{offerStatusLabels[offer.status]}</Row><Row label="Pénznem">{offer.currency}</Row></dl></section><section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-4 border-b border-[#f0f3f2] pb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Dátumok és rendszeradatok</h3><dl className="grid gap-3.5 text-xs"><Row label="Kiállítás">{formatOfferDate(offer.issueDate)}</Row><Row label="Érvényes eddig">{formatOfferDate(offer.validUntil)}</Row><Row label="Létrehozta">{offer.createdByMember?.user ? `${offer.createdByMember.user.firstName} ${offer.createdByMember.user.lastName}` : "—"}</Row><Row label="Létrehozva">{formatOfferDate(offer.createdAt)}</Row><Row label="Módosítva">{formatOfferDate(offer.updatedAt)}</Row></dl></section></div>
    <section className="overflow-hidden rounded-xl border border-[#dbe1df] bg-white"><div className="border-b border-[#dbe1df] px-5 py-4"><h3 className="text-sm font-semibold">Tételsorok</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] border-collapse text-xs"><thead className="bg-[#fafbfb] text-left text-[11px] text-[#536166]"><tr><th className="px-4 py-3">Megnevezés</th><th className="px-4 py-3 text-right">Mennyiség</th><th className="px-4 py-3">Egység</th><th className="px-4 py-3 text-right">Egységár</th><th className="px-4 py-3 text-right">ÁFA</th><th className="px-4 py-3 text-right">Nettó</th><th className="px-4 py-3 text-right">Bruttó</th></tr></thead><tbody>{offer.items.map((item) => <tr key={item.id || item.position} className="border-t border-[#e4e9e7]"><td className="px-4 py-3.5"><strong>{item.name}</strong>{item.description && <span className="mt-1 block text-[11px] text-[#71807c]">{item.description}</span>}</td><td className="px-4 py-3.5 text-right">{Number(item.quantity).toLocaleString("hu-HU")}</td><td className="px-4 py-3.5">{item.unit}</td><td className="px-4 py-3.5 text-right">{formatMoney(item.unitPrice, offer.currency)}</td><td className="px-4 py-3.5 text-right">{Number(item.vatRate).toLocaleString("hu-HU")}%</td><td className="px-4 py-3.5 text-right">{formatMoney(item.netAmount, offer.currency)}</td><td className="px-4 py-3.5 text-right font-semibold">{formatMoney(item.grossAmount, offer.currency)}</td></tr>)}</tbody></table></div><div className="flex justify-end border-t border-[#dbe1df] bg-[#fafbfb] p-5"><dl className="grid w-full max-w-sm gap-3 text-sm"><div className="flex justify-between"><dt>Nettó összesen</dt><dd className="font-semibold">{formatMoney(offer.totals.net, offer.currency)}</dd></div><div className="flex justify-between"><dt>ÁFA</dt><dd className="font-semibold">{formatMoney(offer.totals.vat, offer.currency)}</dd></div><div className="flex justify-between border-t border-[#dbe1df] pt-3 text-base"><dt>Bruttó összesen</dt><dd className="font-bold">{formatMoney(offer.totals.gross, offer.currency)}</dd></div></dl></div></section>
    {offer.note && <section className="rounded-xl border border-[#dbe1df] bg-white p-6"><h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#8a9695]">Megjegyzés</h3><p className="whitespace-pre-wrap text-xs leading-relaxed text-[#344247]">{offer.note}</p></section>}
  </div>;
}
