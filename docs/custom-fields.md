# Custom Fields Foundation (Egyéni mezők) – Technikai Architektúra Dokumentáció

## 1. Tárhely Stratégia és Indoklás (Storage Strategy: EAV vs. JSON)

A CRM-module Custom Fields V1 megvalósításához az **EAV (Entity-Attribute-Value)** relációs modellt választottuk (`CustomField` definíciók és `CustomFieldValue` érték-rekordok).

### Miért nem egyszerű JSON oszlop a Lead/Partner táblán?
- **Indexelhetőség és SQL-szűrés**: A CRM rendszerekben elengedhetetlen, hogy a jövőben közvetlenül lehessen szűrni egyéni mezőértékekre (pl. "mutasd az összes olyan Leadet, ahol az `iparag` = `IT` vagy a `koltsegvetes` > 5 000 000 Ft"). Relációs táblában ezek indexelhetők és SQL-ben szűrhetők, míg JSON oszlop esetén bonyolult és adatbázis-specifikus JSON operátorokra lenne szükség.
- **Típusbiztonság és Adatintegritás**: A `CustomFieldValue` táblában az idegen kulcsok (`customFieldId`, `organizationId`) garantálják a referenciális épséget. Ha egy definíciót törölnek vagy frissítenek, a relációk konzisztensek maradnak.
- **Tenant Isolation garancia**: Az EAV tábla tartalmazza a közvetlen `organizationId` oszlopot és összetett indexeket (`[organizationId, entityType, entityId]`), így a multi-tenant adatbiztonság adatbázis-szinten garantált, kizárva az adatszivárgást bérlők között.

---

## 2. Entitások, Mezőtípusok és Relációk

### Első fázisban támogatott entitások (`CustomFieldEntityType`):
- `LEAD` (Érdeklődők)
- `PARTNER` (Partnerek)

### Támogatott mezőtípusok (`CustomFieldType`):
- `TEXT` – Rövid szöveg (max. 2000 karakter)
- `TEXTAREA` – Hosszú szöveg (max. 10000 karakter)
- `NUMBER` – Egész vagy lebegőpontos szám
- `MONEY` – Pénzösszeg (számszerű validációval)
- `BOOLEAN` – Igen/Nem érték (`true` / `false`)
- `DATE` – Naptári dátum (`YYYY-MM-DD` formátumban)
- `DATETIME` – Dátum és időpont (ISO 8601 formátumban)
- `SELECT` – Legördülő lista előre meghatározott opciókkal
- `MULTI_SELECT` – Többválasztós opciók (JSON tömbként tárolt string)

### Adatmodellek (Prisma):

```prisma
model CustomField {
  id             Int                   @id @default(autoincrement())
  organizationId Int
  organization   Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  entityType     CustomFieldEntityType
  key            String
  label          String
  fieldType      CustomFieldType
  required       Boolean               @default(false)
  active         Boolean               @default(true)
  sortOrder      Int                   @default(0)
  placeholder    String?
  helpText       String?
  defaultValue   String?
  options        Json?                 // SELECT és MULTI_SELECT string tömb
  values         CustomFieldValue[]
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@unique([organizationId, entityType, key])
  @@index([organizationId, entityType, active])
}

model CustomFieldValue {
  id             Int                   @id @default(autoincrement())
  organizationId Int
  organization   Organization          @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  customFieldId  Int
  customField    CustomField           @relation(fields: [customFieldId], references: [id], onDelete: Cascade)
  entityType     CustomFieldEntityType
  entityId       Int
  value          String?
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  @@unique([customFieldId, entityId])
  @@index([organizationId, entityType, entityId])
  @@index([customFieldId])
}
```

---

## 3. Jogosultságok (RBAC)

A meglévő jogosultsági konvencióhoz (`{MODULE}_{ACTION}`) igazodva a következő engedélyek vezérlik az adminisztrációt:
- `CUSTOM_FIELDS_VIEW`: Meződefiníciók listázása a Beállítások oldalon.
- `CUSTOM_FIELDS_CREATE`: Új egyéni mező létrehozása.
- `CUSTOM_FIELDS_EDIT`: Meglévő egyéni mező metaadatainak (címke, sorrend, leírás, required) módosítása.
- `CUSTOM_FIELDS_DELETE`: Mező archiválása/deaktiválása (`active: false` soft-delete).

*Fontos elv*: Az értékek kitöltése és megtekintése az entitás saját jogosultságaihoz kötődik (`LEADS_VIEW` / `LEADS_EDIT`, `PARTNERS_VIEW` / `PARTNERS_EDIT`), nem igényel külön adminisztrátori jogosultságot.

---

## 4. Backend Végpontok (REST API)

