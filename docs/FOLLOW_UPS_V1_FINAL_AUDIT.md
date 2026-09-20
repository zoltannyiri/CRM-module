# FOLLOW_UPS V1 – teljes lezáró audit

Audit dátuma: 2026-09-20.

## HEAD és hatókör

- Branch: `main`
- Auditált commit: `946fa10dfbd8e0e9f0baa733fb892419c41988de` (`followup show fixes`)
- A fetch után a lokális HEAD és `origin/main` azonos volt; a munkafa az audit elején tiszta volt.
- Átolvasva: Prisma modell és mindkét Follow-up migráció; module/permission inicializálás; Follow-up route → middleware → controller → validation → service → Prisma → Activity lánc; Dashboard és Pipeline; Lead/member delete; minden Follow-up frontend felület és releváns teszt.

## Döntés

**FOLLOW_UPS V1 LEZÁRHATÓ ✅**

Nincs nyitott P0, P1, P2 vagy P3 finding. A modul tenant-, permission-, datetime-, migration- és concurrency-invariánsait valódi izolált PostgreSQL tesztek igazolták.

## Findings

### P0 – CRITICAL

Nincs.

### P1 – HIGH

Nincs.

### P2 – MEDIUM

Nincs.

### [P3] UX – A Dashboard konkrét Follow-up sora a Lead adatlapjára navigált

**Érintett:** `web/src/pages/DashboardPage.jsx`

**Probléma:** a „Saját utánkövetéseim” egy konkrét, saját `id`-val rendelkező Follow-up rekordot jelenít meg, de kattintáskor `/lead/:leadId` volt a cél.

**Hatás:** a felhasználó nem a kiválasztott teendő adatlapjára jutott, ezért újra meg kellett keresnie a Follow-upot; a már létező `/follow-up/:id` full-page UX nem volt konzisztens.

**Reprodukció:** Dashboard → Saját utánkövetéseim → kattintás egy sorra → Lead detail nyílt meg.

**Javítás:** a cél `/follow-up/:followUpId`. Tényleges JSX handler regressziós teszt bizonyítja a route-ot.

**Állapot:** javítva, nincs nyitva.

## Javított fájlok

- `web/src/pages/DashboardPage.jsx` – célzott Dashboard route-javítás.
- `web/test/dashboardFollowUpNavigation.test.js` – a konkrét sor full-page Follow-up navigációjának regressziója.
- `backend/test/followUp.database.test.js` – delete+complete, Lead delete+create race, valamint Activity `entityType + entityId` scope bizonyítása.
- `web/test/followUpPagination.test.js` – keresés/status/type/assignee/period/lead/sort page reset és reload page-megőrzés.
- `docs/FOLLOW_UPS_V1_FINAL_AUDIT.md` – ez a jelentés.

Backend üzleti kód, Prisma schema és migráció nem igényelt javítást. Új migráció nem szükséges.

## Domain és adatmodell

- A FollowUp külön modell; nincs összeolvasztva a Taskkal.
- Explicit `FollowUp → Lead`, nem polymorphic kapcsolat.
- A complete kizárólag a FollowUp status/completedAt értékeit módosítja és special Activity-t ír. A LeadStatus és Pipeline position változatlan marad.
- Pipeline move nem hoz létre Follow-upot; nincs reminder, email, scheduler, notification vagy egyéb rejtett automation.
- Státuszinvariáns DB CHECK: pontosan COMPLETED esetén kötelező a completedAt; OPEN és CANCELLED esetén null.
- Lead immutable PATCH-ben; hibás hozzárendelés törlés + új create.
- Válasz minimális: szükséges Follow-up scalarok, minimális Lead (`id`, `name`, `companyName`) és minimális assignee név. Organization, permission internals, e-mail/telefon és creator internals nem kerülnek ki.

## Security és multi-tenancy

| Ellenőrzés | Eredmény |
| --- | --- |
| Más organization Follow-up GET/PATCH/DELETE/complete | PASS – automated HTTP/DB |
| Más organization Lead create | PASS – automated HTTP és közvetlen DB FK |
| Más organization assignee create/edit | PASS – automated HTTP és közvetlen DB FK |
| Lead PATCH immutable, cross-tenant Lead sem adható meg | PASS – automated validation |
| Minden query organization-scoped | PASS – manual chain review + automated |
| FOLLOW_UPS/LEADS module külön-külön disabled | PASS – automated |
| VIEW/CREATE/EDIT/DELETE/COMPLETE és OWNER implicit | PASS – automated |
| FOLLOW_UPS_VIEW LEADS_VIEW nélkül | PASS – list/show/write blokkolt, Dashboard/Pipeline/Activity nem szivárog |
| Pipeline nextFollowUp permission nélkül | PASS – backend mező sincs a válaszban |
| Dashboard permission/module nélkül | PASS – Follow-up blokk/adat nincs, a többi Dashboard működik |
| Activity Follow-up visibility | PASS – ACTIVITY_VIEW + mindkét domain module/view kötelező |
| Activity detail scope | PASS – automated `entityType=FOLLOW_UP&entityId=currentId`, csak az aktuális entity |

