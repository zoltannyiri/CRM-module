# Leads v1 implementációs riport

Kiindulás: a GitHub origin/main frissen lekérve, a munkapéldány és origin/main azonos: 381a5fd. JavaScript implementáció, a meglévő modulok mintáival.

## IMPLEMENTÁLT FUNKCIÓK

Önálló érdeklődő CRUD; státusz, forrás és opcionális szervezeti felelős; keresés név, cégnév, email és telefon alapján; lista szűrők; létrehozás szerinti rendezés; meglévő mintát követő kliensoldali 10 soros lapozás. Megtekintés teljes oldalon, létrehozás és szerkesztés jobb oldali drawerben, törlés megerősítéssel. A dashboard változatlan.

## PRISMA / ADATMODELL

Lead: id, organizationId, name, companyName?, email?, phone?, status, source, note?, assignedMemberId?, createdByMemberId?, createdAt, updatedAt.

LeadStatus: NEW, CONTACTED, QUALIFIED, LOST. LeadSource: WEBSITE, REFERRAL, PHONE, EMAIL, SOCIAL, OTHER. Létrehozáskor csak a kihagyott státusz/forrás alapértelmezett: NEW / OTHER.

Organization kapcsolat CASCADE; a felelős és létrehozó OrganizationMember kapcsolata SET NULL. Indexek: organizationId, organizationId+status, organizationId+source, organizationId+assignedMemberId, assignedMemberId és createdByMemberId.

## MIGRATION

20260912120000_add_leads: Lead tábla, enumok, indexek, idegen kulcsok, négy permission és LEAD ActivityEntityType. A LEADS ModuleKey már létezett fenntartott értékként.

A korábbi Documents/Offers backfill szerint minden meglévő szervezet LEADS rekordot kap; a már létező rekordot és disabled állapotát megőrzi. ADMIN/USER négy explicit permission rekordot kap, OWNER továbbra is implicit. A backfill ismételten futtatható. A teljes migration láncot és backfill SQL-t elkülönített PostgreSQL sémában ellenőriztük.

Az alkalmazás saját adatbázisára a migration még alkalmazandó. A backend könyvtárában:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Ezután indítsd újra a backendet, és frissítsd a munkamenetet, hogy az új module/permission adatok betöltődjenek.

## BACKEND ENDPOINTOK

| Metódus | Endpoint | Permission |
| --- | --- | --- |
| GET | /api/leads | LEADS_VIEW |
| GET | /api/leads/:id | LEADS_VIEW |
| POST | /api/leads | LEADS_CREATE |
| PATCH | /api/leads/:id | LEADS_EDIT |
| DELETE | /api/leads/:id | LEADS_DELETE |

Lista query: status, source, assignedMemberId, search, sortDirection=asc/desc. Hibás, üres vagy ismételt enum/azonosító/rendezési szűrő kontrollált 400. Érvénytelen email, telefon, adattípus, státusz, forrás, ismeretlen vagy belső mező szintén 400. JSON azonosító csak pozitív Int szám lehet. PATCH kihagyott mező megmarad; explicit null csak nullable mezőt töröl.

## MODULE / PERMISSIONS

Middleware: auth → requireOrganization → requireModule("LEADS") → requirePermission → controller. Új szervezetek a centralizált module inicializálásban kapják meg a LEADS modult. Új ADMIN/USER tagok a meglévő enum alapú centralizált permission inicializálást használják. Hiányzó OrganizationModule = disabled.

A Sidebar és a /lead, /lead/:id route egyaránt LEADS + LEADS_VIEW alapján védett. CREATE/EDIT/DELETE nélkül az adott gomb nem jelenik meg. Nincs külön LEADS_ASSIGN permission.

## MULTI-TENANT SECURITY

Minden Lead lekérdezés, módosítás és törlés az aktuális organizationId alapján scoped. Más tenant Lead ID esetén show/edit/delete 404, listában nincs adat. Más tenant felelős create/edit során elutasított. A szervezet és létrehozó nem adható meg payloadban.

A response csak a szükséges Lead mezőket, a felelős member ID-ját és neveit, illetve a létrehozó neveit tartalmazza. Nem tartalmaz teljes membership, session, auth vagy organization adatot.

## FRONTEND

LeadPage; LeadListComponent PrimeReact DataTable/Column szerkezettel; LeadFormComponent permission wrapper + inner hooks; LeadShowComponent full-page read wrapperrel. A Topbar, TabView, táblázat, drawer méret, színek, border, spacing, overlay, transition, shadow és scroll lock a meglévő mintát követi.

Drawer: desktop legalább fél képernyő, kis képernyő teljes szélesség; overlay click, Escape, Bezárás és Mégse. Mentés közben disabled gomb. Inline validáció; sikeres művelet toast; a lokálisan toastolt hibáknál a globális toast ki van kapcsolva.

Töltés alatt a táblázat fejléce megmarad, középen spinner fehér háttérrel; régi sorok és üres állapot szövege nem látszanak alatta. Empty: „Nincs megjeleníthető érdeklődő.” Akciók ikonokkal, aktív vezérlők pointer, disabled vezérlők wait/not-allowed. Keskeny nézetben a táblázat vízszintesen görgethető.

## ACTIVITY

LEAD: CREATED, UPDATED, DELETED, STATUS_CHANGED, ASSIGNED. Csak valódi változás naplózódik; no-op PATCH nem ír eseményt. A kezdeti nem null felelős is null → member hozzárendelésként naplózódik.