Minden végpont az `/api/custom-fields` bázis alatt érhető el:

### Meződefiníciók kezelése (Admin)
- `GET /api/custom-fields?entityType=LEAD`
  - Jogosultság: `CUSTOM_FIELDS_VIEW`
  - Visszaadja a bérlő összes egyéni mezőjét (aktívakat és inaktívakat), kitöltöttségi számlálóval (`_count.values`).
- `POST /api/custom-fields`
  - Jogosultság: `CUSTOM_FIELDS_CREATE`
  - Létrehoz egy új mezőt. Validálja a kulcsot (`[a-z0-9_]`), a típust és a SELECT opciókat. Duplikált kulcs esetén `409 Conflict`.
- `PATCH /api/custom-fields/:id`
  - Jogosultság: `CUSTOM_FIELDS_EDIT`
  - Módosítja a mező megjelenési adatait. A `key` és a `fieldType` módosítása tilos a konzisztencia védelmében.
- `DELETE /api/custom-fields/:id`
  - Jogosultság: `CUSTOM_FIELDS_DELETE`
  - Deaktiválja a mezőt (`active: false`), megőrizve a meglévő adatokat.

### Entitás értékek kezelése (Forms & Detail Views)
- `GET /api/custom-fields/values?entityType=LEAD&entityId=123`
  - Visszaadja a definiált aktív mezőket és az adott entitáshoz mentett értékek kulcs-érték térképét `{ fields, values }`.
- `PUT /api/custom-fields/values`
  - Tömeges mentés: `{ entityType, entityId, values: [{ customFieldId, value }] }`
  - Tranzakcióban végzi el a mezők validálását (típusellenőrzés, kötelező mezők, opció-ellenőrzés) és upsert-elését.

---

## 5. Frontend Integrációs Pontok

1. **Beállítások felület (`/settings/custom-fields`)**:
   - `SettingsCustomFieldsPage.jsx`: Entitás-választó fülek (Lead / Partner), táblázatos lista sorrenddel, típussal, kötelező státusszal és műveleti gombokkal.
   - `CustomFieldFormComponent.jsx`: Jobbról becsúszó fiók (drawer) az új mezők felvételéhez és szerkesztéséhez, SELECT opciók több soros szerkesztőjével.
2. **Űrlap integráció (`CustomFieldValuesSection.jsx`)**:
   - Újrahasználható dinamikus mezőrenderelő komponens, amely automatikusan illeszkedik a Lead és Partner űrlapok (`LeadFormComponent`, `PartnerFormComponent`) megjelenéséhez.
   - Entitás létrehozása vagy módosítása után a sikeres mentés hook-jában automatikusan elküldi a kitöltött egyéni mezőértékeket.
3. **Adatlap megjelenítés**:
   - `LeadShowComponent.jsx` és `PartnerShowComponent.jsx`: Új "Egyéni mezők" szekció jeleníti meg a kitöltött értékeket címke-érték elrendezésben, megfelelő formázással (pl. Boolean esetén Igen/Nem, dátumok formázása).
4. **Navigáció**:
   - `Sidebar.jsx`: A "Beállítások" menüpont lenyitható almenüvé bővült ("Jogosultságok" és "Egyéni mezők").

---

## 6. Jövőbeli Bővíthetőség

A rendszer architektúrája úgy lett megtervezve, hogy a további entitások bekapcsolása minimális munkát igényel:
- **További entitások**: A `CustomFieldEntityType` enum bővíthető (`OFFER`, `PROJECT`, `CONTACT`, `PRODUCT`, `TASK`, `FOLLOW_UP`). A `CustomFieldValuesSection` komponens azonnal használható ezekhez is az `entityType` prop átadásával.
- **Szűrés és listák**: A `CustomFieldValue` indexek lehetővé teszik a listázó végpontok (`leadService.getLeads`, `partnerService.getPartners`) bővítését egyéni mező alapú SQL szűréssel (pl. `customFieldValues.some(...)`).
- **Audit / Activity log**: A mezőértékek módosítása bekapcsolható a meglévő `activityService` alá.

---

## 7. Ismert Kompromisszumok és V1 Limitek

1. **Szöveges tárolás (`value String?`)**:
   - Minden értéktípus sztringként van tárolva az EAV táblában. A típus-specifikus validációt és konverziót az alkalmazásréteg végzi el a `fieldType` alapján.
2. **Kulcs (key) módosíthatatlansága**:
   - Létrehozás után a mező azonosító kulcsa nem módosítható, elkerülve a hivatkozási és API inkonzisztenciákat.
3. **Soft-delete alapértelmezés**:
   - A törlés funkció archiválást (`active: false`) végez, így a korábban rögzített üzleti adatok nem vesznek el.
