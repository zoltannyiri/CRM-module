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

## 4. Backend Végpontok és Atomikus Életciklus (REST API & Atomic Lifecycle)

### Atomikus Entitás Létrehozás és Módosítás (Single-Request & Single-Transaction)
Az egyéni mezők közvetlen részei a Lead és Partner életciklusának:
- `POST /api/leads` és `PATCH /api/leads/:id`
- `POST /api/partners` és `PATCH /api/partners/:id`

Mind a négy végpont elfogadja a törzsben a `customFieldValues: [{ customFieldId: number, value: any }]` tömböt.
- **Tranzakciós garancia**: Az alapadatok és az egyéni mezők mentése egyetlen osztatlan adatbázis-tranzakcióban (`prisma.$transaction`) fut le. Ha bármely egyéni mező érvénytelen (hibás típus, opciókon kívüli érték, idegen bérlőhöz tartozó mező) vagy kötelező mező hiányzik, a teljes tranzakció visszagördül (rollback), és a Lead/Partner nem jön létre, illetve nem módosul.
- **Kötelező mezők védelme (isCreate: true)**: Új entitás létrehozásakor a backend ellenőrzi, hogy a bérlő összes aktív és kötelező (`required: true`) egyéni mezője kitöltésre került-e. Ha nem, `400 Bad Request` hibát ad vissza, megelőzve az inkomplett adatrekordok mentését.

### Meződefiníciók kezelése (Admin)
- `GET /api/custom-fields?entityType=LEAD`
  - Jogosultság: `CUSTOM_FIELDS_VIEW`
  - Visszaadja a bérlő összes egyéni mezőjét (aktívakat és inaktívakat), kitöltöttségi számlálóval (`_count.values`).
- `POST /api/custom-fields`
  - Jogosultság: `CUSTOM_FIELDS_CREATE`
  - Létrehoz egy új mezőt. Validálja a kulcsot (`[a-z0-9_]`), a típust, a SELECT opciókat és a default értéket. Duplikált kulcs esetén `409 Conflict`.
- `PATCH /api/custom-fields/:id`
  - Jogosultság: `CUSTOM_FIELDS_EDIT`
  - Módosítja a mező megjelenési adatait. A `key` és a `fieldType` módosítása tilos a konzisztencia védelmében.
- `DELETE /api/custom-fields/:id`
  - Jogosultság: `CUSTOM_FIELDS_DELETE`
  - Deaktiválja a mezőt (`active: false`), megőrizve a meglévő adatokat.

### Önálló Entitás Érték Kezelés (Gated Endpoints)
- `GET /api/custom-fields/values?entityType=LEAD&entityId=123`
  - Jogosultság: `LEADS_VIEW` (vagy `PARTNERS_VIEW`) és a megfelelő modul megléte.
  - Tenant és entitás létezés ellenőrzés: ha az entitás nem létezik a bérlőhöz, `404 Not Found` hibát ad vissza.
  - Visszaadja a definiált aktív mezőket és a mentett értékeket: `{ fields, values }`.
- `PUT /api/custom-fields/values`
  - Jogosultság: `LEADS_EDIT` (vagy `PARTNERS_EDIT`) és a modul megléte.
  - Tömeges mentés: `{ entityType, entityId, values: [{ customFieldId, value }] }`.
  - Szigorúan ellenőrzi az entitás bérlőhöz tartozását (`404`), validálja a mezőértékeket, és tranzakcióban törli az üres (`null` / `""`) értékeket és upsert-eli a nem üreseket.

---

## 5. Frontend Integrációs Pontok

1. **Beállítások felület (`/settings/custom-fields`)**:
   - `SettingsCustomFieldsPage.jsx`: Entitás-választó fülek (Lead / Partner), táblázatos lista sorrenddel, típussal, kötelező státusszal és műveleti gombokkal.
   - `CustomFieldFormComponent.jsx`: Jobbról becsúszó fiók (drawer) az új mezők felvételéhez és szerkesztéséhez, SELECT opciók több soros szerkesztőjével.
2. **Űrlap integráció (`CustomFieldValuesSection.jsx`)**:
   - Újrahasználható dinamikus mezőrenderelő komponens a Lead és Partner űrlapokhoz (`LeadFormComponent`, `PartnerFormComponent`).
   - Értékváltozáskor közvetlenül az űrlap belső állapotát (`customFieldValues`) frissíti.
   - Kötelező logikai mező (`BOOLEAN` + `required: true`) esetén 3-állapotú választót jelenít meg (`— Válassz —`, `Igen`, `Nem`), biztosítva a kötelező kitöltés érvényesíthetőségét.
3. **Egyetlen atomikus mentési hívás**:
   - `LeadFormComponent.jsx` és `PartnerFormComponent.jsx` egyetlen `POST` vagy `PATCH` kérésben küldi el az összes adatot a `customFieldValues` tömbbel együtt. Nincs második aszinkron hívás, nincs részleges mentési hibaállapot.
   - Hiba esetén a fiók nyitva marad, a backend által adott pontos hibaüzenet megjelenik az űrlapon.
4. **Adatlap megjelenítés**:
   - `LeadShowComponent.jsx` és `PartnerShowComponent.jsx`: Az "Egyéni mezők" szekció jeleníti meg a kitöltött értékeket címke-érték elrendezésben, megfelelő formázással (pl. Boolean esetén Igen/Nem, dátumok formázása).
5. **Navigáció**:
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
