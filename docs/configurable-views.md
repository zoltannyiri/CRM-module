# Konfigurálható listanézetek

A konfigurálható listanézetek első verziója a Lead és Partner táblázatok oszlopainak láthatóságát és sorrendjét menti. A beállítás személyes, de mindig az aktuális `OrganizationMember` tagsághoz kötött, ezért ugyanaz a felhasználó másik szervezetben külön konfigurációt kap.

## Adatmodell és alapértelmezés

Az `EntityListPreference` egy tagság és egy `LEAD` vagy `PARTNER` entitástípus kombinációjához legfeljebb egy rekordot tárol. A verziózott JSON `columns` tömb kizárólag explicit `{ type: "CORE", key }` és `{ type: "CUSTOM_FIELD", customFieldId }` elemekből áll. Az `organizationId` a tenant-szűrést és az összetett tagsági idegen kulcsot erősíti; szervezet vagy tagság törlése kaszkádoltan eltávolítja a preference rekordot.

Mentett override hiányában a backend a bevezetés előtti oszlopkészletet adja vissza. A Lead alapnézet: Név, Cégnév, Státusz, Forrás, E-mail, Telefon, Felelős, Létrehozás. A Partner alapnézet: Partner neve, Típus, Email, Telefon, Weboldal. A Név mindkét listán kötelező.

## Engedélyezett oszlopok

A `viewPreferenceRegistry.js` tartalmazza az engedélyezett core oszlopok szerveroldali listáját. A kliens nem küldhet tetszőleges adatbázismezőt. Custom field oszlop csak az aktuális szervezet aktív, megfelelő entitástípusú mezőjére hivatkozhat stabil `customFieldId` alapján. Egy később deaktivált mezőt a feloldás kihagy, de emiatt a tárolt JSON-t nem írja át.

## API és jogosultság

- `GET /api/view-preferences/:entityType` – mentett vagy alapértelmezett nézet és választható oszlopok.
- `PUT /api/view-preferences/:entityType` – a sorrendben küldött `columns` validálása és mentése.
- `DELETE /api/view-preferences/:entityType` – a személyes override törlése és visszaállás az alapnézetre.

Az organization és a member minden esetben a hitelesített request kontextusából származik. Lead preference-hez `LEADS` modul és `LEADS_VIEW`, Partner preference-hez `PARTNERS` modul és `PARTNERS_VIEW` szükséges. Nincs külön preference permission, és az API nem fogad member- vagy organization-azonosítót a kliensből.

## Frontend és adatbetöltés

A `ColumnSettingsDrawer` ugyanazt a Tailwind/PrimeIcons megjelenést követi, mint a többi drawer. Az alap- és egyéni mezők kapcsolhatók, a kiválasztott oszlopok fel/le gombbal rendezhetők, majd menthetők vagy alaphelyzetbe állíthatók. A Lead és Partner táblák ugyanazt a normalizált oszlopformát használják, miközben a saját core cella-renderelésük megmarad. A custom értékek típusspecifikus formázást kapnak (`MONEY`, `BOOLEAN`, `DATE`, `DATETIME`, `MULTI_SELECT`).

A list endpoint a feloldott preference-ből csak a látható custom field ID-ket veszi át. A lista rekordjainak értékeit egyetlen `CustomFieldValue` lekérdezés tölti be `entityId IN (...)` és `customFieldId IN (...)` feltételekkel, majd memóriában entitynként mapeli. Nincs soronkénti frontend request vagy adatbázis-lekérdezés.

## Új entitástípus hozzáadása

Új típushoz bővíteni kell a Prisma enumot, a backend core registryt és default oszlopokat, az access mappinget, valamint a frontend default/render definíciót. A lista service-ben ugyanazt a bulk custom-value betöltést kell használni. A migration, tenant-szűrés, kötelező azonosító oszlop és permission tesztek minden új típusnál szükségesek.

## SELECT option módosítás

Az első verzió blokkolja a már használt SELECT vagy MULTI_SELECT option eltávolítását `409 CUSTOM_FIELD_OPTION_IN_USE` válasszal. Így nem törlődik és nem válik rejtett legacy értékké üzleti adat. Előbb az érintett rekordokat kell másik értékre módosítani vagy kiüríteni, utána az option eltávolítható.
