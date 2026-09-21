# Szűrési alaprendszer (Filtering Foundation V1)

A Filtering Foundation V1 a Lead és Partner listák típushelyes szűrését biztosítja mind az alapadatok (Core fields), mind a dinamikus egyéni mezők (Custom Fields) mentén. A struktúra kanonikus, JSON-alapú reprezentációt használ, amely közvetlenül újrahasznosítható a jövőbeli Mentett Nézetek (Saved Views) funkcióhoz.

---

## 1. Kanonikus adatstruktúra (Canonical Filter Representation)

Minden egyes szűrőfeltétel egy egységes, szigorúan validált objektumként jelenik meg a `filters` tömbben:

```json
[
  {
    "field": {
      "type": "CORE",
      "key": "name"
    },
    "operator": "CONTAINS",
    "value": "Acme"
  },
  {
    "field": {
      "type": "CUSTOM_FIELD",
      "customFieldId": 42
    },
    "operator": "GREATER_THAN",
    "value": 500000
  },
  {
    "field": {
      "type": "CUSTOM_FIELD",
      "customFieldId": 18
    },
    "operator": "IS_EMPTY",
    "value": null
  }
]
```

### Szabályok:
- **Többszörös szűrők**: Maximum 20 szűrő adható meg kérésenként.
- **Kapcsolat**: Minden megadott szűrő között **ÉS (AND)** logikai kapcsolat érvényesül.
- **Kombináció a meglévő szűrőkkel**: Az összetett szűrők összefűződnek a meglévő gyorsszűrőkkel (pl. keresőszöveg, státusz, forrás, felelős, partnertípus, rendezés).
- **Mentett nézetek kompatibilitása**: A struktúra nem tartalmaz frontend-specifikus vagy ephemeral állapotot; közvetlenül perzisztálható leendő Saved Views konfigurációként.

---

## 2. Szerveroldali regiszter és biztonság (Security & Allowlist)

A szerver soha nem fogad el tetszőleges SQL oszlopneveket vagy lekérdezési fragmentumokat.

1. **Core Filter Registry (`filterRegistry.js`)**:
   - `LEAD`: `name`, `companyName`, `status`, `source`, `email`, `phone`, `assignedMember`, `createdAt`.
   - `PARTNER`: `name`, `type`, `email`, `phone`, `website`, `taxNumber`, `address`, `createdAt`.
   - Bármilyen ismeretlen mezőkulcs `400 Bad Request` hibával elutasításra kerül.

2. **Custom Field ellenőrzés**:
   - Az adatbázisból egy kötegelt lekérdezéssel ellenőrizzük, hogy a `customFieldId`:
     - Az aktuális szervezet (`organizationId`) tulajdonában van-e (tenant isolation).
     - A megfelelő entitástípushoz (`LEAD` vagy `PARTNER`) tartozik-e.
     - Aktív-e (`isActive: true`).
   - Inaktív, idegen szervezethez tartozó vagy nem létező mező esetén a kérés `400 Bad Request` választ kap.

3. **Típus- és operátorvalidáció (`filterValidation.js`)**:
   - Csak a mezőtípushoz hozzárendelt operátorok engedélyezettek.
   - Az érték típusa szigorúan ellenőrzött (számok, dátumok, boolean, opciók ellenőrzése).

---

## 3. Támogatott típusok és operátorok

