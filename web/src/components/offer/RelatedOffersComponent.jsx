import { useState } from "react";
import { useNavigate } from "react-router-dom";

import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import OfferFormComponent from "./OfferFormComponent.jsx";
import OfferListComponent from "./OfferListComponent.jsx";

export default function RelatedOffersComponent({ partnerId, projectId }) {
  const navigate = useNavigate();
  const { hasModule, hasPermission } = useAuth();
  const { showError } = useToast();
  const canUsePartners = hasModule("PARTNERS") && hasPermission("PARTNERS_VIEW");
  const canCreate = hasPermission("OFFERS_CREATE") && canUsePartners;
  const [formOpen, setFormOpen] = useState(false);
  const [activeOffer, setActiveOffer] = useState(null);
  const [formMode, setFormMode] = useState("create");
  const [reloadKey, setReloadKey] = useState(0);

  const openCreate = () => { setActiveOffer(null); setFormMode("create"); setFormOpen(true); };
  const openEdit = async (offer) => {
    try {
      const { data } = await apiClient.get(`/offers/${offer.id}`, { skipGlobalErrorToast: true });
      setActiveOffer(data); setFormMode("edit"); setFormOpen(true);
    } catch (error) { showError(error.response?.data?.message || "Az ajánlat nem tölthető be."); }
  };
  const onSaved = () => { setFormOpen(false); setReloadKey((value) => value + 1); };

  return <section aria-labelledby="related-offers-title">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 id="related-offers-title" className="text-base font-semibold text-[#29383d]">Ajánlatok</h2><p className="mt-1 text-xs text-[#71807c]">A kapcsolódó ajánlatok listája.</p></div>{canCreate && <button type="button" onClick={openCreate} className="inline-flex h-9 items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold text-white shadow-sm hover:bg-[#68aa6e]"><i className="pi pi-plus text-[10px]" aria-hidden="true" />Új ajánlat</button>}</div>
    <OfferListComponent partnerId={partnerId} projectId={projectId} reloadKey={reloadKey} showTitle={false} onView={(offer) => navigate(`/offer/${offer.id}`)} onEdit={openEdit} canView={hasPermission("OFFERS_VIEW")} canEdit={hasPermission("OFFERS_EDIT")} canDelete={hasPermission("OFFERS_DELETE")} />
    {formOpen && <OfferFormComponent mode={formMode} offer={activeOffer} defaultPartnerId={partnerId} defaultProjectId={projectId} onClose={() => setFormOpen(false)} onSaved={onSaved} />}
  </section>;
}
