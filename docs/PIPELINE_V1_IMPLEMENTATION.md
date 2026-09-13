# Pipeline v1 implementáció és lezáró audit

Kiindulás: frissen lekért origin/main, 0054128; a munkapéldány induláskor tiszta és azonos volt. JavaScript, meglévő Express service/controller/routes, RBAC, OrganizationModule, React guard, apiClient és drawer minták.

## Implementált funkciók

Szervezetenként több konfigurálható Pipeline; default kiválasztás; dinamikus, átnevezhető és sorrendezhető szakaszok; Lead besorolás, szakaszmozgatás és eltávolítás; Kanban board; név/cégnév keresés és felelős szűrés. A be nem sorolt Leadek külön UI oszlopban jelennek meg; ez nem adatbázis-szakasz.

A LeadStatus független marad: a Pipeline nem módosítja, a Lead státusz módosítása sem mozgat szakaszt. Egy másik Pipeline-ba áthelyezés előtt a Leadet a jelenlegi Pipeline-ból el kell távolítani. Más Pipeline-ban lévő Leadek nem jelennek meg a kiválasztott board be nem sorolt oszlopában.

## Adatmodell

- Pipeline: id, organizationId, name, isDefault, createdAt, updatedAt.
- PipelineStage: id, organizationId, pipelineId, name, position, createdAt, updatedAt. Az organizationId az összetett tenant FK védelem része.
- LeadPipelinePosition: id, organizationId, leadId, pipelineId, pipelineStageId, createdAt, updatedAt.

leadId unique: legfeljebb egy aktív Pipeline tagság. PipelineStage pipelineId+position unique: nincs dupla sorrend. PostgreSQL partial unique index: legfeljebb egy default Pipeline szervezetenként. Összetett FK-k: Lead+szervezet, Pipeline+szervezet, szakasz+Pipeline+szervezet.

Foglalt szakasz és Pipeline törlése 409; a kapcsolatok RESTRICT védettek. Üres Pipeline törlésekor a Leadek nem törlődnek; default törlésekor a következő megmaradó Pipeline lesz default. Legalább egy, legfeljebb 100 szakasz támogatott Pipeline-onként.

## Backend

Minden endpoint előtt auth, requireOrganization, requireModule("PIPELINE").

| Endpoint | Permission és további modul |
| --- | --- |
| GET /api/pipelines | PIPELINE_VIEW |
| GET /api/pipelines/:id | PIPELINE_VIEW |
| POST /api/pipelines | PIPELINE_CREATE |
| PATCH /api/pipelines/:id | PIPELINE_EDIT |
| DELETE /api/pipelines/:id | PIPELINE_DELETE |
| GET /api/pipelines/:id/board | PIPELINE_VIEW + LEADS enabled + LEADS_VIEW |
| POST /api/pipelines/:id/stages | PIPELINE_EDIT |
| PATCH /api/pipelines/:id/stages/:stageId | PIPELINE_EDIT |
| DELETE /api/pipelines/:id/stages/:stageId | PIPELINE_DELETE |
| PATCH /api/pipelines/:id/stages/reorder | PIPELINE_EDIT |
| PATCH /api/pipelines/:id/leads/:leadId/stage | PIPELINE_EDIT + LEADS enabled + LEADS_VIEW |

Stage move payload: { stageId: number }, eltávolítás: { stageId: null }. Reorder: { stageIds: number[] }, a Pipeline összes szakaszának egyszeri felsorolása kötelező.

Pipeline create/PATCH: name, isDefault, opcionálisan stages. A stages sorrendje adja a position értékeket; PATCH során meglévő szakasz id+name, új szakasz name. A drawer teljes konfigurációját egy tranzakcióban mentjük. Ha a konfiguráció meglévő szakaszt töröl, PIPELINE_DELETE is szükséges, és a foglaltsági ellenőrzés érvényes.

Strict validation: ismeretlen mező, hibás típus, whitespace név, null nem nullable mezőn, string/boolean JSON ID, ismételt ID és hibás board filter kontrollált 400. PATCH omitted mező megmarad. URL ID pozitív Int, JSON ID csak szám.

