# FOLLOW_UPS V1 – implementáció és lezáró audit

Dátum: 2026-09-14.

**FOLLOW_UPS V1 LEZÁRHATÓ ✅**

A végső auditban nincs nyitott P0, P1, P2 vagy P3 finding. A megvalósítás manuális, Leadhez kötött utánkövetés. A következő külön fejlesztési fázis a Lead → Partner conversion; az nem indult el.

## Kiindulási állapot

- Branch: `main`.
- Ellenőrzött HEAD és a munka kezdetén frissen letöltött `origin/main`: `60e623fd5e0f18f220828b1bfc35a77acb926d68` (`pipeline fixes`).
- A munkafa a kezdéskor tiszta volt. A változások review-ra készen, commit nélkül maradtak.
- Az aktuális Prisma, Leads, Pipeline, Tasks, Activity, Dashboard, module/permission és drawer minták alapján készült az implementáció.
- A Sidebarban kizárólag az Utánkövetések integrációja változott.

## Adatmodell és üzleti szabályok

Új explicit `FollowUp → Lead` kapcsolat; a Tasks modell változatlan.

Mezők: `id`, `organizationId`, `leadId`, nullable `assignedMemberId` és `createdByMemberId`, `type`, `status`, `dueAt`, nullable `note` és `completedAt`, `createdAt`, `updatedAt`.

- `FollowUpType`: CALL / EMAIL / MEETING / OTHER; UI: Telefon / E-mail / Találkozó / Egyéb.
- `FollowUpStatus`: OPEN / COMPLETED / CANCELLED; UI: Nyitott / Teljesítve / Lemondva.
- Létrehozáskor OPEN. A Lead később nem módosítható.
- Külön complete action: OPEN → COMPLETED, szerveroldali `completedAt` értékkel. Ismételt complete változatlan rekordot ad vissza, új Activity nélkül. CANCELLED complete: 409.
- EDIT segítségével OPEN vagy CANCELLED választható; a completedAt ilyenkor null. Generic PATCH-ben COMPLETED nem küldhető.
- Hard delete; Lead törlésekor a kapcsolódó Follow-upok cascade törlődnek, az Activity történet megmarad.
- Szervezeti tag törlésekor csak az assignee/creator azonosító nullázódik, az organizationId megmarad.

DB-védelem: Organization FK, composite Lead–tenant és Member–tenant FK-k, valamint CHECK, amely pontosan COMPLETED állapotban enged nem null completedAt értéket. OrganizationMember kapott `(id, organizationId)` unique kulcsot.

Indexek a tényleges lekérdezésekhez: `(organizationId, status, dueAt)`, `(organizationId, assignedMemberId, status, dueAt)`, `(leadId, organizationId, status, dueAt)`, valamint a két member–tenant FK indexe.

## Backend és permission chain

Új service/controller/routes: `followUpService.js`, `followUpController.js`, `followUpRoutes.js`.

Minden endpoint közös előfeltétele: érvényes auth és aktuális organization, FOLLOW_UPS + LEADS bekapcsolva, FOLLOW_UPS_VIEW + LEADS_VIEW. Az író műveletek is ezt a teljes láncot igénylik, mert Leadet tartalmazó Follow-up választ adnak vissza.

| Endpoint | További permission |
| --- | --- |
| GET /api/follow-ups | nincs |
| GET /api/follow-ups/:id | nincs |
| POST /api/follow-ups | FOLLOW_UPS_CREATE |
| PATCH /api/follow-ups/:id | FOLLOW_UPS_EDIT |
| DELETE /api/follow-ups/:id | FOLLOW_UPS_DELETE |
| PATCH /api/follow-ups/:id/complete | FOLLOW_UPS_COMPLETE |

A lista backend szűrései: search (Lead név, cégnév, note), status, type, assignedMemberId, leadId, period és sort. Period: ALL / OVERDUE / TODAY / UPCOMING / COMPLETED. Rendezés: dueAsc / dueDesc / completedDesc, stabil id tie-breakerrel. Alapértelmezés dueAt ASC; teljesített nézetben completedAt DESC.

