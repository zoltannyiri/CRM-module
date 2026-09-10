import { useEffect, useMemo, useState } from "react";
import apiClient from "../api/apiClient.js";
import Topbar from "../components/Topbar.jsx";
import { useAuth } from "../hooks/useAuth.js";
import { useToast } from "../hooks/useToast.js";

const groups = [
  { title: "Partnerek", module: "PARTNERS", permissions: [["PARTNERS_VIEW", "Megtekintés"], ["PARTNERS_CREATE", "Létrehozás"], ["PARTNERS_EDIT", "Módosítás"], ["PARTNERS_DELETE", "Törlés"]] },
  { title: "Projektek", module: "PROJECTS", permissions: [["PROJECTS_VIEW", "Megtekintés"], ["PROJECTS_CREATE", "Létrehozás"], ["PROJECTS_EDIT", "Módosítás"], ["PROJECTS_DELETE", "Törlés"]] },
  { title: "Feladatok", module: "TASKS", permissions: [["TASKS_VIEW", "Megtekintés"], ["TASKS_CREATE", "Létrehozás"], ["TASKS_EDIT", "Módosítás"], ["TASKS_DELETE", "Törlés"], ["TASKS_ASSIGN", "Felelős hozzárendelése"]] },
  { title: "Ajánlatok", module: "OFFERS", permissions: [["OFFERS_VIEW", "Megtekintés"], ["OFFERS_CREATE", "Létrehozás"], ["OFFERS_EDIT", "Módosítás"], ["OFFERS_DELETE", "Törlés"]] },
  { title: "Tevékenységek", permissions: [["ACTIVITY_VIEW", "Megtekintés"]] },
];

function canManageMember(member, role, actorMemberId) {
  return role === "OWNER" ? member.role !== "OWNER" : role === "ADMIN" && member.role === "USER" && member.id !== actorMemberId;
}

export default function SettingsPermissionsPage() {
  const { user, permissions: ownPermissions, hasModule } = useAuth();
  const { showSuccess } = useToast();
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const role = user?.role;
  const actorMemberId = user?.organizationMemberId;
  const manageable = useMemo(() => members.filter((member) => canManageMember(member, role, actorMemberId)), [members, role, actorMemberId]);
  const selected = members.find(({ id }) => id === selectedId);

  useEffect(() => {
    if (role !== "OWNER" && role !== "ADMIN") return undefined;
    apiClient.get("/members").then(({ data }) => {
      setMembers(data);
      const firstId = data.find((member) => canManageMember(member, role, actorMemberId))?.id || null;
      setSelectedId(firstId);
      if (!firstId) setLoading(false);
    }).catch((requestError) => { setError(requestError.message || "A tagok betöltése sikertelen."); setLoading(false); });
  }, [role, actorMemberId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    apiClient.get(`/members/${selectedId}/permissions`).then(({ data }) => {
      setDraft(data.permissions || []);
      setError("");
    }).catch((requestError) => setError(requestError.message || "A jogosultságok betöltése sikertelen.")).finally(() => setLoading(false));
  }, [selectedId]);

  if (role !== "OWNER" && role !== "ADMIN") return <div className="grid min-h-dvh place-items-center p-8"><div className="rounded-xl border border-[#dbe1df] bg-white p-8 text-center"><h1 className="text-lg font-semibold">Hozzáférés megtagadva</h1><p className="mt-2 text-sm text-[#71807c]">A jogosultságokat csak tulajdonos vagy adminisztrátor kezelheti.</p></div></div>;

  const toggle = (key) => setDraft((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const save = async () => {
    if (!selectedId) return;
    setSaving(true); setError("");
    try {
      const { data } = await apiClient.patch(`/members/${selectedId}/permissions`, { permissions: draft });
      setDraft(data.permissions || []);
      showSuccess("A felhasználó jogosultságai sikeresen frissültek.");
    } catch (requestError) { setError(requestError.message || "A jogosultságok mentése sikertelen."); }
    finally { setSaving(false); }
  };

  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar />
    <div className="mx-auto max-w-6xl p-5 lg:p-7">
      <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Beállítások</p>
      <div className="mt-1 mb-6 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-xl font-semibold">Tagi jogosultságok</h1><p className="mt-1 text-sm text-[#71807c]">A szervezeti tagok hozzáférése modulonként és műveletenként kezelhető.</p></div><button type="button" onClick={save} disabled={!selected || saving || loading} className="h-10 rounded-md bg-[#263b40] px-5 text-xs font-semibold text-white disabled:opacity-50">{saving ? "Mentés…" : "Jogosultságok mentése"}</button></div>
      {error && <p role="alert" className="mb-4 rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <section className="rounded-xl border border-[#dbe1df] bg-white p-3"><h2 className="px-2 pb-3 text-xs font-semibold">Kezelhető tagok</h2>{manageable.length === 0 ? <p className="px-2 py-6 text-xs text-[#7b8885]">Nincs kezelhető szervezeti tag.</p> : manageable.map((member) => <button key={member.id} type="button" onClick={() => { setLoading(true); setSelectedId(member.id); }} className={`mb-1 w-full rounded-lg px-3 py-3 text-left ${selectedId === member.id ? "bg-[#eff6ee]" : "hover:bg-[#f5f7f6]"}`}><span className="block text-sm font-semibold">{member.user.firstName} {member.user.lastName}</span><span className="mt-1 block text-[11px] text-[#7b8885]">{member.user.email} · {member.role}</span></button>)}</section>
        <section className="rounded-xl border border-[#dbe1df] bg-white p-5">{!selected ? <p className="py-16 text-center text-sm text-[#7b8885]">Válassz egy tagot.</p> : loading ? <div className="grid min-h-64 place-items-center"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div> : <div className="grid gap-4 sm:grid-cols-2">{groups.map((group) => { const enabled = !group.module || hasModule(group.module); return <fieldset key={group.title} disabled={!enabled} className={`rounded-lg border p-4 ${enabled ? "border-[#dfe5e3]" : "border-[#e5e8e7] bg-[#f6f7f7] opacity-55"}`}><legend className="px-1 text-sm font-semibold">{group.title}</legend>{!enabled && <p className="mb-2 text-[11px] text-[#7b8885]">A modul nincs bekapcsolva.</p>}<div className="grid gap-2">{group.permissions.map(([key, label]) => { const grantable = role === "OWNER" || ownPermissions.includes(key); const checked = draft.includes(key); return <label key={key} className={`flex items-center gap-3 rounded-md px-2 py-2 text-xs ${(grantable || checked) && enabled ? "cursor-pointer hover:bg-[#f5f8f5]" : "opacity-55"}`}><input type="checkbox" checked={checked} onChange={() => toggle(key)} disabled={!enabled || (!grantable && !checked)} className="size-4 accent-[#6fa675]" />{label}</label>; })}</div></fieldset>; })}</div>}</section>
      </div>
    </div>
  </div>;
}
