import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "../api/apiClient.js";
import Topbar from "../components/Topbar.jsx";

const statusLabels = { TODO: "Teendő", IN_PROGRESS: "Folyamatban", BLOCKED: "Blokkolt", ACTIVE: "Aktív", PLANNED: "Tervezett", ON_HOLD: "Szüneteltetve" };
const statusClasses = { TODO: "bg-[#f3f5f5] text-[#5f6c70]", IN_PROGRESS: "bg-[#edf4fa] text-[#3d6b8e]", BLOCKED: "bg-[#faf1ef] text-[#8a5b51]", ACTIVE: "bg-[#eff7ef] text-[#4d7853]", PLANNED: "bg-[#f3f5f5] text-[#5f6c70]", ON_HOLD: "bg-[#faf6ec] text-[#816d40]" };

function formatDate(value, relative = false) {
  if (!value) return "Nincs határidő";
  const date = new Date(value);
  if (relative) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const target = new Date(date); target.setHours(0, 0, 0, 0);
    const days = Math.round((target - today) / 86400000);
    if (days === 0) return "Ma";
    if (days === 1) return "Holnap";
  }
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function Card({ title, children, className = "" }) {
  return <section className={`rounded-xl border border-[#dbe1df] bg-white ${className}`}><header className="border-b border-[#e6eae9] px-5 py-4"><h2 className="text-sm font-semibold text-[#29383d]">{title}</h2></header>{children}</section>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    apiClient.get("/dashboard").then(({ data }) => { if (active) { setDashboard(data); setError(false); } }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (loading) return <div className="min-h-dvh bg-[#f3f5f6]"><Topbar /><main className="p-5 lg:p-7"><div className="mb-5 h-12 w-60 animate-pulse rounded-md bg-[#e7ebea]" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-xl border border-[#dfe4e3] bg-white" />)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="h-72 animate-pulse rounded-xl border border-[#dfe4e3] bg-white" /><div className="h-72 animate-pulse rounded-xl border border-[#dfe4e3] bg-white" /></div></main></div>;

  return <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
    <Topbar />
    <main className="p-5 lg:p-7">
      <div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Áttekintés</p><h1 className="mt-1 text-xl font-semibold">Dashboard</h1><p className="mt-1 text-sm text-[#71807c]">A vállalati működés aktuális összefoglalója.</p></div>
      {error ? <div className="rounded-xl border border-[#dbe1df] bg-white px-6 py-16 text-center text-sm text-[#657276]">A dashboard adatai nem tölthetők be.</div> : <>
        {dashboard.stats.length > 0 && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Fő mutatók">{dashboard.stats.map((stat) => <button key={stat.key} type="button" onClick={() => navigate(stat.route)} className="rounded-xl border border-[#dbe1df] bg-white p-5 text-left transition hover:border-[#bfcac7] hover:shadow-[0_3px_12px_rgba(24,39,43,.04)]"><span className="text-xs font-medium text-[#71807c]">{stat.label}</span><strong className="mt-3 block text-2xl font-semibold text-[#263338]">{stat.value.toLocaleString("hu-HU")}</strong></button>)}</section>}
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {dashboard.myTasks && <Card title="Saját feladataim"><div className="divide-y divide-[#e8eceb]">{dashboard.myTasks.length === 0 ? <p className="px-5 py-12 text-center text-xs text-[#7b8885]">Nincs nyitott saját feladata.</p> : dashboard.myTasks.map((task) => <button key={task.id} type="button" onClick={() => navigate("/task")} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-[#fafcfc]"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#2c393e]">{task.title}</span><span className="mt-1 block truncate text-[11px] text-[#84908e]">{task.project?.name || "Nincs projekthez rendelve"}</span></span><span className="shrink-0 text-right"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-medium ${statusClasses[task.status] || "bg-[#f3f5f5]"}`}>{statusLabels[task.status] || task.status}</span><span className="mt-1 block text-[11px] text-[#71807c]">{formatDate(task.dueDate, true)}</span></span></button>)}</div></Card>}
          {dashboard.upcomingDeadlines && <Card title="Közelgő határidők"><div className="divide-y divide-[#e8eceb]">{dashboard.upcomingDeadlines.length === 0 ? <p className="px-5 py-12 text-center text-xs text-[#7b8885]">Nincs közelgő határidő.</p> : dashboard.upcomingDeadlines.map((item) => <button key={`${item.type}-${item.id}`} type="button" onClick={() => navigate(item.route)} className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left hover:bg-[#fafcfc]"><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#2c393e]">{item.title}</span><span className="mt-1 block text-[10px] font-medium uppercase tracking-wide text-[#8a9693]">{item.type === "PROJECT" ? "Projekt" : "Feladat"}</span></span><span className="shrink-0 text-xs font-medium text-[#536166]">{formatDate(item.date, true)}</span></button>)}</div></Card>}
        </div>
        {dashboard.recentActivities && <Card title="Legutóbbi tevékenységek" className="mt-5"><div className="divide-y divide-[#e8eceb]">{dashboard.recentActivities.length === 0 ? <p className="px-5 py-12 text-center text-xs text-[#7b8885]">Nincs megjeleníthető tevékenység.</p> : dashboard.recentActivities.map((activity) => <div key={activity.id} className="grid gap-2 px-5 py-3.5 text-xs sm:grid-cols-[70px_150px_1fr]"><time className="text-[#84908e]">{new Intl.DateTimeFormat("hu-HU", { hour: "2-digit", minute: "2-digit" }).format(new Date(activity.createdAt))}</time><span className="font-medium text-[#536166]">{activity.actorMember?.user ? `${activity.actorMember.user.firstName} ${activity.actorMember.user.lastName}` : "Rendszer"}</span><span><strong className="font-semibold text-[#2c393e]">{activity.title}</strong>{activity.description && <span className="mt-1 block text-[11px] text-[#84908e]">{activity.description}</span>}</span></div>)}</div></Card>}
      </>}
    </main>
  </div>;
}
