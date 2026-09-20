import { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useToast } from '../../hooks/useToast.js';

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:cursor-default disabled:bg-[#f5f7f6] disabled:text-[#536166]";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

export default function CustomFieldFormComponent(props) {
  const { hasPermission } = useAuth();
  const perm = props.mode === 'edit' ? 'CUSTOM_FIELDS_EDIT' : 'CUSTOM_FIELDS_CREATE';
  if (!hasPermission(perm)) return null;
  return <CustomFieldForm {...props} />;
}

function CustomFieldForm({ mode = 'create', field, entityType = 'LEAD', onClose, onSaved }) {
  const { showSuccess } = useToast();
  const isEditing = mode === 'edit';
  
  const [formData, setFormData] = useState(() => {
    if (isEditing && field) {
      let optionsStr = '';
      if (field.options) {
        if (Array.isArray(field.options)) {
          optionsStr = field.options.join('\n');
        } else if (typeof field.options === 'string') {
          try {
            const parsed = JSON.parse(field.options);
            optionsStr = Array.isArray(parsed) ? parsed.join('\n') : field.options;
          } catch {
            optionsStr = field.options;
          }
        }
      }
      return { ...field, optionsStr };
    }
    return {
      entityType: entityType,
      key: '',
      label: '',
      fieldType: 'TEXT',
      required: false,
      active: true,
      sortOrder: 0,
      placeholder: '',
      helpText: '',
      defaultValue: '',
      optionsStr: ''
    };
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); };
  }, [onClose]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const payload = { ...formData };
      if (payload.fieldType === 'SELECT' || payload.fieldType === 'MULTI_SELECT') {
        const opts = payload.optionsStr ? payload.optionsStr.split('\n').map(s => s.trim()).filter(Boolean) : [];
        payload.options = opts;
      } else {
        payload.options = null;
      }
      delete payload.optionsStr;

      let response;
      if (isEditing) {
        response = await apiClient.patch(`/custom-fields/${field.id}`, payload);
        showSuccess('Az egyéni mező sikeresen frissítve.');
      } else {
        response = await apiClient.post('/custom-fields', payload);
        showSuccess('Az egyéni mező sikeresen létrehozva.');
      }
      onSaved(response.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Mentés sikertelen.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasOptions = formData.fieldType === 'SELECT' || formData.fieldType === 'MULTI_SELECT';

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <button type="button" onClick={onClose} className="starting:opacity-0 absolute inset-0 cursor-default border-0 bg-[#17272b]/35 backdrop-blur-[1px] transition-opacity duration-200" />
      <aside className="starting:translate-x-full absolute inset-y-0 right-0 flex w-full flex-col border-l border-[#dbe1df] bg-[#f7f8f8] shadow-[-18px_0_50px_rgba(24,39,43,.12)] transition-transform duration-200 md:w-1/2 md:min-w-[640px] md:max-w-full">
        <header className="flex items-start justify-between gap-6 border-b border-[#dfe5e3] bg-white px-7 py-6">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#84918e]">Egyéni mezők</p>
            <h2 className="text-xl font-semibold text-[#253338]">{isEditing ? "Mező szerkesztése" : "Új egyéni mező"}</h2>
            <p className="mt-1.5 text-sm text-[#71807c]">{isEditing ? "Módosítsd az egyéni mező adatait." : "Add meg az egyéni mező adatait."}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-4 text-xs font-medium text-[#4d5a5e] hover:bg-[#f4f6f5]">Bezárás</button>
        </header>
        <form id="custom-field-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-7 py-7">
          <div className="mx-auto grid max-w-3xl gap-7 border-0 p-0">
            <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
              <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Alapadatok</h3>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className={labelClass}>Entitás típusa
                  <select name="entityType" value={formData.entityType} onChange={handleChange} disabled={isEditing} className={fieldClass}>
                    <option value="LEAD">Érdeklődő (Lead)</option>
                    <option value="PARTNER">Partner</option>
                  </select>
                </label>
                <label className={labelClass}>Mező típusa
                  <select name="fieldType" value={formData.fieldType} onChange={handleChange} disabled={isEditing} className={fieldClass}>
                    <option value="TEXT">Rövid szöveg</option>
                    <option value="TEXTAREA">Hosszú szöveg</option>
                    <option value="NUMBER">Szám</option>
                    <option value="MONEY">Pénzösszeg</option>
                    <option value="BOOLEAN">Igen/Nem</option>
                    <option value="DATE">Dátum</option>
                    <option value="DATETIME">Dátum és idő</option>
                    <option value="SELECT">Legördülő lista</option>
                    <option value="MULTI_SELECT">Többválasztós lista</option>
                  </select>
                </label>
                <label className={labelClass}>Megjelenítési neve
                  <input name="label" value={formData.label} onChange={handleChange} required className={fieldClass} />
                </label>
                <label className={labelClass}>Mező kulcs
                  <input name="key" value={formData.key} onChange={handleChange} disabled={isEditing} pattern="[a-z0-9_]+" required className={`${fieldClass} font-mono`} placeholder="pl: szuletes_ideje" />
                </label>
                <label className={`${labelClass} flex-row items-center`}>
                  <input type="checkbox" name="required" checked={formData.required} onChange={handleChange} className="size-4 accent-[#6fa675]" />
                  Kötelező
                </label>
                {isEditing && (
                  <label className={`${labelClass} flex-row items-center`}>
                    <input type="checkbox" name="active" checked={formData.active} onChange={handleChange} className="size-4 accent-[#6fa675]" />
                    Aktív
                  </label>
                )}
                <label className={labelClass}>Sorrend
                  <input type="number" name="sortOrder" value={formData.sortOrder} onChange={handleChange} min="0" className={fieldClass} />
                </label>
                <label className={labelClass}>Kitöltési segítség (Placeholder)
                  <input name="placeholder" value={formData.placeholder} onChange={handleChange} className={fieldClass} />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>Súgószöveg
                  <textarea name="helpText" value={formData.helpText} onChange={handleChange} rows="2" className={`${fieldClass} h-auto resize-y py-3`} />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>Alapértelmezett érték
                  <input name="defaultValue" value={formData.defaultValue} onChange={handleChange} className={fieldClass} />
                </label>
                {hasOptions && (
                  <label className={`${labelClass} sm:col-span-2`}>Lehetséges értékek
                    <span className="text-[11px] text-[#7b8885]">Soronként egy lehetséges érték</span>
                    <textarea name="optionsStr" value={formData.optionsStr} onChange={handleChange} rows="5" className={`${fieldClass} h-auto resize-y py-3`} required />
                  </label>
                )}
              </div>
            </section>
            {error && <p className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}
          </div>
        </form>
        <footer className="flex justify-end gap-3 border-t border-[#dfe5e3] bg-white px-7 py-4">
          <button type="button" onClick={onClose} className="h-10 cursor-pointer rounded-md border border-[#d6dddc] bg-white px-5 text-xs font-medium text-[#455358] hover:bg-[#f5f7f6]">Mégse</button>
          <button type="submit" form="custom-field-form" disabled={submitting} className="h-10 cursor-pointer rounded-md border border-[#1e3338] bg-[#263b40] px-6 text-xs font-semibold text-white hover:bg-[#1c3035] disabled:cursor-wait disabled:opacity-60">{submitting ? "Mentés…" : isEditing ? "Módosítások mentése" : "Mentés"}</button>
        </footer>
      </aside>
    </div>
  );
}
