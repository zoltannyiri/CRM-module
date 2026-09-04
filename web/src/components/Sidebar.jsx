import { useState } from "react";
import { useAuth } from "../hooks/useAuth.js";

const icons = {
  dashboard: <><path d="M10 3a9 9 0 1 0 11 11H10Z" /><path d="M14 2v8h8a9 9 0 0 0-8-8Z" /></>,
  pipeline: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M9 9v11M15 9v11" /></>,
  contacts: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v3" /></>,
  products: <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
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
  { id: "dashboard", label: "Áttekintés" },
  { id: "pipeline", label: "Értékesítés", children: ["Folyamatok", "Lehetőségek"] },
  { id: "contacts", label: "Partnerek", children: ["Összes partner", "Kapcsolattartók"] },
  { id: "products", label: "Termékek", children: ["Összes termék", "Kategóriák"] },
  { id: "messages", label: "Üzenetek" },
  { id: "activities", label: "Tevékenységek", children: ["Feladatok", "Naptár"] },
  { id: "settings", label: "Beállítások" },
  { id: "help", label: "Súgó és támogatás" },
];

export default function Sidebar() {
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(() => window.matchMedia("(max-width: 640px)").matches);
  const [activeItem, setActiveItem] = useState("dashboard");
  const [expandedGroup, setExpandedGroup] = useState(null);

  function selectItem(item) {
    if (item.children) {
      setCollapsed(false);
      setExpandedGroup((current) => current === item.id ? null : item.id);
    } else {
      setActiveItem(item.id);
    }
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
          {navigation.map((item) => {
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
                      const id = `${item.id}-${index}`;
                      return <li key={id}><button type="button" className={`w-full cursor-pointer rounded-[5px] border-0 px-2.5 py-[9px] text-left text-xs ${activeItem === id ? "bg-[#eff6ee] font-semibold text-[#3c7547]" : "bg-transparent text-[#77817e] hover:bg-[#f7f8f8] hover:text-[#202e33]"}`} aria-pressed={activeItem === id} onClick={() => setActiveItem(id)}>{label}</button></li>;
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