A route közös guardja auth + organization + FOLLOW_UPS module + LEADS module + LEADS_VIEW + FOLLOW_UPS_VIEW. Az írások ehhez külön action permissiont követelnek. A frontend visibility UX-réteg; a backend ettől függetlenül enforce-ol.

## Validation és API

- Strict JSON payload: ismeretlen mező, array/null body és hibás mezőtípus kontrollált 400.
- JSON `leadId`/`assignedMemberId` csak pozitív integer number; numerikus string nem koercionálódik. URL/query ID validáció külön strict parserrel.
- Create nem fogad státuszt; mindig OPEN.
- PATCH omitted mezőt megtart; kizárólag note és assignedMemberId nullable. dueAt/type/leadId null vagy leadId bármilyen PATCH értéke tiltott.
- Generic PATCH nem állíthat COMPLETED státuszt; erre a külön complete endpoint és permission szolgál.
- Note trimelve, whitespace-only null, maximum 10 000 karakter, NUL tiltott.
- Search/type/status/assignee/leadId/period/sort minden invalid vagy ismételt alakja kontrollált 400; nincs „hibás filter → minden rekord” fallback.
- Search where első eleme organizationId, ezért Lead név/companyName/note keresés tenant-scoped.
- 5xx a central error handleren megy át; a frontend nem jelenít Prisma/PG/stack adatot, és a lokális flow `skipGlobalErrorToast` beállítással nem duplikál toastot.

## Datetime

- **Storage:** `dueAt`, `completedAt`, createdAt és updatedAt PostgreSQL `TIMESTAMPTZ(3)`, egyértelmű instantként.
- **Create conversion:** a böngésző `datetime-local` értékéből lokális `Date`, majd ISO UTC instant készül. Példa Europe/Budapest zónában: `2026-09-20 14:30` → `2026-09-20T12:30:00.000Z` → PostgreSQL ugyanazt az instantot tárolja → GET ISO instant → display ismét `2026-09-20 14:30`.
- **Edit conversion:** módosított local idő ugyanígy alakul. Ha az időmező érintetlen, az eredeti pontos instant marad meg, beleértve az őszi ismétlődő óra második előfordulását és a másodperc/milliszekundumot.
- **Backend parse:** kötelező `Z` vagy explicit numerikus offset, valós naptári dátum/idő, maximum ±14:00. Implicit timezone és normalizálható lehetetlen dátum tiltott.
- **Display:** browser-local `Intl.DateTimeFormat`, nincs date-only slice vagy dupla konverzió.
- **OVERDUE:** OPEN és `dueAt < now`; az exact-now nem lejárt, 1 ms-mal korábbi lejárt.
- **TODAY:** browser IANA zone alapján `[local 00:00, következő local 00:00)`. API default: Europe/Budapest.
- **UPCOMING:** OPEN és `dueAt > now`, a jelenlegi dokumentált üzleti definíció szerint a mai későbbi rekord is része lehet.
- **COMPLETED:** kizárólag COMPLETED; `completedAt DESC`, stabil `id DESC` tie-breaker.
- **DST:** PostgreSQL külön konvertálja a két lokális éjfélt. A 23 és 25 órás budapesti nap automated DB tesztje zöld; a frontend a tavaszi nem létező időt elutasítja, az őszi első/második előfordulást dokumentáltan kezeli.

## Concurrency és tranzakciók

| Scenario | Eredmény |
| --- | --- |
| Complete + complete | PASS – automated parallel: azonos completedAt, pontosan egy special Activity |
| Edit + complete | PASS – automated parallel: metadata megmarad, végül COMPLETED, nincs lost update |
| Delete + complete | PASS – automated parallel: Follow-up biztosan törölt, egy delete Activity, legfeljebb egy completion Activity, nincs félkész tranzakció |
| Lead delete + Follow-up create | PASS – automated parallel: közös Lead lock + FK; nincs Lead és nincs orphan Follow-up |
| Activity insert failure create/edit/complete/delete | PASS – automated: az üzleti write rollbackel |

Az edit/complete/delete ugyanazt a `(organizationId, -followUpId-1)` advisory lockot használja. A kulcs nem ütközik a Pipeline `-1` organization lockkal vagy a pozitív Lead lockokkal; Int maximumon is PostgreSQL int tartományban marad. A create és Lead delete ugyanazt a pozitív Lead lockot használja, a composite FK a végső védelem.

## Lead/member lifecycle

- Lead delete cascade csak a kapcsolódó Follow-up rekordokat törli; az audit Activity laza entityId történetként megmarad.
- Member törlésekor a kézzel írt PostgreSQL 15+ célzott `SET NULL (assignedMemberId)` / `SET NULL (createdByMemberId)` csak a nullable member ID-t üríti, az organizationId megmarad. Valódi DB teszt zöld.
- Cross-tenant composite Lead és Member FK-k közvetlen invalid insertet/update-et is elutasítanak.

## Migration és inicializálás

