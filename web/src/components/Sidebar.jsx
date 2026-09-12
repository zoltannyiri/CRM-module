import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth.js";

const icons = {
  dashboard: <><path d="M10 3a9 9 0 1 0 11 11H10Z" /><path d="M14 2v8h8a9 9 0 0 0-8-8Z" /></>,
  pipeline: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></>,
  contacts: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></>,
  products: <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  projects: <><path d="M4 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M2 12h20" /></>,
  documents: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
  leads: <><circle cx="12" cy="7" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></>,
  offers: <><path d="M4 5h16v14H4z" /><path d="M8 9h8M8 13h5" /></>,
  messages: <><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" /><path d="M7 10h.01M12 10h.01M17 10h.01" /></>,
  activities: <path d="M2 12h4l4-9 4 18 4-9h4" />,
  settings: <><path d="m9 3-1 3-3 1-2 4 2 2v3l3 2 1 3h5l1-3 3-2v-3l2-2-2-4-3-1-1-3Z" /><circle cx="11.5" cy="12" r="3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4 2l-1.5 1v1M12 17h.01" /></>,
  panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
  chevron: <path d="m8 10 4 4 4-4" />,
  workspace: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1" /></>,
};

function Icon({ name, className = "", size = "size-[19px]" }) {
  return <svg className={`${size} shrink-0 ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name]}</svg>;
}

const navigation = [
  { id: "dashboard", label: "Dashboard", route: "/dashboard" },
  { id: "pipeline", label: "Értékesítés", children: ["Folyamatok", "Lehetőségek"] },
  { id: "contacts", label: "Partnerek", module: "PARTNERS", permission: "PARTNERS_VIEW", children: ["Összes partner", "Kapcsolattartók"] },
  { id: "projects", label: "Projektek", module: "PROJECTS", permission: "PROJECTS_VIEW", route: "/project" },
  { id: "documents", label: "Dokumentumok", module: "DOCUMENTS", permission: "DOCUMENTS_VIEW", route: "/document" },
  { id: "leads", label: "Érdeklődők", module: "LEADS", permission: "LEADS_VIEW", route: "/lead" },
  { id: "offers", label: "Ajánlatok", module: "OFFERS", permission: "OFFERS_VIEW", route: "/offer" },
  { id: "products", label: "Termékek", children: ["Összes termék", "Kategóriák"] },
  { id: "messages", label: "Üzenetek" },
  { id: "activities", label: "Tevékenységek", children: ["Tevékenységek", "Feladatok", "Naptár"] },
  { id: "settings", label: "Beállítások", adminOnly: true, route: "/settings/permissions" },
  { id: "help", label: "Súgó és támogatás" },
];

const childRoutes = {
  contacts: ["/partner", "/contact"],
  activities: ["/activity", "/task"],
};

const activeItemForPath = (pathname) => {
  if (pathname.startsWith("/dashboard")) return "dashboard";
  if (pathname.startsWith("/contact")) return "contacts-1";
  if (pathname.startsWith("/partner")) return "contacts-0";
  if (pathname.startsWith("/project")) return "projects";
  if (pathname.startsWith("/document")) return "documents";
  if (pathname.startsWith("/lead")) return "leads";
  if (pathname.startsWith("/offer")) return "offers";
  if (pathname.startsWith("/activity")) return "activities-0";
  if (pathname.startsWith("/task")) return "activities-1";
  if (pathname.startsWith("/settings")) return "settings";
  return "dashboard";
};

export default function Sidebar() {
  const { user, hasModule, hasPermission } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const [activeItem, setActiveItem] = useState(() => activeItemForPath(location.pathname));
  const [expandedGroup, setExpandedGroup] = useState(() => {
    if (location.pathname.startsWith("/partner") || location.pathname.startsWith("/contact")) return "contacts";
    if (location.pathname.startsWith("/activity") || location.pathname.startsWith("/task")) return "activities";
    return null;
  });

  function selectItem(item) {
    if (item.children) {
      setCollapsed(false);
      setExpandedGroup((current) => current === item.id ? null : item.id);
    } else {
      setActiveItem(item.id);
      if (item.route) navigate(item.route);
    }
  }

  function selectChild(item, index) {
    setActiveItem(`${item.id}-${index}`);
    const route = childRoutes[item.id]?.[index];
    if (route) navigate(route);
  }

  return (
    <aside className={`group/sidebar sticky top-0 flex h-dvh max-w-[calc(100vw-40px)] shrink-0 flex-col border-r border-[#e9eced] bg-white font-['Inter','Segoe_UI',sans-serif] text-[#253238] transition-[width] duration-180 ease-[ease] motion-reduce:transition-none max-[641px]:fixed max-[641px]:z-10 [&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[#78ad7d] ${collapsed ? "w-[76px]" : "w-64 max-[641px]:shadow-[4px_0_20px_#25323808]"}`} data-collapsed={collapsed} aria-label="Oldalsáv">
      <header className="flex min-h-20 items-center justify-between gap-2.5 border-b border-[#edf0f1] pr-[18px] pl-[22px] group-data-[collapsed=true]/sidebar:flex-col group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-2 group-data-[collapsed=true]/sidebar:px-0 group-data-[collapsed=true]/sidebar:py-3.5">
        <div className="flex items-center gap-2.5 text-[17px] font-bold tracking-[-.65px] whitespace-nowrap" aria-label="Northstar CRM">
          <svg className="size-7 shrink-0 text-[#7dba7f]" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M4 3h7v11H4zM13 3c9 1 15 8 15 17h-7c0-6-3-9-8-10zM21 22h7v7h-7z" fill="currentColor" />
          </svg>
          <span className="truncate group-data-[collapsed=true]/sidebar:hidden">Saját <span className="font-semibold">CRM</span></span>
        </div>
        <button className="grid h-8 w-[30px] shrink-0 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[#839095] hover:bg-[#f1f4f3] hover:text-[#253238]" type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Oldalsáv kinyitása" : "Oldalsáv összecsukása"} title={collapsed ? "Oldalsáv kinyitása" : "Oldalsáv összecsukása"} aria-expanded={!collapsed} aria-controls="sidebar-navigation">
          <Icon name="panel" size="size-[17px]" />
        </button>
      </header>

      <nav id="sidebar-navigation" className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-[22px] [scrollbar-width:thin]" aria-label="Fő navigáció">
        <ul className="m-0 grid list-none gap-[5px] p-0">
          {navigation.filter((item) => {
            if (item.module && !hasModule(item.module)) return false;
            if (item.permission && !hasPermission(item.permission)) return false;
            if (item.adminOnly && user?.role !== "OWNER" && user?.role !== "ADMIN") return false;
            if (item.id === "activities") {
              const canViewActivity = hasPermission("ACTIVITY_VIEW");
              const canViewTasks = hasModule("TASKS") && hasPermission("TASKS_VIEW");
              if (!canViewActivity && !canViewTasks) return false;
            }
            return true;
          }).map((item) => {
            const expanded = !collapsed && expandedGroup === item.id;
            const selected = activeItem === item.id || activeItem.startsWith(`${item.id}-`);
            return (
              <li key={item.id}>
                <button type="button" className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[7px] border-0 px-[13px] text-left text-[13px] transition-colors duration-140 ease-[ease] motion-reduce:transition-none group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:px-0 ${selected ? "bg-[#f0f3f3] font-semibold text-[#202e33]" : "bg-transparent font-normal text-[#4c575b] hover:bg-[#f7f8f8] hover:text-[#202e33]"}`} onClick={() => selectItem(item)} title={collapsed ? item.label : undefined} aria-label={item.label} aria-pressed={item.children ? undefined : selected} aria-expanded={item.children ? expanded : undefined} aria-controls={item.children ? `sidebar-${item.id}` : undefined}>
                  <Icon name={item.id} className={selected ? "text-[#26363b] [&_path:first-child]:fill-current [&_path:first-child]:[fill-opacity:0.1]" : ""} />
                  <span className="truncate group-data-[collapsed=true]/sidebar:hidden">{item.label}</span>
                  {item.children && <Icon name="chevron" size="size-[15px]" className={`ml-auto text-[#97a0a3] transition-transform duration-160 ease-[ease] motion-reduce:transition-none group-data-[collapsed=true]/sidebar:hidden ${expanded ? "rotate-180" : ""}`} />}
                </button>
                {item.children && (
                  <ul id={`sidebar-${item.id}`} className="mt-[5px] mb-[7px] ml-[22px] list-none border-l border-[#e4e9e6] pl-[17px]" hidden={!expanded}>
                    {item.children.map((label, index) => {
                      if (item.id === "activities" && index === 0 && !hasPermission("ACTIVITY_VIEW")) return null;
                      if (item.id === "activities" && index === 1 && (!hasModule("TASKS") || !hasPermission("TASKS_VIEW"))) return null;
                      if (item.id === "activities" && index === 2 && !hasPermission("ACTIVITY_VIEW")) return null;
                      const id = `${item.id}-${index}`;
                      return <li key={id}><button type="button" className={`w-full cursor-pointer rounded-[5px] border-0 px-2.5 py-[9px] text-left text-xs ${activeItem === id ? "bg-[#eff6ee] font-semibold text-[#3c7547]" : "bg-transparent text-[#77817e] hover:bg-[#f7f8f8] hover:text-[#202e33]"}`} aria-pressed={activeItem === id} onClick={() => selectChild(item, index)}>{label}</button></li>;
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <footer className="px-5 pt-5 pb-6">
        <p className="mt-0 mr-0 mb-[15px] ml-[3px] truncate text-[10px] font-medium tracking-[1.1px] text-[#8d9798] uppercase group-data-[collapsed=true]/sidebar:hidden">Munkaterület</p>
        <div className="flex min-h-11 items-center gap-2.5" title={user?.organization?.name || "Saját munkaterület"}>
          <span className="grid size-9 shrink-0 place-items-center rounded-[9px] border border-[#e4ece3] bg-[#f4f8f1] text-[#76a36c]"><Icon name="workspace" /></span>
          <div className="min-w-0 flex-1 truncate group-data-[collapsed=true]/sidebar:hidden">
            <p className="m-0 mb-[3px] truncate text-xs font-semibold">{user?.organization?.name || "Saját munkaterület"}</p>
            <span className="block truncate text-[11px] text-[#8d9697]">{user ? `${user.firstName} ${user.lastName}` : "Northstar CRM"}</span>
          </div>
          <span className="size-1.5 shrink-0 rounded-full bg-[#80b985] group-data-[collapsed=true]/sidebar:hidden" aria-label="Aktív munkaterület" />
        </div>
      </footer>
    </aside>
  );
}