Strict payload: ismeretlen mező, hibás típus, numerikus string JSON ID, érvénytelen enum, timestamp, lehetetlen dátum, nem nullable mezőre null elutasítva. Note legfeljebb 10 000 karakter; whitespace-only note null. PATCH omitted mező változatlan; note és assignee explicit null engedett. Lead PATCH-ben tiltott. Complete üres objektumot vagy body nélküli hívást fogad.

Válaszban csak a Follow-up listához szükséges mezők, minimális Lead (`id`, `name`, `companyName`) és assignee (`id`, user keresztnév/vezetéknév) szerepelnek. Nincs organization vagy permission belső adat. A kezelhető konkurens FK/rekordeltűnés generikus 404, a belső hibák a meglévő központi error flow-ba kerülnek.

## Tenant, concurrency és Activity

- Minden Follow-up query organization-scoped. Idegen Follow-up GET/PATCH/DELETE/complete, idegen Lead create és idegen assignee elutasítva; közvetlen DB-be írásnál is composite FK védi a tenantet.
- A create a meglévő Lead lockját használja. Edit/complete/delete Follow-uponként közös tranzakciós advisory lockot kap, a Pipeline és Lead lock kulcsaitól elkülönítve.
- Párhuzamos duplicate complete: egy special Activity és egy completedAt. Edit + complete: nincs elveszett metadata vagy invalid státusz.
- Create, update, complete, delete és Activity ugyanabban a DB-tranzakcióban vannak. Activity hiba esetén az üzleti művelet is rollbackel.
- ActivityEntityType: FOLLOW_UP. CREATED / UPDATED / DELETED mellett külön FOLLOW_UP_COMPLETED action. No-op edit és duplicate complete nem ír új eseményt.
- Standalone Activity és Dashboard recent Activity csak ACTIVITY_VIEW mellett, a Follow-up saját teljes module/view láncával engedi az utánkövetési eseményeket.

## Datetime konvenció

- `dueAt`, `completedAt` és Follow-up audit timestamp mezők PostgreSQL `TIMESTAMPTZ(3)` instantok.
- A drawer `datetime-local` értéket kér. A böngésző helyi időből explicit ISO timestampet küld; a backend csak Z vagy numerikus offsetet tartalmazó valódi dátumot fogad.
- A megjelenítés böngésző-local magyar dátum/idő formátumú. Nincs date-only átalakítás.
- OVERDUE: OPEN és dueAt < szerver aktuális idő. UPCOMING: OPEN és dueAt > aktuális idő. Pontosan az aktuális idő nem tartozik egyikbe sem.
- TODAY: OPEN, helyi nap kezdete inkluzív, következő helyi nap kezdete exkluzív. A frontend böngésző IANA timeZone-t küld. Enélküli API-hívásnál a dokumentált alapértelmezés Europe/Budapest.
- PostgreSQL külön konvertálja a két helyi éjfélt; a nap hossza DST esetén 23 vagy 25 óra is lehet.
- A tavaszi nem létező helyi időt a form elutasítja. Őszi ismétlődő idő új bevitelénél a JavaScript első előfordulása a konvenció; módosítatlan edit időpont esetén az eredeti pontos instant megmarad, a második előfordulás és másodperc/milliszekundum is.
- Múltbeli időpont rögzíthető.

## Frontend és integrációk

- `/follow-up`: teljes route guard, Utánkövetések cím, keresés, felelős/típus/státusz/rendezés és időnézetek; permission szerinti Új utánkövetés gomb az oldalban.
- `FollowUpListComponent`: PrimeReact DataTable + Column felépítés, típus, Lead, időpont, felelős, státusz és jogosultság szerinti ikon actionök. A projekt listamintáját követő 10 soros client pagination; a keresést és üzleti szűréseket a backend végzi.
- Loading alatt a fejléc megmarad, a középső spinner fehér háttéren jelenik meg, nincs alatta halvány empty felirat. Külön empty/error állapot.
- `FollowUpFormComponent`: wrapper + inner form, jobb drawer, overlay/backdrop/Escape, body scroll lock, fix header/footer és scroll body; mobilon teljes szélesség, desktopon legalább 50%, minimum 640px. Inline hiba, pending guard és duplikált submit elleni védelem.
- `RelatedFollowUpsComponent`: Lead detail Utánkövetések tab, előre kiválasztott Lead; a legutóbbi detail kérés nyer, régi válasz nem írhatja felül az új drawert.
- Pipeline: maximum egy következő OPEN időpont. Permission nélkül backend response-ban sem szerepel nextFollowUp; a frontend külön guardja elrejti a korábban megkapott adatot is. Nincs cardonkénti API-hívás vagy DB N+1. DB queryszámmal ellenőrzött skálázás.
- Dashboard: saját assignee szerinti overdue/today count és első 5 nyitott utánkövetés. Egy Dashboard endpoint, backend aggregáció, jogosultság nélkül sem blokk, sem adat.
- Settings permissions: öt új magyar permission a meglévő csoportosításban.
- Közös `followUpDisplay.js` helper a címkékhez, időponthoz, filterekhez és permission action visibilityhez.

