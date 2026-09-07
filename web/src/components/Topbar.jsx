import { useAuth } from "../hooks/useAuth.js";

const iconPaths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  message: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
};

function Icon({ name, className = "size-4" }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>;
}

export default function Topbar({ searchValue = "", onSearchChange, onCreate }) {
  const { user } = useAuth();
  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` : "NC";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-[#e5e9e8] bg-white px-5 py-3 lg:px-7">
      <div className="flex min-w-0 flex-1 items-center sm:max-w-[470px]">
        <label className="sr-only" htmlFor="topbar-search-scope">Keresési terület</label>
        <select id="topbar-search-scope" className="h-9 w-[76px] cursor-pointer rounded-l-md border border-r-0 border-[#d6dddc] bg-white px-3 text-xs text-[#344247] outline-none">
          <option>Mind</option>
        </select>
        <div className="relative min-w-0 flex-1">
          <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#839093]" />
          <input value={searchValue} onChange={(event) => onSearchChange?.(event.target.value)} placeholder="Keresés (⌘ K)" aria-label="Keresés" className="h-9 w-full rounded-r-md border border-[#d6dddc] bg-white pr-3 pl-9 text-xs outline-none placeholder:text-[#8d9799] focus:border-[#78ad7d] focus:ring-2 focus:ring-[#78ad7d]/15" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <button type="button" onClick={onCreate} className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-[#6dab72] bg-[#78b97d] px-4 text-xs font-semibold whitespace-nowrap text-white shadow-sm hover:bg-[#68aa6e] max-[700px]:hidden"><Icon name="plus" />Új rekord</button>
        <button type="button" aria-label="Értesítések" className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-[#f5f7f7] text-[#607074] hover:bg-[#edf1f0]"><Icon name="bell" /></button>
        <button type="button" aria-label="Üzenetek" className="grid size-9 cursor-pointer place-items-center rounded-full border-0 bg-[#f5f7f7] text-[#607074] hover:bg-[#edf1f0]"><Icon name="message" /></button>
        <button type="button" aria-label="Felhasználói profil" className="grid size-9 cursor-pointer place-items-center rounded-full border-2 border-[#70b8b2] bg-[#e9f2ed] text-[11px] font-bold text-[#3e6964]">{initials}</button>
      </div>
    </header>
  );
}
