import { useEffect, useRef, useState } from 'react';
import apiClient from '../../api/apiClient.js';

const fieldClass = "h-11 w-full rounded-md border border-[#d7dedc] bg-white px-3.5 text-sm text-[#263338] outline-none transition placeholder:text-[#a1abaa] focus:border-[#79a97e] focus:ring-2 focus:ring-[#79a97e]/15 disabled:cursor-default disabled:bg-[#f5f7f6] disabled:text-[#536166]";
const labelClass = "grid gap-2 text-xs font-medium text-[#536166]";

export default function CustomFieldValuesSection({ entityType, entityId, onChange, initialValues }) {
  const [fields, setFields] = useState([]);
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let active = true;

    const fetchUrl = entityId 
      ? `/custom-fields/values?entityType=${entityType}&entityId=${entityId}`
      : `/custom-fields?entityType=${entityType}&activeOnly=true`;

    apiClient.get(fetchUrl)
      .then(({ data }) => {
        if (active) {
          if (entityId) {
            setFields(data.fields || []);
            const loadedValues = data.values || {};
            if (initialValues) {
              initialValues.forEach(v => {
                loadedValues[v.customFieldId] = v.value;
              });
            }
            setValues(loadedValues);
          } else {
            const activeFields = Array.isArray(data) ? data.filter(f => f.active !== false) : [];
            setFields(activeFields);
            const initVals = {};
            if (initialValues) {
              initialValues.forEach(v => {
                initVals[v.customFieldId] = v.value;
              });
            }
            setValues(initVals);
          }
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError('Egyéni mezők betöltése sikertelen.');
          setLoading(false);
        }
      });

    return () => { active = false; };
  }, [entityType, entityId, initialValues]);

  useEffect(() => {
    if (!loading && !error) {
      const output = Object.entries(values).map(([id, val]) => ({
        customFieldId: Number(id),
        value: val || null
      }));
      onChangeRef.current?.(output);
    }
  }, [values, loading, error]);

  const handleChange = (fieldId, val) => {
    setValues(prev => ({ ...prev, [fieldId]: val }));
  };

  const handleMultiSelectChange = (fieldId, option, checked) => {
    setValues(prev => {
      const currentVal = prev[fieldId];
      let currentArr = [];
      if (currentVal) {
        try {
          currentArr = JSON.parse(currentVal);
        } catch {
          currentArr = [];
        }
      }
      if (checked) {
        currentArr.push(option);
      } else {
        currentArr = currentArr.filter(o => o !== option);
      }
      return { ...prev, [fieldId]: currentArr.length > 0 ? JSON.stringify(currentArr) : null };
    });
  };

  if (loading) {
    return (
      <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
        <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Egyéni mezők</h3>
        <div className="flex justify-center"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" aria-hidden="true" /></div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
        <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Egyéni mezők</h3>
        <p className="rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>
      </section>
    );
  }

  if (fields.length === 0) return null;

  return (
    <section className="rounded-lg border border-[#dfe5e3] bg-white p-6">
      <h3 className="mb-5 text-sm font-semibold text-[#2b393e]">Egyéni mezők</h3>
      <div className="grid gap-5 sm:grid-cols-2">
        {fields.map(field => {
          const val = values[field.id] || '';
          const isTextarea = field.fieldType === 'TEXTAREA';
          const isBoolean = field.fieldType === 'BOOLEAN';
          const isMulti = field.fieldType === 'MULTI_SELECT';
          const spanClass = isTextarea || isMulti ? 'sm:col-span-2' : 'sm:col-span-1';

          let inputEl = null;

          if (field.fieldType === 'TEXT') {
            inputEl = <input type="text" className={fieldClass} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required} placeholder={field.placeholder} />;
          } else if (field.fieldType === 'TEXTAREA') {
            inputEl = <textarea rows={3} className={fieldClass + ' h-auto resize-y py-3'} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required} placeholder={field.placeholder} />;
          } else if (field.fieldType === 'NUMBER' || field.fieldType === 'MONEY') {
            inputEl = <input type="number" className={fieldClass} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required} placeholder={field.placeholder} />;
          } else if (field.fieldType === 'DATE') {
            inputEl = <input type="date" className={fieldClass} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required} />;
          } else if (field.fieldType === 'DATETIME') {
            inputEl = <input type="datetime-local" className={fieldClass} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required} />;
          } else if (field.fieldType === 'SELECT') {
            let options = [];
            if (Array.isArray(field.options)) {
              options = field.options;
            } else if (typeof field.options === 'string') {
              try {
                options = JSON.parse(field.options);
              } catch {
                options = [];
              }
            }
            if (!Array.isArray(options)) options = [];
            inputEl = (
              <select className={fieldClass} value={val} onChange={e => handleChange(field.id, e.target.value)} required={field.required}>
                <option value="">Válassz...</option>
                {options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            );
          } else if (isMulti) {
            let options = [];
            if (Array.isArray(field.options)) {
              options = field.options;
            } else if (typeof field.options === 'string') {
              try {
                options = JSON.parse(field.options);
              } catch {
                options = [];
              }
            }
            if (!Array.isArray(options)) options = [];
            
            let selectedArr = [];
            if (val) {
              try {
                selectedArr = JSON.parse(val);
              } catch {
                selectedArr = [];
              }
            }
            
            inputEl = (
              <div className="grid gap-2">
                {options.map(o => (
                  <label key={o} className="flex items-center gap-2 text-sm text-[#263338]">
                    <input type="checkbox" className="size-4 accent-[#6fa675]" checked={selectedArr.includes(o)} onChange={e => handleMultiSelectChange(field.id, o, e.target.checked)} />
                    {o}
                  </label>
                ))}
              </div>
            );
          }

          if (isBoolean) {
            if (field.required) {
              return (
                <label key={field.id} className={`${labelClass} ${spanClass}`}>
                  <span>{field.label} <span className="text-[#9a4335]">*</span></span>
                  <select
                    className={fieldClass}
                    value={val}
                    onChange={e => handleChange(field.id, e.target.value)}
                    required
                  >
                    <option value="">— Válassz —</option>
                    <option value="true">Igen</option>
                    <option value="false">Nem</option>
                  </select>
                  {field.helpText && <p className="text-[11px] text-[#7b8885]">{field.helpText}</p>}
                </label>
              );
            }

            return (
              <label key={field.id} className={`${labelClass} ${spanClass} flex-row items-center gap-2 cursor-pointer`}>
                <input
                  type="checkbox"
                  className="size-4 accent-[#6fa675]"
                  checked={val === 'true'}
                  onChange={e => handleChange(field.id, e.target.checked ? 'true' : 'false')}
                />
                <span>{field.label}</span>
                {field.helpText && <p className="text-[11px] text-[#7b8885] ml-2">{field.helpText}</p>}
              </label>
            );
          }

          return (
            <label key={field.id} className={`${labelClass} ${spanClass}`}>
              <span>{field.label} {field.required && <span className="text-[#9a4335]">*</span>}</span>
              {inputEl}
              {field.helpText && <p className="text-[11px] text-[#7b8885]">{field.helpText}</p>}
            </label>
          );
        })}
      </div>
    </section>
  );
}