## Migráció és inicializálás

Két új migráció, ebben a sorrendben:

1. `20260914085900_add_follow_up_enums`: PermissionKey és Activity enum bővítés.
2. `20260914090000_add_follow_ups`: Follow-up típusok, tábla, constraint/index és backfill.

Az enum bővítés külön commitolt migrációba került, hogy a következő migráció biztonságosan használhassa az új enum értékeket. A FOLLOW_UPS ModuleKey már létezett; nem került újra hozzáadásra.

Existing organization: hiányzó FOLLOW_UPS modul enabled=true; meglévő rekord és explicit disabled döntés változatlan. ADMIN/USER öt explicit permissiont kap; meglévő permissionök megmaradnak, OWNER nem kap explicit rekordot. Új organization/modul és új tag permission inicializálása a jelenlegi centralizált flow-t követi. Ismételt backfill és migrate deploy tesztelve.

**Alkalmazás a saját adatbázisodra, a backend könyvtárból:**

```powershell
npx prisma migrate deploy
npx prisma generate
```

Ezután indítsd újra a backendet, és frissítsd a böngészőben a session/permission állapotot. Az alkalmazás adatbázisán nem futtattam migrációt: a DB-tesztek véletlen nevű, izolált PostgreSQL sémákat használtak és takarítottak el.

### Fontos SQL/Prisma részlet

