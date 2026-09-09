import { useAuth } from "../hooks/useAuth.js";

export default function ModuleRoute({ module, children }) {
  const { hasModule, loading } = useAuth();

  if (loading) {
    return <div className="grid min-h-[60vh] place-items-center text-sm text-[#687579]">Modulok betöltése…</div>;
  }

  if (!hasModule(module)) {
    return (
      <div className="grid min-h-[calc(100dvh-1px)] place-items-center bg-[#f3f5f6] p-6">
        <div className="w-full max-w-lg rounded-xl border border-[#dbe1df] bg-white p-8 text-center shadow-[0_1px_2px_rgba(24,39,43,0.02)]">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-[#f3f5f5] text-[#6f7b7e]">
            <i className="pi pi-lock text-lg" aria-hidden="true" />
          </span>
          <h1 className="text-base font-semibold text-[#253238]">A modul nem érhető el</h1>
          <p className="mt-2 text-sm text-[#71807c]">Ez a modul nincs engedélyezve a szervezet számára.</p>
        </div>
      </div>
    );
  }

  return children;
}
