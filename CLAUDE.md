# CLAUDE.md — Moneymanager

Lokale Haushalts-Finanz-App (Tauri 2 + React + TS, hexagonaler portabler TS-Kern, SQLite lokal).

## Wo die Wahrheit liegt
Fachliche Doku (DDD-Modell, ADRs, Design-System) wird **außerhalb dieses Repos** geführt.
Im Repo steht der lauffähige Code; die UI-Begriffe folgen dem Glossar
(Rücklage → *Spartopf*, Rückstellung → *Puffer*, Liquidität → *Verfügbares Geld*).

## Befehle
```bash
npm run tauri dev   # Desktop-Fenster
npm run dev         # nur Frontend (Webview ohne SQLite-Plugin)
npm test            # Vitest (Kern, Use-Cases, Repositories, UI — alles via sql.js/jsdom)
npm run coverage    # dito + Coverage über das GESAMTE Projekt (Ziel: 90 % global)
npm run typecheck
```
Die Shell-cwd driftet zwischen Calls — Pfade absolut halten.
`tsc --noEmit | tail` verschluckt den Exit-Code; lieber `tsc --noEmit; echo $?`.

## Dev-Fallen
- **WebView-Cache (Tauri dev):** Erscheinen Frontend-Änderungen NICHT im Fenster trotz
  korrektem Code? Erst prüfen, ob Vite ausliefert (`curl -s localhost:1420/src/.../X.tsx`),
  dann Live-Banner-Test. Cache hängt (überlebt App-Neustart): App schließen,
  `~/Library/WebKit/moneymanager` + `~/Library/Caches/moneymanager` löschen, neu starten.
  DB bleibt unberührt. Nicht stundenlang den Code verdächtigen — erst das prüfen.
- **Echte DB für Diagnose:** `~/Library/Application Support/de.netmechanics.moneymanager/moneymanager.db`
  read-only via `sqlite3` inspizieren, statt Datenbugs zu raten.
- **Daten-Lade-Race:** Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen
  setzen; gestaffelte `setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen
  (z. B. Kategorie-Lookup → fälschlich „ohne Kategorie").

## Schichten
`core` (reine Domäne, kein IO) ← `application` (Use-Cases + Ports) ← `adapters`
(`persistence/` SQLite via tauri-plugin-sql, `ui/` React). `core` importiert nichts nach
außen. Tests als `*.test.ts` neben dem Code.

## Tests schreiben
- **Kern/Use-Cases:** reine Funktionen, In-Memory-Fakes für Ports. Node-Umgebung, schnell.
- **Repositories und UI:** laufen gegen echte In-Memory-SQLite (sql.js) — `getDb` wird per
  `vi.mock("../persistence/db")` umgebogen, `src/test/harness.tsx` liefert `frischeDb()`,
  `pluginApi()` (übersetzt die tauri-plugin-sql-API mit `$1`-Platzhaltern) und `rendere()`
  (rendert im EinstellungenProvider). Bewusst KEINE Repo-Attrappen: ein falsches
  Spalten-Mapping soll im Test auffallen, nicht erst in der App.
- **UI-Tests** brauchen `/** @vitest-environment jsdom */` als erste Zeile — sonst laufen
  auch die Kern-Tests unnötig in jsdom.
- Nach **Daten** suchen, die der Test selbst angelegt hat, nicht nach Formulierungen —
  sonst wird die Suite beim nächsten Wording-Durchgang reihenweise rot.

## Invarianten, die beißen
- **Geld = Integer Cent**, nie Float. Formatierung über `formatBetrag` (U+2212-Minus).
  Durchgesetzt wird das an der Anwendungsgrenze mit `istCent()` — jeder Use-Case, der
  Beträge annimmt, prüft damit. `parseBetrag` liefert `null` bei unplausibler Eingabe
  (Müll, Exponent, jenseits des sicheren Integer-Bereichs), statt still eine falsche Zahl
  zu erzeugen; es erkennt nachgestelltes Minus, U+2212 und Klammer-Notation.
- **Datumsangaben:** `parseIso` WIRFT bei nicht existierenden Daten („2026-02-31", Tag oder
  Monat `00`). Die Regex-Prüfungen der Use-Cases prüfen nur die FORM — die Existenz prüft
  der Kern. `toIso` polstert das Jahr vierstellig, weil die gesamte Datumsordnung über
  String-Vergleiche läuft.
- **Charakter = `Aufwand | Ertrag | Umschichtung`** (erfolgs- vs. liquiditätswirksam;
  Umschichtung = Aktivtausch, keine Ausgabe).
- **Migrationen** in `adapters/persistence/migrations.ts`: versioniert, **forward-only,
  append-only** — bestehende Versionen nie editieren, neue Version anhängen.
  `migrate()` klammert jede Migration mit ihrem Versionseintrag in eine Transaktion.
  ⚠️ Ob `BEGIN`/`COMMIT` über tauri-plugin-sql auf derselben Connection landen, ist NICHT
  verifiziert (der Test läuft gegen sql.js) — vor dem nächsten Schema-Schritt an der
  echten DB prüfen.
- **`IstBuchung` trägt KEINEN Empfänger/Verwendungszweck** — die stehen am `Umsatz`
  (Import-Kontext); Join über `Umsatz.istbuchungId` für Detail-/Reporting-Ansichten.
- **Tauri = nur Hülle:** Domänen-/Backend-Logik läuft als TS in der Webview, nicht in Rust
  (`src-tauri/` ist bewusst dünn). Logische Trennung (hexagonal), kein eigener Backend-Prozess.

## Offene Schuld vor der nächsten Import-Quelle
Der `rohHash` (Dedup-Schlüssel) enthält seit 2026-08-15 die Gegenpartei. Bestehende
Umsätze tragen weiter den ALTEN Schlüssel. Solange jede Quelle native IDs liefert
(Finanzguru), ist das folgenlos — die Dedup entscheidet dort über die ID. Vor der ersten
ID-losen Quelle (Bank-CSV, FinTS) müssen die Bestands-Hashes einmalig neu berechnet
werden, sonst deduppt der erste Abruf nicht gegen den Bestand und legt alles doppelt an.
Der Backfill braucht die Konto-IBAN, die nicht am Umsatz, sondern am Zahlungskonto liegt.
Details in `application/import/rohHash.ts`.

## Sprache
Deutsch, Anrede „du", keine Emoji. Fachlich streng innen, alltagstauglich außen (Glossar).
