import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import apiClient from "../api/apiClient.js";
import Topbar from "../components/Topbar.jsx";
import RelatedFollowUpsComponent from "../components/followUp/RelatedFollowUpsComponent.jsx";
import FollowUpShowComponent from "../components/followUp/FollowUpShowComponent.jsx";
import FollowUpFormComponent from "../components/followUp/FollowUpFormComponent.jsx";
import { followUpPeriods, followUpStatusLabels, followUpTypeLabels } from "../components/followUp/followUpDisplay.js";
import { memberName } from "../components/lead/leadDisplay.js";
const control = "h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-3 text-xs text-[#344247] outline-none";
export default function FollowUpPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("TODAY");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState("");
  const [sort, setSort] = useState("");
  const [members, setMembers] = useState([]);
  useEffect(() => {
    if (id) return undefined;
    let active = true;
    apiClient.get("/members", { skipGlobalErrorToast: true }).then(({ data }) => { if (active) setMembers(data); }).catch(() => {});
    return () => { active = false; };
  }, [id]);
  if (id) return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar />
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e3e8e6] bg-white px-5 py-3 lg:px-7"><button type="button" onClick={() => navigate("/follow-up")} className={control}>Vissza az utánkövetésekhez</button><span className="h-4 w-px bg-[#dbe1df]" /><h1 className="text-sm font-semibold">Utánkövetés adatlap</h1></div>
    <main className="px-5 py-6 lg:px-7"><FollowUpShowComponent key={id} followUpId={id} reloadKey={reloadKey} onEdit={(followUp) => setForm({ followUp, mode: "edit" })} /></main>
    {form && String(form.followUp.id) === id && <FollowUpFormComponent key={form.followUp.id} {...form} onClose={() => setForm(null)} onSaved={() => setReloadKey((value) => value + 1)} />}
  </div>;
  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar searchValue={query} onSearchChange={setQuery} />
    <div className="border-b border-[#e3e8e6] bg-white px-5 py-4 lg:px-7"><h1 className="mb-4 text-lg font-semibold">Utánkövetések</h1><div className="flex flex-wrap gap-2">
      <select value={assignedMemberId} onChange={(event) => setAssignedMemberId(event.target.value)} className={control} aria-label="Felelős szűrő"><option value="">Minden felelős</option>{members.map((member) => <option key={member.id} value={member.id}>{memberName(member)}</option>)}</select>
      <select value={type} onChange={(event) => setType(event.target.value)} className={control} aria-label="Típus szűrő"><option value="">Minden típus</option>{Object.entries(followUpTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className={control} aria-label="Állapot szűrő"><option value="">Minden állapot</option>{Object.entries(followUpStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={sort} onChange={(event) => setSort(event.target.value)} className={control} aria-label="Rendezés"><option value="">Alapértelmezett rendezés</option><option value="dueAsc">Időpont növekvő</option><option value="dueDesc">Időpont csökkenő</option><option value="completedDesc">Teljesítés szerint</option></select>
    </div><div className="mt-4 flex flex-wrap gap-2">{Object.entries(followUpPeriods).map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} onClick={() => { setPeriod(value); setStatus(""); setSort(""); }} className={`${control} ${period === value ? "border-[#b9d5bc] bg-[#edf5ee] text-[#4d7853]" : ""}`}>{label}</button>)}</div></div>
    <main className="px-5 py-5 lg:px-7"><RelatedFollowUpsComponent showTitle={false} filters={{ query, period, type, status, assignedMemberId, sort }} /></main>
  </div>;
}