- A Permission/Activity enum bővítés külön, korábbi migrációban commitálódik; a következő migráció biztonságosan használja az értékeket.
- A FollowUpType/Status, tábla, CHECK, composite FK-k és query-alapú indexek SQL-szinten ellenőrizve.
- Indexek: organization+status+dueAt; organization+assignee+status+dueAt; lead+organization+status+dueAt; member FK indexek.
- Meglévő organization hiányzó FOLLOW_UPS rekordja enabled=true; meglévő explicit false/custom rekord `ON CONFLICT DO NOTHING` miatt változatlan.
- Meglévő ADMIN/USER öt explicit Follow-up permissiont kap `ON CONFLICT DO NOTHING`; OWNER implicit marad, explicit rekord nélkül.
- Új organization/module és új member permissionök a centralizált `organizationModuleService` / permission flow-ból származnak.
- Upgrade pre-Follow-up üzleti adatokkal, ismételt deploy és fresh schema deploy automated PASS.
- Prisma validate két ismert warningot jelez a composite SetNull Prisma-reprezentáció miatt. A Prisma schema nem tudja kifejezni a migráció célzott oszloplistáját; a valódi SQL és DB lifecycle teszt bizonyítja a helyes működést. Ez nem nyitott finding, de jövőbeli generált migration review-ban megőrzendő.

## Pipeline és performance

- A board csak engedélyezett esetben selecteli a nested Follow-up kapcsolatot; külön frontend request nincs.
- Kizárólag OPEN, organization-scoped rekordok; `dueAt ASC`, `id ASC`, `take: 1`.
- Permission nélkül `nextFollowUp` property sincs.
- A queryszám 8 további card esetén sem nő cardonként: PASS – automated DB query instrumentation.
- Follow-up complete nem mozgat Pipeline stage-et és nem módosít LeadStatus-t; Pipeline move nem hoz létre Follow-upot.

## Frontend

- List: DataTable/Column, loading/empty/error, vízszintes mobil scroll, permission-aware actionök.
- Filters: search, status, type, assignee, period, Lead, sort backend querybe kerül.
- Pagination: mind a hét queryváltozás 1. oldalra resetel és a filter törlése nem állítja vissza a rejtett régi oldalt; sima reload megtartja az oldalt – automated.
- Create/edit drawer: inline validation, pending guard, local datetime conversion, create/edit only.
- View: `/follow-up/:id` full-page, direct param alapján önálló GET, nincs lista-state függőség; 404/error state.
- Alapadatok/Tevékenységek tab: Partner-stílus; Activity csak permissionnel és aktuális entity scope-pal.
- Complete/Edit/Delete actionök külön permission szerint; complete csak OPEN státuszban.
- Standalone és Lead-related szem action full-page detailre navigál; create/edit drawer marad.
- Lead integration teljes Follow-up + Lead view/module lánccal jelenik meg.
- Pipeline frontend az adatot saját permission guarddal is rejti.
- Dashboard konkrét Follow-up sora most a konkrét `/follow-up/:id` detailre visz.
- Sidebar és más detail/navigation elemek nem változtak.

## Ténylegesen futtatott ellenőrzések

| Ellenőrzés | Eredmény |
| --- | --- |
| Backend `npm test` | **50 passed / 0 failed / 7 skipped** |
| Follow-up DB + upgrade migration | **17 passed / 0 failed / 0 skipped** |
| Follow-up DB végső, módosítás utáni ismétlés | **16 passed / 0 failed / 0 skipped** |
| Leads DB regresszió | **13 passed / 0 failed / 0 skipped** |
| Pipeline DB + upgrade migration regresszió | **22 passed / 0 failed / 0 skipped** |
| Frontend `npm test` | **48 passed / 0 failed / 0 skipped** |
| Frontend ESLint | **PASS** |
| Frontend production build | **PASS**, meglévő >500 kB chunk warning |
| Prisma validate | **PASS**, két fent dokumentált SetNull warning |
| Prisma generate | **PASS** |
| Backend syntax/check | **PASS**, 56 source + 3 Follow-up tesztfájl; az utólag módosított tesztet a DB runner is parse-olta/futtatta |
| `git diff --check` és új fájl whitespace | **PASS** |

A normál backend futás hét opt-in DB suite-ot skipel; a Follow-up, Leads és Pipeline érintett suite-ok külön valódi, véletlen nevű, automatikusan eltávolított PostgreSQL sémákban lefutottak. Auth és Offers opt-in DB suite nem futott, mert a Follow-up változás nem érintette őket; unit/regressziós tesztjeik a normál backend futásban zöldek.

## Manuális ellenőrzés korlátai

- Hitelesített fizikai böngészős refresh/back/forward, mobil viewport és touch teszt ebben az auditban **NOT TESTED**. A direct route, param-alapú önálló adatbetöltés, navigációk, responsive osztályok és action handlerek automated JSX teszt + code review alapján rendben vannak.
- Nagy adathalmazú terhelési benchmark **NOT TESTED**. A releváns indexek és a Pipeline konstans queryszám automated módon ellenőrzött.

## Következő fázis

A Lead → Partner conversion nem része ennek az auditnak és nem került implementálásra.
