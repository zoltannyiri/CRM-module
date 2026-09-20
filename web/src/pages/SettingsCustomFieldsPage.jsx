import { useEffect, useState } from 'react';
import apiClient from '../api/apiClient.js';
import Topbar from '../components/Topbar.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useToast } from '../hooks/useToast.js';
import CustomFieldFormComponent from '../components/customField/CustomFieldFormComponent.jsx';

const fieldTypeLabels = {
  TEXT: 'Rövid szöveg', TEXTAREA: 'Hosszú szöveg', NUMBER: 'Szám',
  MONEY: 'Pénzösszeg', BOOLEAN: 'Igen/Nem', DATE: 'Dátum',
  DATETIME: 'Dátum és idő', SELECT: 'Legördülő', MULTI_SELECT: 'Többválasztós',
};

export default function SettingsCustomFieldsPage() {
  const { hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();
  
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editField, setEditField] = useState(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState('LEAD');

  const fetchFields = () => {
    setLoading(true);
    apiClient.get('/custom-fields')
      .then(({ data }) => {
        setFields(data);
        setError('');
      })
      .catch(err => {
        setError(err.message || 'Egyéni mezők betöltése sikertelen.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    if (hasPermission('CUSTOM_FIELDS_VIEW')) {
      apiClient.get('/custom-fields')
        .then(({ data }) => {
          if (active) {
            setFields(data);
            setError('');
          }
        })
        .catch(err => {
          if (active) {
            setError(err.message || 'Egyéni mezők betöltése sikertelen.');
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => { active = false; };
  }, [hasPermission]);

  if (!hasPermission('CUSTOM_FIELDS_VIEW')) {
    return <div className="grid min-h-dvh place-items-center p-8"><div className="rounded-xl border border-[#dbe1df] bg-white p-8 text-center"><h1 className="text-lg font-semibold">Hozzáférés megtagadva</h1><p className="mt-2 text-sm text-[#71807c]">Nincs jogosultságod ehhez az oldalhoz.</p></div></div>;
  }

  const handleDeactivate = async (id) => {
    if (window.confirm('Biztosan deaktiválod ezt a mezőt? A korábban mentett értékek megmaradnak.')) {
      try {
        await apiClient.delete(`/custom-fields/${id}`);
        showSuccess('Egyéni mező sikeresen deaktiválva.');
        fetchFields();
      } catch (err) {
        showError('Hiba történt a törlés során.');
      }
    }
  };

  const openCreate = () => {
    setFormMode('create');
    setEditField(null);
    setFormOpen(true);
  };

  const openEdit = (field) => {
    setFormMode('edit');
    setEditField(field);
    setFormOpen(true);
  };

  const filteredFields = fields.filter(f => f.entityType === entityTypeFilter).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="min-h-dvh bg-[#f3f5f6] text-[#253238]">
      <Topbar />
      <div className="mx-auto max-w-6xl p-5 lg:p-7">
        <p className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#8a9693]">Beállítások</p>
        <div className="mt-1 mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Egyéni mezők</h1>
            <p className="mt-1 text-sm text-[#71807c]">Lead és Partner entitásokhoz egyéni adatmezők kezelése.</p>
          </div>
          {hasPermission('CUSTOM_FIELDS_CREATE') && (
            <button type="button" onClick={openCreate} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-[#172a2e] bg-[#21343a] px-4 text-xs font-semibold text-white hover:bg-[#17282d]">
              <i className="pi pi-plus text-xs" /> Új mező
            </button>
          )}
        </div>

        {error && <p className="mb-4 rounded-md border border-[#efd7d1] bg-[#fdf1ee] px-4 py-3 text-sm text-[#9a4335]">{error}</p>}

        <div className="mb-5 flex gap-2 border-b border-[#dbe1df] pb-px">
          <button type="button" onClick={() => setEntityTypeFilter('LEAD')} className={`px-4 py-2 text-sm font-medium ${entityTypeFilter === 'LEAD' ? 'border-b-2 border-[#263b40] text-[#263b40]' : 'text-[#71807c] hover:text-[#253238]'}`}>Érdeklődők (Lead)</button>
          <button type="button" onClick={() => setEntityTypeFilter('PARTNER')} className={`px-4 py-2 text-sm font-medium ${entityTypeFilter === 'PARTNER' ? 'border-b-2 border-[#263b40] text-[#263b40]' : 'text-[#71807c] hover:text-[#253238]'}`}>Partnerek</button>
        </div>

        <div className="rounded-xl border border-[#dbe1df] bg-white">
          {loading ? (
            <div className="p-8 text-center"><i className="pi pi-spinner pi-spin text-2xl text-[#6fa675]" /></div>
          ) : filteredFields.length === 0 ? (
            <div className="p-8 text-center text-sm text-[#71807c]">Még nincs egyéni mező ehhez az entitáshoz.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#f0f3f2] bg-[#fcfdfd] text-xs uppercase tracking-wider text-[#71807c]">
                  <tr>
                    <th className="px-5 py-4 font-medium">Megjelenítési név</th>
                    <th className="px-5 py-4 font-medium">Kulcs</th>
                    <th className="px-5 py-4 font-medium">Típus</th>
                    <th className="px-5 py-4 font-medium">Kötelező</th>
                    <th className="px-5 py-4 font-medium">Aktív</th>
                    <th className="px-5 py-4 font-medium">Sorrend</th>
                    <th className="px-5 py-4 font-medium text-right">Műveletek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f0f3f2]">
                  {filteredFields.map(field => (
                    <tr key={field.id} className={`hover:bg-[#fcfdfd] ${!field.active ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-4 font-medium text-[#253238]">{field.label}</td>
                      <td className="px-5 py-4 font-mono text-xs text-[#536166]">{field.key}</td>
                      <td className="px-5 py-4 text-[#536166]">{fieldTypeLabels[field.fieldType]}</td>
                      <td className="px-5 py-4 text-[#536166]">{field.required ? 'Igen' : 'Nem'}</td>
                      <td className="px-5 py-4 text-[#536166]">{field.active ? 'Igen' : 'Nem'}</td>
                      <td className="px-5 py-4 text-[#536166]">{field.sortOrder}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {hasPermission('CUSTOM_FIELDS_EDIT') && (
                            <button type="button" onClick={() => openEdit(field)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#d6dddc] bg-white text-[#455358] hover:bg-[#f5f7f6]" title="Szerkesztés">
                              <i className="pi pi-pencil text-xs" />
                            </button>
                          )}
                          {hasPermission('CUSTOM_FIELDS_DELETE') && field.active && (
                            <button type="button" onClick={() => handleDeactivate(field.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#ecd5d1] bg-white text-[#9d3c32] hover:bg-[#fdf1ee]" title="Deaktiválás">
                              <i className="pi pi-trash text-xs" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      {formOpen && (
        <CustomFieldFormComponent
          mode={formMode}
          field={editField}
          entityType={formMode === 'create' ? entityTypeFilter : editField?.entityType}
          onClose={() => setFormOpen(false)}
          onSaved={fetchFields}
        />
      )}
    </div>
  );
}
