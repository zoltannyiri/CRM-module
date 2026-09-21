import { useEffect, useMemo, useState } from "react";
import {
  buildFieldListForColumns,
  canonicalFiltersToPanelValues,
  fieldKey,
  getFieldType,
  panelValuesToCanonicalFilters,
} from "./filterRegistry.js";

const controlClass =
  "h-9 w-full rounded-md border border-[#d6dddc] bg-white px-3 text-xs text-[#253238] outline-none transition placeholder:text-[#9ea9a7] hover:border-[#b8c3c1] focus:border-[#78ad7d] focus:ring-1 focus:ring-[#78ad7d]/20";

function memberLabel(member) {
  if (!member?.user) return `Felelős #${member?.id || ""}`;
  return (
    [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") ||
    member.user.email ||
    `Felelős #${member.id}`
  );
}

export default function FilterPanel({
  isOpen,
  entityType,
  columns = [],
  availableColumns = [],
  members = [],
  activeFilters = [],
  onApply,
  onClose,
}) {
  const fieldList = useMemo(
    () => buildFieldListForColumns(entityType, columns, availableColumns),
    [entityType, columns, availableColumns],
  );

  const activeFiltersKey = JSON.stringify(activeFilters);
  const [prevFiltersKey, setPrevFiltersKey] = useState(activeFiltersKey);
  const [panelValues, setPanelValues] = useState(() =>
    canonicalFiltersToPanelValues(activeFilters, fieldList),
  );

  if (prevFiltersKey !== activeFiltersKey) {
    setPrevFiltersKey(activeFiltersKey);
    setPanelValues(canonicalFiltersToPanelValues(activeFilters, fieldList));
  }

  if (!isOpen) return null;

  const updateField = (key, value) => {
    setPanelValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleApply = () => {
    const canonical = panelValuesToCanonicalFilters(panelValues, fieldList);
    onApply(canonical);
  };

  const handleClearAll = () => {
    setPanelValues({});
    onApply([]);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleApply();
    }
  };

  const hasAnyValue = Object.values(panelValues).some((val) => {
    if (val === undefined || val === null || val === "") return false;
    if (typeof val === "object") {
      return Object.values(val).some((subVal) => subVal !== undefined && subVal !== null && subVal !== "");
    }
    return true;
  });

  return (
    <div
      className="mb-5 rounded-xl border border-[#dbe1df] bg-white p-5 shadow-[0_1px_2px_rgba(24,39,43,0.02)] transition-all"
      role="region"
      aria-label="Szűrő menü"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#edf1f0] pb-3">
        <div className="flex items-center gap-2">
          <i className="pi pi-filter text-xs text-[#78ad7d]" aria-hidden="true" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#29383d]">
            Szűrés mezők szerint
          </h3>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Szűrőpanel bezárása"
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md border border-transparent text-[#6e7b7f] hover:border-[#d6dddc] hover:bg-[#f5f7f6] hover:text-[#253238]"
          >
            <i className="pi pi-times text-xs" aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" onKeyDown={handleKeyDown}>
        {fieldList.map((field) => {
          const key = fieldKey(field);
          const type = getFieldType(field);
          const currentValue = panelValues[key];

          return (
            <div key={key} className="flex flex-col">
              <label
                htmlFor={`filter-${key}`}
                className="mb-1 text-[11px] font-medium text-[#506064]"
              >
                {field.label}
              </label>

              {type === "SELECT" ? (
                <select
                  id={`filter-${key}`}
                  value={currentValue || ""}
                  onChange={(e) => updateField(key, e.target.value)}
                  className={controlClass}
                >
                  <option value="">Összes</option>
                  {(field.options || []).map((opt) => {
                    const optVal = typeof opt === "object" ? opt.value : opt;
                    const optLabel = typeof opt === "object" ? opt.label : opt;
                    return (
                      <option key={optVal} value={optVal}>
                        {optLabel}
                      </option>
                    );
                  })}
                </select>
              ) : type === "MEMBER" ? (
                <select
                  id={`filter-${key}`}
                  value={currentValue || ""}
                  onChange={(e) => updateField(key, e.target.value)}
                  className={controlClass}
                >
                  <option value="">Összes felelős</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
              ) : type === "BOOLEAN" ? (
                <select
                  id={`filter-${key}`}
                  value={currentValue ?? ""}
                  onChange={(e) => updateField(key, e.target.value)}
                  className={controlClass}
                >
                  <option value="">Összes</option>
                  <option value="true">Igen</option>
                  <option value="false">Nem</option>
                </select>
              ) : type === "NUMBER" || type === "MONEY" ? (
                <div className="flex items-center gap-1.5">
                  <input
                    id={`filter-${key}-min`}
                    type="number"
                    value={currentValue?.min ?? ""}
                    onChange={(e) =>
                      updateField(key, {
                        ...(typeof currentValue === "object" ? currentValue : {}),
                        min: e.target.value,
                      })
                    }
                    placeholder="Min"
                    className={`${controlClass} w-1/2`}
                  />
                  <span className="text-xs text-[#8a9693]">-</span>
                  <input
                    id={`filter-${key}-max`}
                    type="number"
                    value={currentValue?.max ?? ""}
                    onChange={(e) =>
                      updateField(key, {
                        ...(typeof currentValue === "object" ? currentValue : {}),
                        max: e.target.value,
                      })
                    }
                    placeholder="Max"
                    className={`${controlClass} w-1/2`}
                  />
                </div>
              ) : type === "DATE" || type === "DATETIME" ? (
                <div className="flex items-center gap-1.5">
                  <input
                    id={`filter-${key}-from`}
                    type="date"
                    value={currentValue?.from ?? ""}
                    onChange={(e) =>
                      updateField(key, {
                        ...(typeof currentValue === "object" ? currentValue : {}),
                        from: e.target.value,
                      })
                    }
                    title="Kezdő dátum"
                    className={`${controlClass} w-1/2`}
                  />
                  <span className="text-xs text-[#8a9693]">-</span>
                  <input
                    id={`filter-${key}-to`}
                    type="date"
                    value={currentValue?.to ?? ""}
                    onChange={(e) =>
                      updateField(key, {
                        ...(typeof currentValue === "object" ? currentValue : {}),
                        to: e.target.value,
                      })
                    }
                    title="Záró dátum"
                    className={`${controlClass} w-1/2`}
                  />
                </div>
              ) : (
                <input
                  id={`filter-${key}`}
                  type="text"
                  value={currentValue || ""}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={`Keresés: ${field.label}...`}
                  className={controlClass}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf1f0] pt-4">
        <button
          type="button"
          onClick={handleClearAll}
          disabled={!hasAnyValue && activeFilters.length === 0}
          className="inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="pi pi-trash text-[11px] text-[#748084]" aria-hidden="true" />
          Szűrők törlése
        </button>

        <div className="flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-[#d6dddc] bg-white px-3 text-xs font-medium text-[#344247] shadow-[0_1px_1px_rgba(26,39,35,.025)] hover:bg-[#f8f9f9]"
            >
              Mégse
            </button>
          )}
          <button
            type="button"
            onClick={handleApply}
            className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#2c444c]"
          >
            <i className="pi pi-search text-xs" aria-hidden="true" />
            Szűrés
          </button>
        </div>
      </div>
    </div>
  );
}