## Frontend

/pipeline: Workspace → ModuleRoute PIPELINE → PermissionRoute PIPELINE_VIEW → ModuleRoute LEADS → PermissionRoute LEADS_VIEW. Sidebar ugyanezen négy feltétellel látható.

Pipeline selector a defaultot nyitja, hiányzó default esetén az elsőt. Board egy requestből, szakaszonkénti Lead request nélkül. Kártyák: név, cégnév, felelős, forrás, Lead státusz; név a meglévő /lead/:id teljes oldalas adatlapot nyitja.

Desktop native HTML drag/drop; touch és billentyűzet alternatíva: Szakasz módosítása select, eltávolítás opcióval. Nem adtunk hozzá drag/drop libraryt. Nincs optimistic átrendezés: API hiba esetén a board változatlan; siker után újratöltés.

Beállítások és create a meglévő jobb oldali drawer mintával: fél képernyős desktop szélesség, mobil teljes szélesség, overlay, transition, Escape, overlay close, header/footer, scrollozható body, body lock, Mégse/Mentés, wrapper+inner form. Pipeline név, default jelölés, szakaszok hozzáadása/átnevezése/átrendezése/törlése. CREATE/EDIT/DELETE gombok permission aware. Pipeline permission csoport a settings oldalon.

## Security és concurrency

Minden üzleti query organization-scoped. Stage ownership a scoped Pipeline definíció alapján ellenőrzött, az összetett DB FK-k további védelmet adnak. Board response nem tartalmaz raw kapcsolótáblát, teljes OrganizationMembert, auth/session vagy organization objektumot. PIPELINE_VIEW önmagában csak definícióhoz ad hozzáférést; Lead adatot nem ad.

Szervezeti, tranzakciós PostgreSQL advisory lock sorosítja a konfigurációt, default kezelését és mozgatást. Lead move a meglévő Lead edit/delete lockját is használja. Mozgatás és Activity ugyanabban a tranzakcióban történik; Activity hiba mindent visszagörget. Párhuzamos besorolás nem hozhat létre két tagságot; same-stage no-op nem naplóz.

Reorder egy tranzakció: átmeneti negatív pozíciók, végleges pozitív sorrend. Egy bulk update készíti elő a pozíciókat. A konfigurációs tranzakció timeoutja a támogatott 100 szakaszhoz igazodik.

## Activity

LEAD / PIPELINE_STAGE_CHANGED. Első besorolás, valódi váltás és eltávolítás naplózott. Metadata: Pipeline ID/név, from/to stage ID/név. Láthatóság: ACTIVITY_VIEW + LEADS enabled + LEADS_VIEW + PIPELINE enabled + PIPELINE_VIEW.

A szűrés a DB queryben, a limit előtt történik; a dashboard külön Activity queryje is ugyanazt a hozzáférési ellenőrzést használja. A dashboardhoz nem adtunk új KPI-t vagy widgetet.

## Migration

20260913120000_add_pipeline: három tábla, összetett FK-k, unique/indexek, négy permission, PIPELINE_STAGE_CHANGED action. PIPELINE ModuleKey már létezett, nem került újra létrehozásra.

Meglévő szervezetek module és ADMIN/USER permission backfillt kapnak, a korábbi modulok konvenciója szerint. Meglévő disabled module rekord megmarad, OWNER nem kap explicit permission rekordot. Default Értékesítés Pipeline és hét induló DB szakasz jön létre. Meglévő Leadek automatikusan nem kerülnek szakaszba.

Új organization inicializálás a centralizált initializeOrganizationModules flow-ban hívja a pipelineInitializationService-t. A default inicializálás idempotens.

A migrationt csak elkülönített tesztsémára alkalmaztuk; az alkalmazás adatbázisára még futtatandó a backend könyvtárából:

```powershell
npx prisma migrate deploy
npx prisma generate
```

Ezután backend újraindítás és a munkamenet frissítése szükséges az új module/permission adatokhoz.

## Tesztek és ellenőrzések