A member composite FK-k célzott `ON DELETE SET NULL (assignedMemberId)` / `(createdByMemberId)` SQL-t használnak, PostgreSQL 15+ szükséges. Ez a nullable member oszlopot üríti, nem a kötelező tenant oszlopot. A célzott oszloplista dokumentált PostgreSQL viselkedés: [PostgreSQL 15 CREATE TABLE](https://www.postgresql.org/docs/15/sql-createtable.html).

A Prisma validate két figyelmeztetést ad, mert a sémabeli composite SetNull kapcsolat kötelező organizationId-t is tartalmaz, és a Prisma nem fejezi ki a célzott SQL oszloplistát. A valódi migráció és a member-delete DB teszt bizonyítja a kívánt működést. A completion CHECK szintén SQL-ben rögzített védelem. Későbbi generált migráció review-jában ezeket meg kell őrizni; `db push` nem helyettesíti ezt a migrációt.

## Ténylegesen futtatott ellenőrzések

| Ellenőrzés | Eredmény |
| --- | --- |
| Backend `npm test` | 50 passed / 0 failed / 7 skipped |
| Follow-up DB + meglévő állapot migráció | 16 passed / 0 failed / 0 skipped |
| Pipeline DB + migráció regresszió | 22 passed / 0 failed / 0 skipped |
| Leads DB regresszió | 13 passed / 0 failed / 0 skipped |
| Frontend `npm test` | 30 passed / 0 failed |
| Frontend `npm run lint` | PASS |
| Frontend `npm run build` | PASS |
| `npx prisma validate` | PASS, fent részletezett két SetNull warning |
| `npx prisma generate` | PASS |
| Backend source és új tesztek syntax check | PASS |
| `git diff --check`, új fájlok whitespace check | PASS |

A normál backend futás hét skipje opt-in DB suite: Auth, Offers, Leads, Pipeline, Pipeline migration, Follow-up, Follow-up migration. A jelen módosítást érintő Leads/Pipeline/Follow-up suite-ok külön valódi DB-vel lefutottak; az Auth és Offers opt-in DB suite most nem futott. A suite-ok összesített számai tartalmazhatják a Node parent suite tesztjét is, ezért nem jelentenek ugyanennyi független üzleti esetet.

Follow-up DB futtatás:

```powershell
$env:FOLLOW_UPS_DB_TESTS = '1'
node --experimental-test-module-mocks --test --test-concurrency=1 test/followUp.database.test.js test/followUp.migration.database.test.js
Remove-Item Env:FOLLOW_UPS_DB_TESTS
```

Bizonyított esetek: teljes tenant támadási lista; közvetlen DB cross-tenant FK és completion CHECK; permission/module/view lánc; idempotens és párhuzamos complete; edit + complete; mind a négy Activity rollback; omitted/null/no-op; időhatárok és 23/25 órás DST; Pipeline minimális response és konstans queryszám több card mellett; Dashboard/Activity adatszivárgás; member eltávolítás és Lead cascade; új és meglévő organization backfill.

A frontend tesztek a meglévő infrastruktúrával helper logikát és tényleges JSX handler viselkedést ellenőriznek: local/ISO idő, DST gap és repeated hour, action visibility, pending submit/complete, inline hibák, loading empty állapot és elavult detail válasz. Új testing framework nem került telepítésre.

Nem futott fizikai böngészős/mobilos vizuális, touch vagy fókuszteszt, illetve nagy adathalmazon terhelési benchmark. A responsive osztályok és drawer minták kódreview-ja megtörtént; ez nem helyettesít eszközön végzett vizuális ellenőrzést. A build meglévő nagy bundle figyelmeztetése megmaradt.

## Lezáró audit findingek

| Prioritás / kategória | Valódi finding | Javítás és bizonyíték | Állapot |
| --- | --- | --- | --- |
| P0 | Nincs | — | Nincs nyitott |
| P1 / MIGRATION | Egy tranzakcióban az új PermissionKey enum használata backfillhez P3018 / PostgreSQL 55P04 hibát okozott | Enum és backfill két migrációba választva; friss schema és meglévő adatállapot valódi migrate deploy tesztje sikeres | Javítva |
| P2 / PERMISSION | Az első write guard nem követelte meg a FOLLOW_UPS_VIEW-t, miközben Leadet tartalmazó választ adott | VIEW a közös route guardban, action permission mellett is kötelező; CREATE action VIEW nélkül 403 regresszió | Javítva |
| P3 / UX | Párhuzamos detail kéréseknél a később beérkező régi válasz felülírhatta az új drawer rekordját | Lokális request token, create/close invalidálás; out-of-order A/B frontend regresszió | Javítva |

A végső manuális kódreview végigkövette a route → middleware → controller → service → Prisma → Activity láncot mind a négy mutációra, és a Lead/Pipeline/Dashboard/Activity integrációk view chainjét. Nincs nyitott lezárást gátló finding.

## Deploy utáni javítás – 2026-09-14

A felhasználó későbbi `migrate deploy` futása a Neon pooler kapcsolaton „migration persistence is not initialized” hibával állt meg. Read-only ellenőrzés igazolta, hogy a public migrációs tábla és a 15 korábbi sikeres migráció megvan. A Prisma CLI konfigurációja most DIRECT_URL-t részesít előnyben; ennek hiányában Neon pooler hostból a megfelelő direct hostot használja. Az alkalmazás DATABASE_URL-je változatlan.

A pooleres futásból maradt advisory lockot egy saját felhasználóhoz tartozó, idle, tranzakció nélküli PgBouncer kapcsolat tartotta. Kizárólag ezt a migrációs lockot tartó inaktív kapcsolatot zártuk le. Ezután a két Follow-up migráció a felhasználó által megkezdett deploy folytatásaként sikeresen alkalmazva lett a public sémán. Prisma generate szintén sikeres. A fenti „nem futtattam migrációt” megjegyzés az eredeti implementációs audit időpontjára vonatkozik; ezzel az utólagos javítással a saját adatbázis deploy-ja is elkészült.
