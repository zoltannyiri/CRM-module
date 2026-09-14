import { useRef, useState } from "react";
import apiClient from "../../api/apiClient.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useToast } from "../../hooks/useToast.js";
import { followUpAccess } from "./followUpDisplay.js";
import FollowUpListComponent from "./FollowUpListComponent.jsx";
import FollowUpFormComponent from "./FollowUpFormComponent.jsx";

export default function RelatedFollowUpsComponent({ leadId, filters = {}, showTitle = true }) {
  const { hasModule, hasPermission } = useAuth();
  const access = followUpAccess(hasModule, hasPermission);
  const { showError } = useToast();
  const [form, setForm] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const openRequest = useRef(0);
  const open = async (item, mode) => {
    const request = ++openRequest.current;
    try {
      const { data } = await apiClient.get(`/follow-ups/${item.id}`, { skipGlobalErrorToast: true });
      if (request === openRequest.current) setForm({ mode, followUp: data });
    } catch (error) { if (request === openRequest.current) showError(error.response?.data?.message || "Az utánkövetés nem tölthető be."); }
  };
  if (!access.view) return null;
  return <section>
    {(showTitle || access.create) && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">{showTitle ? <h2 className="text-base font-semibold text-[#29383d]">Utánkövetések</h2> : <span />}{access.create && <button type="button" onClick={() => { openRequest.current++; setForm({ mode: "create", leadId }); }} className="h-9 cursor-pointer rounded-md bg-[#263b40] px-4 text-xs font-semibold text-white">Új utánkövetés</button>}</div>}
    <FollowUpListComponent filters={{ ...filters, ...(leadId && { leadId }) }} reloadKey={reloadKey} onView={(item) => open(item, "view")} onEdit={access.edit ? (item) => open(item, "edit") : undefined} onChanged={() => setReloadKey((value) => value + 1)} />
    {form && <FollowUpFormComponent {...form} onClose={() => { openRequest.current++; setForm(null); }} onSaved={() => setReloadKey((value) => value + 1)} />}
  </section>;
}