| Ellenőrzés | Eredmény |
| --- | --- |
| Backend teljes alapcsomag | 44 passed / 0 failed / 4 opt-in skipped |
| Pipeline integration/database, külön futtatva | 15 passed / 0 failed |
| Frontend teljes csomag | 16 passed / 0 failed |
| ESLint | PASS |
| Production build | PASS, meglévő nagy bundle figyelmeztetés |
| Prisma validate | PASS |
| Prisma generate | PASS |
| Backend syntax | PASS |
| git diff --check | PASS |
| Prisma schema → schema SQL diff összevetés | PASS |

A Pipeline DB csomag külön véletlen nevű sémában telepíti a teljes migration láncot, valódi middleware/controller/service teszteket futtat, majd eltávolítja a sémát. Meglévő alkalmazásadatot nem módosít.

Lefedés: tenant GET/PATCH/DELETE és stage/Lead támadások; cross-Pipeline stage; permission matrix; disabled/hiányzó Pipeline és disabled Leads; board membership/unassigned/search/assignee; stage ordering; strict validation és omitted PATCH; occupied deletes; move/no-op/removal/Activity rollback; konkurens besorolás/default; közvetlen DB FK/unique; 100 szakaszos reorder; migration/backfill/default init.

Frontend tesztek: stage ordering és board mapping; action visibility; a tényleges JSX komponens eseménykezelőinek headless futtatása drag/dropra és select move/removalra; viewer/pending state; a tényleges page move handler API hiba esetén változatlan boardot és egyetlen hibajelzést ad. Új teszt framework nincs. Fizikai böngészős drag/touch és vizuális smoke tesztet nem végeztünk.

## Audit findings

- P2 / PERMISSION: a dashboard saját Activity queryje az entity jogosultság alapján új Pipeline move eseményt is visszaadhatott volna PIPELINE_VIEW nélkül. Javítva: közös canViewPipelineActivities check és DB action exclusion; dashboard regressziós teszt.
- P3 / PERFORMANCE: nagy stage reorder sok egymás utáni update-tel a default tranzakciós timeoutba ütközhetett volna. Javítva: bulk előkészítő update és konfigurációs timeout; 100 stage valódi DB regressziós teszt sikeres.

Nyitott P0/P1/P2/P3 finding nincs a végleges implementációban. Az új funkcióhoz nem került Follow-up, automation, forecast, conversion vagy Offers workflow.

## Módosított fájlok

- backend/prisma/schema.prisma
- backend/prisma/migrations/20260913120000_add_pipeline/migration.sql
- backend/src/services/pipelineInitializationService.js
- backend/src/services/pipelineService.js
- backend/src/controllers/pipelineController.js
- backend/src/routes/pipelineRoutes.js
- backend/src/server.js
- backend/src/services/organizationModuleService.js
- backend/src/services/activityService.js
- backend/src/controllers/activityController.js
- backend/src/services/dashboardService.js
- backend/test/pipelineController.test.js
- backend/test/pipeline.database.test.js
- backend/test/dashboardService.test.js
- web/src/pages/PipelinePage.jsx
- web/src/components/pipeline/PipelineBoardComponent.jsx
- web/src/components/pipeline/PipelineFormComponent.jsx
- web/src/components/pipeline/pipelineDisplay.js
- web/src/App.jsx
- web/src/components/Sidebar.jsx
- web/src/components/activity/ActivityFeed.jsx
- web/src/pages/ActivityPage.jsx
- web/src/pages/SettingsPermissionsPage.jsx
- web/test/pipelineDisplay.test.js
- web/test/pipelineInteractions.test.js
- docs/PIPELINE_V1_IMPLEMENTATION.md

## Böngészős smoke teszt

Migration után: /pipeline default board; új és több Pipeline kiválasztása; drawer mentés/overlay/Escape/body lock; stage rename/reorder/create/delete; foglalt törlés hiba; card drag/drop desktopon; select move/remove touchon és billentyűzettel; API hiba esetén változatlan board és egy toast; keresés/felelős filter; disabled/view-only/edit/create/delete permission nézetek; /lead/:id navigáció; Activity és dashboard hozzáférési határok.

## Végső státusz

PIPELINE V1 LEZÁRHATÓ ✅