| Mezőtípus | Támogatott operátorok | Magyarázat |
|---|---|---|
| **TEXT / TEXTAREA** | `CONTAINS`, `EQUALS`, `NOT_EQUALS`, `IS_EMPTY`, `IS_NOT_EMPTY` | Kis- és nagybetűfüggetlen keresés, üresség vizsgálat |
| **NUMBER / MONEY** | `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `GREATER_THAN_OR_EQUAL`, `LESS_THAN`, `LESS_THAN_OR_EQUAL`, `IS_EMPTY`, `IS_NOT_EMPTY` | Valódi numerikus összehasonlítás PostgreSQL `NUMERIC` típussal |
| **DATE** | `EQUALS`, `BEFORE`, `AFTER`, `ON_OR_BEFORE`, `ON_OR_AFTER`, `BETWEEN`, `IS_EMPTY`, `IS_NOT_EMPTY` | Kronológiai összehasonlítás PostgreSQL `DATE` típussal (`YYYY-MM-DD`) |
| **DATETIME** | `EQUALS`, `BEFORE`, `AFTER`, `ON_OR_BEFORE`, `ON_OR_AFTER`, `BETWEEN`, `IS_EMPTY`, `IS_NOT_EMPTY` | Időbélyeg alapú összehasonlítás |
| **BOOLEAN** | `EQUALS`, `IS_EMPTY`, `IS_NOT_EMPTY` | Logikai egyezőség (`"true"` / `"false"`) |
| **SELECT** | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `IS_EMPTY`, `IS_NOT_EMPTY` | Megengedett opciók szerinti szűrés |
| **MULTI_SELECT** | `CONTAINS_ANY`, `CONTAINS_ALL`, `IS_EMPTY`, `IS_NOT_EMPTY` | JSONB tömb vagy többértékű egyezőség |
| **MEMBER** | `EQUALS`, `NOT_EQUALS`, `IS_EMPTY`, `IS_NOT_EMPTY` | Szervezeti tag ID alapú szűrés |

---

## 4. Típushelyes PostgreSQL EAV kiértékelés és Legacy védelem

Az egyéni mezők értékei a `CustomFieldValue` táblában szövegesként (`value: String`) tárolódnak (EAV minta).

A korábbi lexikografikus string-összehasonlítási hiba elkerülésére a backend hibrid kiértékelési stratégiát alkalmaz:

### Numerikus és Dátum konverzió Regex védelemmel:
A PostgreSQL típuskonverzió (`::numeric`, `::date`) előtt reguláris kifejezéssel megvizsgáljuk a mező értékét:
- Numerikus minta: `btrim("value") ~ '^-?[0-9]+(\.[0-9]+)?$'`
- Dátum minta: `btrim("value") ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`

**Előnyök:**
- **Nincs 500-as hiba**: Ha a táblában régebbi, hibás vagy sérült string maradt (pl. `"nem-szám"`), a PostgreSQL nem dob `invalid input syntax` hibát; a feltétel biztonságosan `false`-ra értékelődik.
- **Helyes sorrend**: A `> 20` feltételre a `100` és `1000` illeszkedik, míg az `5` és a `20` nem.

### Natív Prisma model query:
A szöveges, logikai és opciós szűrések (`BOOLEAN`, `SELECT`, `TEXT`, `IS_EMPTY`, `IS_NOT_EMPTY`) natív Prisma lekérdezéssel futnak, kihasználva a Prisma automatikus tenant- és séma-izolációját.

---

## 5. Frontend architektúra és felhasználói felület

### UI alapelvek és design megőrzése:
- **Zero layout regression**: A meglévő táblázatok (`min-w-[1120px]`, `w-[26%]`, padding, színek) és a Partner kártyanézet kinézete semmilyen mértékben nem változott.
- **Eszköztár (Toolbar)**: A szűrő menü a meglévő `lightButton` / `lightControl` stílusú gombbal nyitható/csukható:
  - Üres állapot: `Szűrők` (diszkrét lefelé mutató nyíllal)
  - Aktív állapot: `Szűrők (2)` kiemelt zöld szegéllyel és betűszínnel.
  - Nyitott állapotban az ikon forgása jelzi a nyitottságot.
- **Lista feletti szűrőpanel (`web/src/components/filtering/FilterPanel.jsx`)**:
  - Közvetlenül a lista / táblázat felett lenyíló kártya panel (`rounded-xl border border-[#dbe1df] bg-white p-5 mb-5 shadow-[0_1px_2px_rgba(24,39,43,0.02)]`).
  - **Közvetlen mezőcímkék (Labels)**: A felhasználónak nem kell mezőt és operátort választania: a listában szereplő minden oszlop/mező külön címkével (label) és hozzá illeszkedő beviteli mezővel jelenik meg egy átlátható, reszponzív (1–4 oszlopos) rácsban.
  - **Típusspecifikus beviteli mezők**:
    - Szöveg / Textarea: szöveges beviteli mező (automatikus `CONTAINS` keresés).
    - Kiválasztó (Select): legördülő lista a lehetséges opciókkal (`EQUALS`).
    - Felelős (Member): szervezeti tagok legördülő listája (`EQUALS`).
    - Logikai (Boolean): `Összes` / `Igen` / `Nem` választó (`EQUALS`).
    - Szám / Pénzösszeg: Min - Max (Tól - Ig) tartomány (`GREATER_THAN_OR_EQUAL`, `LESS_THAN_OR_EQUAL`).
    - Dátum: Kezdő és Záró naptárválasztó (`BETWEEN`, `ON_OR_AFTER`, `ON_OR_BEFORE`).
  - **Gombok**: "Szűrés" (Alkalmazás), "Szűrők törlése" (összes beviteli mező kiürítése), "Bezárás".
  - **Enter billentyű támogatás**: Bármelyik szöveges vagy numerikus mezőben megnyomott Enter azonnal alkalmazza a szűrést.
  - **Lapozás szinkronizáció**: Új szűréskor a lista automatikusan az 1. oldalra ugrik.

---

## 6. Új entitás vagy Saved Views bővítési útmutató

1. **Új entitástípus bevonása (pl. PROJECT, OFFER)**:
   - Vegyük fel az entitást a `filterRegistry.js` `CORE_FILTER_REGISTRY` objektumába.
   - Adjuk meg a frontend oldali `CORE_FILTER_DEFINITIONS` regiszterét a `web/src/components/filtering/filterRegistry.js`-ben.
   - A kontrollerben kössük be a `normalizeAdvancedFilters` hívást és adjuk át a service rétegnek.
2. **Mentett Nézetek (Saved Views) implementálása**:
   - A `filters` tömb séma-módosítás nélkül elmenthető a leendő `SavedView` modell `filters` JSON mezőjébe.
   - A lista betöltésekor az éppen aktív Saved View szűrői közvetlenül átadhatók a meglévő `getLeads` és `getPartners` service metódusoknak.