Activity és üzleti művelet ugyanabban a backend tranzakcióban történik. Párhuzamos edit/delete tranzakciós zárolás biztosítja a helyes korábbi felelős/státusz eseményt. Láthatóság: ACTIVITY_VIEW + engedélyezett LEADS + LEADS_VIEW, az aktuális tenantban. Frontend címkék magyarok.

## MÓDOSÍTOTT FÁJLOK

- backend/prisma/schema.prisma
- backend/prisma/migrations/20260912120000_add_leads/migration.sql
- backend/src/controllers/leadController.js
- backend/src/services/leadService.js
- backend/src/routes/leadRoutes.js
- backend/src/server.js
- backend/src/controllers/activityController.js
- backend/src/services/activityService.js
- backend/src/services/organizationModuleService.js
- backend/test/leadController.test.js
- backend/test/lead.database.test.js
- web/src/pages/LeadPage.jsx
- web/src/components/lead/LeadListComponent.jsx
- web/src/components/lead/LeadFormComponent.jsx
- web/src/components/lead/LeadShowComponent.jsx
- web/src/components/lead/leadDisplay.js
- web/src/App.jsx
- web/src/components/Sidebar.jsx
- web/src/components/activity/ActivityFeed.jsx
- web/src/pages/SettingsPermissionsPage.jsx
- docs/LEADS_V1_IMPLEMENTATION.md

## TESZTEK

Eredmények: backend alapcsomag 40 sikeres, 3 opt-in kihagyott teszt; a Leads DB csomag külön futtatva 12/12 sikeres, kihagyás nélkül; frontend tesztek 4/4 sikeres.

Backend unit tesztek: név/alapértelmezések, szigorú típusok, omitted/null PATCH, email/telefon, szűrők és Activity láthatóság. Valódi Express middleware/controller/service + PostgreSQL integráció: CRUD, keresési mezők, minimális response, tenant izoláció, cross-tenant assignment, filter/payload 400, permission matrix, disabled és hiányzó modul, Activity visibility, tranzakció rollback create/edit/delete esetén, párhuzamos azonos assignment, delete Activity, SQL backfill és új szervezet/tag inicializálás.

A DB teszt opt-in; külön véletlen nevű sémában telepíti a migration láncot, végül eltávolítja. Meglévő alkalmazásadatot nem módosít.

```powershell
# backend
npm test
$env:LEADS_DB_TESTS='1'
node --experimental-test-module-mocks --test test/lead.database.test.js
Remove-Item Env:LEADS_DB_TESTS
```

## LINT / BUILD

Frontend ESLint, production build és meglévő frontend tesztek sikeresek. Prisma validate és generate sikeres. Backend syntax ellenőrzés és git diff --check sikeres. A build meglévő nagy bundle figyelmeztetése nem blokkoló. Az implementáció során nem azonosítottunk javítandó, scope-on belüli korábbi hibát.

## MANUÁLISAN TESZTELENDŐ

Az alábbi böngészős lépések külön manuális ellenőrzést igényelnek; nem tekintendők automatikusan végrehajtottnak.

1. LEADS enabled: Sidebar és mindkét route elérhető. Disabled vagy hiányzó modul: menü rejtett, közvetlen route modulhibát mutat; API 403.
2. USER csak VIEW: lista/show és szem ikon elérhető, create/edit/delete rejtett. VIEW+CREATE, VIEW+EDIT, VIEW+DELETE esetén kizárólag az adott művelet is látható. Permission nélkül menü és adat nem elérhető.
3. Üres lista: pontos üres szöveg. Több mint 10 rekord: lapozás, szélső gombok disabled; létrehozás asc/desc rendezés. Státusz, forrás, felelős külön és kombinálva; név/cégnév/email/telefon keresése.
4. Lassított hálózat: fejlécek láthatók, spinner a fehér lista közepén, nincs halvány régi sor vagy empty szöveg.
5. Create csak névvel; teljes adatokkal; felelőssel és nélküle; note-tal. Üres név, hibás email/telefon: inline validation, nincs inputhiba toast. Sikeres save: egy siker toast, lista frissül, drawer bezárul.
6. Drawer nyitás/zárás desktop és mobil méreten; overlay click, Escape, Bezárás, Mégse; scroll body lock helyreáll; Mentés disabled loading közben.
7. Edit név, cégnév, email, telefon, státusz, forrás, felelős és note. Opcionális mezők ürítése, felelős törlése. Save után lista és nyitott adatlap frissül.
8. Show /lead/:id: teljes oldalas adatlap, összes alapadat, note, létrehozó és időbélyegek; jogosultság szerint edit/delete. Vissza és Alapadatok tab működik.
9. Delete: megerősítés elutasítása nem töröl; jóváhagyás töröl, egy toast és DELETED Activity. Show törlés után vissza a listára.
10. Activity: create/update/status/assignment/delete események; változatlan felelős újbóli mentése nem hoz létre ASSIGNED-et. LEADS_VIEW vagy LEADS modul nélkül Lead Activity nem látszik.
11. Két szervezet: idegen Lead ID list/show/edit/delete nem hozzáférhető; idegen assignedMemberId create/edit elutasított; tenant adatok nem változnak.
12. Cursor: új/vissza/tab/pagination/view/edit/delete/close/cancel/save pointer; disabled gomb wait/not-allowed; badge és adatcella nem pointer.

## VÉGSŐ DÖNTÉS

LEADS V1 IMPLEMENTÁLVA – MEHET LEZÁRÓ AUDITRA ✅
