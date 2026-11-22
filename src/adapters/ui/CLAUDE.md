# `ui/` — die Oberfläche

## Die Grenze, die hier gilt

**Die UI importiert weder `core/` noch `adapters/persistence/`.** Alles kommt aus genau zwei
Richtungen:

- `../../application` — Vokabular (Domänentypen, wertfreie Helfer) und Use-Case-Typen
- `../dienste` — die gebundenen Aufrufe

Was AUSWÄHLT oder RECHNET, liegt hinter einem Use-Case, auch beim reinen Lesen: ein Screen
bekommt fertige Sichten, keine Rohteile. Eine Domänenregel, die die UI umgehen KANN, umgeht
sie irgendwann. Geprüft in `src/architektur.test.ts`, die Ausnahmeliste ist leer und bleibt
es.

## So wird hier gebaut

Bevor eine neue Komponente entsteht, in dieser Reihenfolge:

1. **Im Bausteinkatalog unten nachsehen.** Gibt es etwas für diesen Zweck, wird es benutzt —
   auch wenn es nicht genau passt.
2. **Passt es nicht ganz, wird der Baustein erweitert, nicht kopiert.** Eine zweite Fassung
   „fast wie die andere" ist der Fehler, gegen den diese Regel steht: drei Aufklapptabellen
   mit drei Polsterungen sahen an drei Stellen verschieden aus, und eine Verbesserung an
   einer erreichte die anderen nie. Optionen am Baustein sind billiger als Doppelbauten.
3. **Neu gebaut wird im Bereichsordner.** Braucht es ein zweiter Bereich, wandert es nach
   `bausteine/` — gemessen, nicht geschätzt (siehe unten, „Gliederung").
4. **Rechnen und Auswählen gehört nicht hierher** (oben): fehlt der Wert, fehlt ein Feld in
   der Sicht des Use-Cases.
5. **Texte in `src/i18n/i18n.ts`**, de und en zugleich; Platzhalter mit `{{doppelt}}`.
6. **Schmal ansehen.** Unter 700 px fällt `DataTable` zusammen, unter 1100 px die
   Seitenleiste; was dabei bricht, bricht beim Nutzer auf dem Telefon.
7. **Test über die Oberfläche bis ins Schema** (unten, „Tests für Screens"), gesucht nach
   Daten und i18n-Schlüsseln, nicht nach Wortlaut.

## Gliederung — was wo liegt

Ein Ordner je Navigationsbereich, dazu `bausteine/` für alles Geteilte (eigene Regeln dort
in `bausteine/CLAUDE.md`). Die Einsortierregel: **was zwei oder mehr Bereiche benutzen, ist
ein Baustein; was einer benutzt, gehört in dessen Ordner** — auch wenn es allgemein aussieht.

| Ordner | was |
|---|---|
| `uebersicht/` | „wie stehe ich gerade da": Monatskarten, Budgets, Was da ist, Depotstand (Regeln in `uebersicht/CLAUDE.md`) |
| `analyse/` | „wie war es über einen Zeitraum": Register Verlauf, Kategorien, Ausblick, Planrechnung, Befunde, Depot, Bericht |
| `budgets/` | die monatlichen Budgets: Tabelle, Dialog, Verlauf, Vorschläge |
| `ruecklagen/` | Rücklagen beider Sorten in EINER Liste und ihr Verlauf (`RuecklageVerlauf`), Abschliessen (`AbschlussDialog`), „Wartet auf Zuordnung" (`WartetKarte`), Vorschläge (`VorschlaegeKarte`), Fluss, Tacho, „Wo das Geld liegt" (je Konto, `GeldJeKontoKarte`) |
| `vermoegen/` | Nettovermögen mit Verlauf, die Vorsorge mit dem, was für sie zählt, die Depots mit Verrechnungskonto, Vermögenswerte und Schulden als Werte zum Stichtag |
| `vertraege/` | Verträge und ihre Erkennung |
| `kontoauszug/` | der Kontoauszug („Buchungen", `ScreenId` `konten`) samt Depotauszug, Vormerkungen, `SammelDialog` und `DublettenVergleich`; der Buchungsdialog selbst liegt in `bausteine/` (unten) |
| `kontenverwaltung/` | Konten anlegen, bearbeiten und auflösen, der Abgleich und der Reiter Bankzugänge (`ScreenId` `kontenverwaltung`) |
| `fints/` | die Bankzugänge (`BankzugaengeScreen`, `Bankprofilkarte`) — ein Reiter der Kontenverwaltung, kein eigener Navigationsbereich |
| `import/` | Dateiimport (der Beleg) |
| `review/` | der Navigationsbereich Import (`ImportBereich`, `ScreenId` `import`) und die Review-Inbox, in der Belege verbucht werden |
| `training/` | Werkbank der Kategorie-Erkennung (Regeln in `training/CLAUDE.md`) |
| `einstellungen/` | Einstellungen, Exporte, Konfigurationsimport |
| `zugang/` | Sperrbildschirm, Verschlüsselung |
| `bausteine/` | alles, was zwei oder mehr Bereiche benutzen |

Die Navigation steht in `bausteine/AppShell.tsx`, die Zuordnung zur Komponente in
`App.tsx`, die gebundenen Aufrufe in `../dienste.ts`.

Der Ordner heißt `training/`, weil die Navigation den Bereich so nennt; fachlich ist es
`klassifikator/` wie in Kern und Anwendung. Die bereichsübergreifenden Tests (`screens`,
`interaktion`, `formulare`, `leereZustaende`) liegen direkt in `src/adapters/ui/`.

Die Inbox liegt in `review/` und nicht bei `import/`, obwohl sie im Menü unter Import
steht: sie öffnet den Buchungsdialog und fragt Dubletten, Umbuchungen und Verträge — alles
Bereiche ÜBER dem Beleg (Rangfolge in der `CLAUDE.md` des Projekts). `review/` steht deshalb auf
der Stufe der Sichten. Der Bereich `ImportBereich` geht mit, weil er die Inbox als Reiter
zeigt: wer zusammensetzt, steht mindestens so hoch wie das Höchste, das er zeigt. Ein
eigener Ordner statt einer losen Datei direkt in `src/adapters/ui/`, weil dort nur die
bereichsübergreifenden Tests liegen und ein Screen dort von keiner Regel erfasst wäre.

Aus demselben Grund liegt der Kontoauszug in `kontoauszug/` und nicht in `konten/`, obwohl
seine `ScreenId` `konten` heisst: er zeigt die Buchungen eines Kontos mit Einordnung,
Dubletten, Verträgen und Depot — alles Bereiche über dem Konto. `konten` ist in der
Rangfolge das Konto selbst (Typ, Klasse, IBAN) und steht weit unten; ein Bildschirm, der
darüber zusammenzieht, kann nicht dort liegen. Die `ScreenId` bleibt, sie ist ein
Schlüssel und kein Name.

Die Kontenverwaltung liegt aus demselben Grund in `kontenverwaltung/` (wie ihre
`ScreenId`): sie zeigt Konten UND Bankzugänge, und beim Anlegen eines Kontos wird der
Bankzugang gewählt (`KontoAnlegenModal`). Die Bankzugänge selbst liegen in `fints/`, auf
der Stufe des Bankabrufs — sie sind ein Reiter, den die Kontenverwaltung zeigt, und
brauchen nichts über dem Abruf. Was beide zeigen, die Herkunft der Zeilen eines Kontos
(`HerkunftBereich`), ist damit ein Baustein.

## Bausteinkatalog — wofür es schon etwas gibt

| Bedarf | Baustein |
|---|---|
| Fläche um einen Inhalt | `Card` (nie eine Karte IN einer Karte, unten) |
| Seitenkopf mit Aktion | `PageHead`; Bereich mit Reitern: `Bereich`, die Reiter allein `Registerleiste` |
| Tabelle | `DataTable` — Sortierung, Seiten, Zeilenklick (auch per Tastatur), schmale Form. Ist eine Zeile klickbar, dann die GANZE, und ihr Bezeichner steht als Link da — kein eigener Link in einer Spalte. Haben nur manche Zeilen etwas zu öffnen: `istKlickbar`, die übrigen bleiben ganz Text |
| Bezeichner in einer Zeile, der aufklappt | `Zeilenlink` |
| Liste, die unter einer Zeile aufklappt | `Aufklapptabelle`; nur die Fläche: `Aufklappflaeche`; Höhe: `aufklappen.ts` |
| Buchungen unter einer Auswertung (Budget, Kategorie) | `Buchungsliste` (auf `Aufklapptabelle`), Zeilen als `Buchungszeile` aus `application` |
| Abschnitt im Dialog, auf- und zuklappbar | `Klappblock` |
| Karte(n), die nur schmal einklappen | `SchmalKlappblock` (auf `Klappblock`) |
| Kennzahl | `KPIStat`; Balken mit Rahmen: `CoverageTrack` (mit `marke` für ein Soll — EIN Balken statt zwei) |
| Etikett | `Pill` — sagt, was etwas IST |
| Wahl im Formular | `Auswahl`; in einer Tabellenzeile: `Zeilenauswahl`; Kategorie: `CategoryPicker` |
| Datum | `Datumsfeld`, angezeigt über `useDatum()` |
| Feld plus Knopf nebeneinander | `Feldzeile`; Formularfeld: `FormField` |
| Ankreuzen | `Kaestchen` (Text als `children`, ohne Text `label`) |
| Zwei bis vier Ansichten oder Filter, genau einer gilt | `Umschalter` |
| Kleiner grauer Erklärtext | Klasse `.hinweis` — nicht `muted` plus `fontSize` |
| Nebeneinander / untereinander mit Abstand | `Zeile` / `Stapel` (`bausteine/Anordnung`), Abstand aus `--sp-1`…`--sp-5` |
| Trennlinie, auch mit „oder" | `Trenner` (Base UI `Separator`); Block mit Linie darüber: Klasse `.abschnitt` |
| Schriftgrösse | nur Tokens (`--fs-*`, neu `--fs-tabelle`, `--fs-ui`) — `schriftgroessen.test.ts` |
| Eine Buchung ansehen, anlegen, bearbeiten | `BuchungDetail` (unten, „Der Buchungsdialog liegt in Teilen") |
| Eine von mehreren Antworten | `Optionsgruppe` mit `Option` — bisher nur im Buchungsdialog |
| Knopf | `Button` — `primary` Hauptaktion, `link` gedämpfte Nebenaktion („Abbrechen"), `laeuft` sperrt während einer Handlung; Zeilenaktion als Icon: `IconButton` |
| Dialog | `Modal` (Base UI `Dialog`; `warnung` für Rückfragen); vor dem Löschen: `Loeschfrage` |
| Fehler, den kein Screen am Ort zeigen kann | `fehlerMelden` aus `Meldungen` (Base UI `Toast`) — nie still `.catch(() => [])` |
| Bankabruf, TAN | `AbrufDialog`, `TanDialog` |
| Geld, Prozent, Farbe | `useGeld()`, `useProzent()`, `geldFarbe.ts` (unten) |
| Enter bestätigt | `beiEnter` |
| Schmales Fenster in JS | `useSchmal` — nur wenn sich das Markup ändert, sonst CSS |
| Hervorhebung in Fliesstext | `betonung` mit `<Trans>` |
| Ein Bereich, in dem noch nichts steht | `LeererZustand` — Satz, Erklärung, Knöpfe; keine Karte (unten, „Leere Zustände") |
| Ein Schritt der Einrichtung samt Knopf in seinen Bereich | `Einrichtungsschritt` (`EinrichtungsschrittZeile`, `EINRICHTUNG_ZIEL`) |
| Was auf einem Konto gebunden ist: Ansprüche, gedeckt, Stand, gebunden, frei | `BelegungTabelle` (ohne Karte; im Kontoauszug und in „Wo das Geld liegt") |
| Eine Rücklage anlegen oder bearbeiten, beide Sorten | `ruecklagen/RuecklageDialog` (nur im Bereich Rücklagen) |
| Verlauf als Balken mit Rahmen oder Stand | `VerlaufChart` (Form `monatlich` für ein Budget, `ruecklage` für eine Rücklage) |

Was nicht in der Tabelle steht und an zwei Stellen gebraucht wird, ist ein Kandidat für
einen neuen Eintrag — und gehört dann auch hier hinein.

## Rücklagen und Budgets — eine Sache, ein Wort

Geld, das Monat für Monat für etwas Späteres zurückgelegt wird, heisst überall
**Rücklage**; ein **Budget** ist ein Rahmen für einen Monat. Seit 2026-11-15 galt das in
der Oberfläche, seit Migration 81 auch im Modell (`src/core/ruecklagen/CLAUDE.md`). Die
Regel dahinter ist die des Nutzers: eine Sache heisst überall wie ihr Bereich. Die beiden
Sorten heissen in der Oberfläche **„läuft weiter"** und **„wird abgeschlossen"** — keine
anderen Wörter dafür.

Was das für den Code hier heisst:

- **Tabelle, Dialog und Verlauf der Budgets liegen in `budgets/`**, seit nur noch dieser
  Bereich sie benutzt; bis Paket 4 lagen sie in `bausteine/`, weil der Bereich Rücklagen
  sie für die aufbauenden mitbenutzte, und die Umleitung ihrer Wörter (`budgetTexte`)
  ist mit ihnen gegangen. Geteilt bleibt nur der Chart (`bausteine/VerlaufChart`).
- **EINE Liste, EIN Dialog für beide Sorten.** Der Bereich Rücklagen zeigt jede Rücklage
  in derselben Liste (`RuecklagenScreen`, Zeilen fertig aus `Ruecklagenzeile`): Name,
  Sorte als Pille, Kategorie, Rate, Stand (auch im Minus), mit Ziel der Fortschritt, das
  Konto oder dass keines da ist; mit Kauf und Nutzungsdauer klein neben dem Stand der
  Wertverlust bis heute und was fehlt (seit Migration 82, nur Anzeige,
  `src/core/ruecklagen/CLAUDE.md`), im Verlauf als zweite, gestrichelte Linie ab dem
  Kauf. Der Name öffnet den Verlauf (`RuecklageVerlauf`). An
  einer, die abgeschlossen wird, steht „abschließen" (`AbschlussDialog`, ohne
  Buchungswahl, seit Paket 5) — nur beim Altbestand ohne Kategorie weiter „ausgebucht"
  (`AusbuchungDialog`, mit Buchungswahl). Welcher Knopf, sagt die Sicht (`abschlussweg`). `RuecklageDialog` legt beide an:
  Kategorie Pflicht, Sorte beim Anlegen wählbar und danach nur angezeigt, Ziel mit Frist
  ODER Rate als Reihe mit „gilt ab". Ein übernommener Rücklagenvorschlag
  (`VorschlaegeKarte`) öffnet ihn vorbelegt. Er liegt in `ruecklagen/`, seit nur noch
  dieser Bereich ihn öffnet; bis 2026-11-16 lag er in `bausteine/`, weil der
  Rücklagenvorschlag im Bereich Budgets stand.
- **Jeder Bereich schlägt nur vor, was in ihm landet** (seit 2026-11-16): Budgets nur
  Budgets, Rücklagen nur Rücklagen, aus EINER Einstufung (`src/core/budgets/CLAUDE.md`,
  „Vorschläge"). Keine Karte trägt eine Spalte „Art", und kein Bereich öffnet den Dialog
  des anderen. Die Texte stehen je Bereich (`budgets.vorschlaege…`,
  `ruecklagen.vorschlaege.…`), auch wo sie gleich lauten.
- **Gerechnet wird nicht hier.** Die Zeile „Rücklagen" der Ergebnisrechnung ist schon im
  Kern die Summe aller Rücklagen, und was aus einem Budget herausgerechnet ist, sagt
  `abgezogen` am Budgetstand (über die Zuständigkeit).

## Leere Zustände

**Ist in einem Bereich nichts da, sagt er in zwei, drei Sätzen, was hierher gehört, wozu
es gut ist und was als Nächstes dran ist — mit dem Knopf, der es tut oder dorthin führt.**
Seit 2026-11-15, über `bausteine/LeererZustand.tsx`. Der Anlass: die Karte „Damit die
Zahlen stimmen" führt in die Bereiche, und dort stand für einen neuen Nutzer oft nur eine
leere Tabelle oder „Noch keine Verträge." Vermögen hatte als einziger Bereich einen
Absatz mit Knöpfen (`vermoegen.leer`) und ist das Vorbild; es nutzt den Baustein (noch)
nicht.

Vier Regeln dazu:

- **Der vorhandene Satz bleibt im Wortlaut stehen** (`kopf`), ergänzt wird darunter.
  Vorhandene Texte werden nicht ungefragt umformuliert.
- **Der nächste Schritt folgt aus dem Bestand, nicht aus einem gemerkten Zustand.**
  Ohne Buchungen führt ein Bereich, der aus ihnen vorschlägt (Verträge, Budgets), zuerst
  in den Import; gibt es Vorschläge, zeigt der Satz auf sie statt nur „anlegen" zu sagen.
  Die Antwort kommt aus der Sicht des Use-Cases (`hatBuchungen`), nicht aus einer Zählung
  im Screen.
- **Erst nach dem Laden.** Vorher steht nur der alte Satz da; sonst zeigte ein voller
  Bestand einen Augenblick lang die Erklärung oder einen falschen nächsten Schritt.
- **Navigiert wird über ein freiwilliges `onNavigate`**, wie bei Übersicht und
  Kontoauszug: ohne Shell (Tests) steht kein Knopf da, der nichts tun kann.

**Am Ende des Imports steht der nächste offene Schritt der Einrichtung**
(`review/NaechsterSchritt.tsx`), nach dem Verbuchen in der Inbox. Er kommt aus derselben
Kernfunktion wie die Karte der Übersicht (`einrichtungsstand`, Feld `naechster`, geholt
über `einrichtungLaden`), und dieselbe Zeile zeichnet ihn (`bausteine/Einrichtungsschritt`).
Ist die Einrichtung fertig, steht dort nichts — auch kein „alles erledigt".

Die Übersicht trägt ihren leeren Zustand nur ganz am Anfang (keine Buchung, kein Plan)
und ohne Knopf: dann steht „Damit die Zahlen stimmen" immer direkt darüber und trägt ihn.
Geprüft in `leereZustaende.test.tsx`, je Bereich leer und gefüllt.

## Zahlen anzeigen

**`useGeld()`** — nie eigenes `toFixed`, nie an der Locale-Schicht vorbei. Die Farbe kommt
aus **`bausteine/geldFarbe.ts`**, und zwar jede: Plus grün, Minus `--warn-deep`, Null
neutral. Eine Farbregel für die ganze App, nicht eine je Screen.

**Seit 2026-09-13 deckt sie die ganze AUSWERTUNG ab, nicht nur Beträge.** Vorher liefen
dort zwei Farbsprachen nebeneinander, die beide `--warn-deep` malten: `geldFarbe` meinte
„Geld geht raus", der `tone` an `KPIStat` meinte „sieh hin". Weil sie gleich aussahen,
konnte niemand die Frage beantworten, die eine rote Zahl stellt — und es schlich sich
Unsinn ein, der keinem auffiel: Ausgaben mit `tone={summeAus < 0 ? "warn" : "default"}`
(also immer warn), Einnahmen fest auf grün, und die positive Seite in derselben KPI-Reihe
mal grün, mal neutral.

Vier Fragen, vier Funktionen — die vollständige Begründung steht im Kopf der Datei:

| | gerichtet (Vorzeichen = Richtung) | ungerichtet, an einer Schwelle |
|---|---|---|
| **Text** | `geldFarbe(betrag)` | `warnFarbe(bedingung)` |
| **Fläche** (Balken, Linie) | `flussFarbe(betrag)` | `warnFlaeche(bedingung)` |
| **`KPIStat`** | `tone={geldTon(betrag)}` | `tone={warnTon(bedingung)}` |

Zwei Dinge daran sind Entscheidung und nicht Mechanik:

- **Eine ungerichtete Grösse wird nie grün.** Prozent, Monate, Anzahl, blosse Höhe: amber
  an der Schwelle, sonst neutral. Dieselbe Überlegung, aus der die Handlungsbedarf-Karte
  verschwindet, statt „alles in Ordnung" zu schreiben — ein Dauergrün liest nach zwei
  Wochen niemand mehr, und dann fällt das Rot daneben auch nicht mehr auf.
- **Eine Fläche nimmt `--ok`/`--warn`, Text `--ok-deep`/`--warn-deep`.** Das ist keine
  zweite Sprache, sondern das Tokenset: die `-deep`-Paare sind die Töne für Schrift auf
  hellem Grund. Dieselbe Aussage, eine Stufe heller.

**Eine Kante bleibt offen, und sie ist bewusst offen:** ein BESTAND ist kein Fluss. „Plus
ist grün" heisst bei einer Einnahme „Geld kam herein", bei einem Kontosaldo nur „es ist
Geld da" — und weil das der Normalfall ist, steht an der Saldo-Spalte dauerhaft Grün, also
genau das, was der Punkt darüber verbietet. Eine dritte Klasse („Bestand: positiv neutral,
negativ warn") wäre genauer und ist NICHT gebaut: die Grenze zwischen Bestand und Fluss
zöge jeder anders — ein Budgetrest ist beides, je nachdem wonach man fragt. Wer sie doch
zieht, zieht sie in `geldFarbe.ts` und nirgends sonst.

**Bewertung gehört weiterhin in die Pille und in die Meta-Zeile.** Dort steht ein WORT,
und ein Wort wird gelesen — eine grüne Pille „stabil" sagt etwas, eine grüne Zahl sagt nur
„grün". `Pill variant="ok"` bleibt deshalb erlaubt.

Durchgesetzt wird das von **`farbregel.test.ts`** über `analyse/`, `uebersicht/` und
`budgets/`: dort darf kein `color:` und kein `fill=` eines der vier Tokens direkt tragen.
Nur diese drei Bereiche, weil nur dort Zahlen nebeneinander stehen, über die eine Farbe
etwas aussagt — ein Verwerfen-Knopf, der amber ist, sagt nichts über Geld. Kartenrahmen
sind ausgenommen: eine Karte, die selbst die Warnung ist, trägt keinen Betrag.

**`useProzent()`** für Anteile (0…1) — dieselbe Regel, derselbe Ort. Sie stand hier lange
nur für Geld, und direkt daneben formatierten die Depot-Anteile mit `toFixed`: im Deutschen
„12.5 %" statt „12,5 %". Eine Locale-Regel, die nur für einen Zahlentyp gilt, wird für die
anderen umgangen. `stellen` ist die Obergrenze, eine glatte Zahl bleibt glatt.

Zeilenaktionen sind Icons über `bausteine/IconButton.tsx` — ihr Text wandert in
`title`/`aria-label`, statt zu verschwinden.

## Bedienteile: Base UI, wo immer es eines gibt

**Base UI (`@base-ui/react`) ist die einzige UI-Bibliothek im Projekt**, und sie liefert
ausschliesslich MECHANIK — kein Aussehen. Alles Sichtbare kommt weiterhin aus `app.css`
und den Tokens.

**Die Regel (seit 2026-11-10): Hat Base UI ein Bedienteil für den Zweck, steht es unter
unserem Baustein — auch dort, wo der Eigenbau heute funktioniert.** Vorher galt das
Gegenteil („fast alles von Hand, Base UI als Ausnahme"), und der Preis zeigte sich an
Stellen, die mit der Maus niemand bemerkt: der eigene `Button` liess sich nicht sperren,
und als er es konnte, warf ein natives `disabled` den Fokus auf `<body>`. Base UI hatte
die Antwort darauf (`focusableWhenDisabled`) im Paket liegen, das längst installiert war.
Tastatur, ARIA, Fokus und Sperren sind genau die Hälfte eines Bedienteils, die man beim
Eigenbau vergisst — und die Bibliothek ist dafür schon da.

Drei Dinge, die dazugehören:

- **Gekapselt, nie direkt.** Ein Screen importiert `Button`, nicht `@base-ui/react/button`.
  Der Baustein trägt unsere Props (deutsch, wo sie Fachliches sagen: `laeuft`,
  `gesperrt`), die Klassen und die Entscheidungen; wird die Bibliothek je getauscht, ist
  es eine Datei je Bedienteil.
- **Das Aussehen hängt an Base UIs Datenattributen**, nicht an Pseudoklassen, wo die beiden
  auseinanderlaufen: gesperrt heisst `[data-disabled]`, weil Base UI über `aria-disabled`
  sperrt und `:disabled` deshalb nie greift. Wer eine Regel schreibt, sieht im
  `…DataAttributes.d.ts` des Teils nach, was gesetzt wird.
- **Eigenbau bleibt, wo Base UI nichts hat** — und das gehört dann begründet: der Kalender
  im `Datumsfeld` (es gibt keinen Datepicker), `DataTable` (keine Tabelle). Was Base UI
  liefert, kommt trotzdem von dort: der Kalender sitzt in einem Base-UI-`Popover`.

Wo es heute steht:

| Baustein | statt | woher die Mechanik |
|---|---|---|
| `bausteine/Auswahl` | `<select className="field">` im Formular | Base UI `Select` |
| `bausteine/Datumsfeld` | `<input type="date">` | Base UI `Popover`, Kalender von Hand |
| `bausteine/Button` | eigener `<button>` mit Inline-Stil, roher `.linkbtn` | Base UI `Button` |
| `bausteine/Modal` | Eigenbau mit Nummernstapel plus `Dialog.jsx` | Base UI `Dialog`, mit `warnung` `AlertDialog` |
| `bausteine/Kaestchen` | `<input type="checkbox">` mit `accentColor` | Base UI `Checkbox` |
| `bausteine/Optionsgruppe`, `bausteine/Richtungswahl` | `<input type="radio">`, eigene `role="radiogroup"` | Base UI `RadioGroup`/`Radio` |
| `bausteine/FormField` (um ein natives Feld) | `<label htmlFor>`, Hinweis unverbunden | Base UI `Field` |
| `bausteine/CoverageTrack` | zwei `div` ohne Rolle | Base UI `Meter` |
| Seitensteuerung der `DataTable` | `<input type="number">`, rohe Knöpfe | Base UI `NumberField`, `Button` |
| `bausteine/Registerleiste` (samt Inhalt) | `role="tab"` von Hand, loses `tabpanel` | Base UI `Tabs` |
| `bausteine/Klappblock` und jede Zeile, die aufklappt | `aria-expanded`/`role="button"` von Hand | Base UI `Collapsible` |
| `bausteine/Umschalter` | drei Segmentleisten aus `aria-pressed`-Knöpfen | Base UI `ToggleGroup` |
| „Nur Dubletten" im Kontoauszug | `aria-pressed` von Hand | Base UI `Toggle` |
| Schalter in den Einstellungen | Kästchen | Base UI `Switch` |
| `kontenverwaltung/BankSuche` | Vorschlagsliste ohne Rollen | Base UI `Combobox` |
| Zahlenfeld im `AbrufDialog` | `<input type="number">` | Base UI `NumberField` |
| `bausteine/Meldungen` | geschluckte Fehler, leere Listen | Base UI `Toast` |
| `IconButton`, `Zeilenlink`, die Knöpfe in Shell (auch die Leiste unten), Kalender, Picker | roher `<button>` | Base UI `Button` |

**Was bewusst Eigenbau bleibt** — jede Stelle mit Grund, und `bedienteile.test.ts` lässt
nur genau diese durch:

- **Die Schublade in `AppShell`.** Sie ist schmal eine Schublade und breit eine Spalte —
  EIN Element in drei Formen, umgeschaltet per CSS. Base UI `Drawer` hiesse, die
  Navigation je Breite in zwei Renderwege zu teilen; ihre drei Schliesswege sind getestet.
- **`CategoryPicker`.** Geprüft gegen `Combobox` (inline im Modal) und verworfen: eine
  Gruppe bleibt sichtbar, wenn nur ein Kind passt, markiert wird aber der erste TREFFER —
  Base UI markiert bei eigenem Filter das erste Element, also die Gruppe. Und die Zeilen
  sind Knöpfe in der Tab-Reihenfolge (Begründung im Kopf der Datei).
- **`Zeilenauswahl`** (natives `<select>`), **der Kalender im `Datumsfeld`** (kein
  Datepicker in Base UI) und **`DataTable`** (keine Tabelle).
- **Die Zeile der `Aufklapptabelle`** ist ein `<tr>` mit `role="button"`: sie öffnet eine
  Buchung, und ein Knopf kann keine Tabellenzeile sein.
- **Kein Tooltip-Baustein** — `title` trägt so weit; wer einen baut, nimmt `Tooltip`.

Wer eines davon anfasst und den Grund nicht mehr findet, stellt um, statt weiterzubauen.

**Kästchen und Optionsfelder sind in Tests keine `<input>` mehr.** Base UI rendert ein
`span` mit Rolle und hängt ein verstecktes `input` daneben. Daraus folgt zweierlei:
`.checked` gibt es am gefundenen Element nicht — `toBeChecked()` liest `aria-checked`
und trägt in beiden Fällen —, und `getByLabelText` findet ZWEI Elemente, weil das
versteckte Feld mit im `<label>` liegt. Gegriffen wird deshalb über
`getByRole("checkbox" | "radio", { name })`.

**Die alte Grenze bleibt als Begründung für den Kalender gültig:** ein Auswahlfeld braucht
Combobox-Semantik (Knopf und Liste über ARIA verbunden, Tippsuche, Rollen) — das schreibt
man nicht nebenbei richtig. Ein Kalender ist dagegen ein `role="grid"` mit einem
Fokuspunkt, den die Pfeiltasten bewegen; das ist klein und klar.

Was das für neuen Code heisst: **im Formular `Auswahl` und `Datumsfeld` nehmen**, nicht die
nativen Elemente. Seit 2026-08-25 ist der Bestand vollständig gewandert — in `ui/` steht
kein `<select>` und kein `<input type="date">` mehr (ausserhalb von `Zeilenauswahl`, die
bewusst ein natives `<select>` bleibt: sie ist so gross wie eine Pille und braucht keine
eigene Liste). Ein neu auftauchendes natives Element ist damit kein Rest mehr, sondern ein
Rückschritt.

**Tests wählen darin über `auswahlWaehlen`** aus `testwerkzeug/harness` —
`userEvent.selectOptions` greift nicht mehr, weil eine `Auswahl` ein Knopf mit einer Liste
im Portal ist. Zwei Fallen stecken in dem Helfer, beide gemessen: die Liste wird über ihre
Klasse gesucht und nicht über die Rolle (native `<option>`-Elemente anderer Felder auf
derselben Seite melden dieselbe), und eine gerade geschlossene Liste bleibt für ihre
Animation noch kurz im DOM (`:not([data-closed])`). Wer das übersieht, klickt etwas an, die
Auswahl bleibt stehen, und die Zusicherung fällt erst am Ende um.

Ein `Datumsfeld` zeigt die **Landesschreibweise** (`12.08.2026`), nicht ISO — Tests, die
den Anzeigewert prüfen, erwarten sie. Getippt werden darf trotzdem ISO, das erkennt es
immer.

## Der Buchungsdialog liegt in Teilen

`bausteine/BuchungDetail.tsx` trägt das Formular — alle drei Rollen (anlegen, Entwurf
prüfen, bearbeiten) in EINER Maske, und das bleibt so: jede Erweiterung soll an einer
Stelle ankommen statt an dreien. Was daneben liegt, braucht den Zustand der Maske nicht
und wurde deshalb 2026-08-25 herausgezogen:

| Datei | beantwortet |
|---|---|
| `VertragsBlock` | gehört diese Zahlung zu einem Vertrag? |
| `DublettenBlock` | steht sie womöglich schon ein zweites Mal da? |
| `BuchungsHerkunft` | woher sie kommt — reine Anzeige |
| `EinordnungsBlock` | was sie kaufmännisch ist, und WARUM — reine Anzeige (unten, „Die Einordnung an der Zeile") |
| `RuecklagenwahlBlock` | welche Rücklage sie trägt — offen, wo mehrere an ihrer Kategorie hängen oder schon entschieden ist; sonst hinter „Aus einer Rücklage bezahlt?" für eine Rücklage von ausserhalb der Kategorie (seit 2026-11-22, eigene Gruppe in der Auswahl); speichert sofort |
| `JournalBlock` | was daran geändert wurde — und der Weg zurück |
| `Richtungswahl` | Höhe und Richtung des Betrags, samt der Zerlegung dahinter |
| `SplitModal` · `ZurUmbuchungModal` | die beiden Folge-Dialoge (S-7, S-1) |
| `GegenbeinBlock` | wo die zweite Seite einer Umschichtung im Entwurf steckt |
| `useBetragUndRichtung` · `useGegenbeinwahl` | der Zustand dazu, als Hooks (seit 2026-11-10) |

**Seit 2026-11-10 liegt auch Zustand ausserhalb des Formulars**: Höhe und Richtung des
Betrags und die Wahl der Gegenseite sind je ein Hook — drei bzw. fünf Zustände, die nur
einander kennen. Ein `useReducer` über das ganze Formular ist geprüft und verworfen: die
einzige Kopplung (Kategorie → Charakter → Richtung) läuft in genau einer Funktion
(`kategorieSetzen`), und ein Reducer hätte nur sie umbenannt. Dasselbe Muster gilt für
grosse Screens: ein Dialog bekommt seinen Zustand selbst (`RuecklageDialog`,
`AusbuchungDialog`, `UmbuchungModal`), ein geschlossenes Thema wird ein Hook
(`useRegisterfilter`, `useSammelauswahl`), mehrere Karten in einer Datei werden mehrere
Dateien (`einstellungen/VerhaltenKarten`, `StammdatenKarten`).

**Das Kriterium war nicht die Grösse, sondern die Abhängigkeit:** herausgezogen ist, was
seine Daten hereinbekommt und Entscheidungen zurückmeldet. Der Rest gehört zum Formular
und bleibt dort, auch wenn die Funktion damit die grösste im Bereich ist.

**Der Dialog liegt in `bausteine/`, mit allen seinen Teilen** (seit 2026-11-17). Ihn öffnen
Kontoauszug, Übersicht, Analyse, Budgets, Rücklagen und die Inbox — sechs Bereiche, und
damit ist er nach der Regel oben ein Baustein. In `buchung/` stand er
als Bereich auf der Stufe der Buchung und kannte von dort Verträge und Rücklagen, die
darüber liegen (Rangfolge in der `CLAUDE.md` des Projekts). Die Teile gehen mit, obwohl
jeder nur vom Dialog benutzt wird: sie sind Teile EINES Bausteins, und in `buchung/`
zurückgelassen hätten sie dieselben Bezüge behalten. Was er liest, kommt aus
`application/buchungsdetail.ts` und `application/einordnungssicht.ts`, beide direkt in
`src/application/`, weil sie Verträge, Rücklagen und Budgets zusammenziehen.

Weil ihn auch der Bereich Rücklagen öffnet, gilt für ihn die Baustein-Prüfung der Grenze
Rücklagen/Budgets (`bausteine/CLAUDE.md`): kein Use-Case und kein Schlüssel der Budgets.
Den Typ `Budget` erreicht er nur über `einordnungssicht`, also über eine Datei, die
bereichsübergreifend abwägt — das ist der Weg, den die Regel ausdrücklich offen lässt.

Die Teile der grossen Screens im Absatz darüber (`RuecklageDialog`, `useRegisterfilter` …)
sind keine `bausteine/`-Kandidaten: sie werden von genau einem Screen benutzt
(siehe `bausteine/CLAUDE.md`).

Eine eigene Datei nur für „Tag und Monat" stand hier lange als **Ausnahme von der
Ausnahme** — vier Zeilen, drei Nutzer im selben Bereich, kein natürlicher Besitzer, und
über `BuchungDetail` zu importieren hätte einen Ring gebaut. **Sie ist weg**, und der Grund
ist nicht, dass die Begründung falsch war, sondern dass sie zu klein gedacht war: dieselben
vier Zeilen standen in acht weiteren Varianten quer durch die Oberfläche, jede für sich
plausibel. Was sie ersetzt, ist `useDatum()` — siehe unten.

## Ein Datum formatiert `useDatum()`, nichts sonst

Dieselbe Regel wie bei `useGeld` und `useProzent`, und der Befund war der grösste von
dreien: die Formatierung stand an **neun** Stellen in vier Varianten — `datumKurz` zweimal
mit verschiedener Bedeutung, `datumLang` und `ddmmyyyy` je zweimal wortgleich kopiert,
dazu `ddmm`, `datumOhneJahr` und einmal inline in der Analyse. Zwei weitere Stellen gaben
das ISO-Datum **roh** in die Oberfläche.

**Und alle neun schrieben die deutsche Reihenfolge fest.** In einer englischen Oberfläche
stand damit `28.09.2026`, wo `9/28/2026` hingehört. Das ist nicht dieselbe Unsauberkeit wie
ein falsches Dezimalzeichen, sondern schlimmer: `05.03.` und `03/05/` sind dieselben Ziffern
mit anderer Bedeutung. Ausgerechnet `Datumsfeld` las die Reihenfolge längst aus `Intl` — die
Anzeige daneben tat es nicht.

Drei Formen, und die Wahl gehört dem Aufrufer:

| | zeigt (de) | wofür |
|---|---|---|
| `mitJahr` | `28.09.2026` | eine Zeile ohne Zusammenhang, aus dem sich das Jahr ergäbe |
| `kurz` | `28.09.26` | Listen, in denen das Jahr zählt und die Spalte schmal ist |
| `ohneJahr` | `28.09.` | Fenster von höchstens ein paar Monaten |

**`ohneJahr` ist kein Sparformat, sondern eine Aussage:** wer es nimmt, behauptet, dass das
Jahr aus dem Zusammenhang folgt. Im Kontoauszug tut es das nicht — dort stehen alle
Buchungen eines Kontos, nicht nur die des laufenden Jahres —, und deshalb steht dort
`mitJahr`.

Gerechnet wird in UTC (`Date.UTC` plus `timeZone: "UTC"`), wie im `Datumsfeld`: ein
ISO-Datum ist ein Kalendertag und keine Zeitangabe. Ohne die feste Zone zieht ein Rechner
westlich von Greenwich jeden Tag um einen zurück.

Für Helfer ausserhalb einer Komponente gibt es den Typ `Datum`, genau wie `Geld` — der
`JournalBlock` reicht ihn in seiner `Lesehilfe` durch.

## Farben nur über Tokens — und das dunkle Schema

**Seit 2026-11-10 folgt die App dem dunklen Schema des Systems** (`prefers-color-scheme`,
kein eigener Schalter). Möglich war das, weil die Farben in Tokens liegen: der dunkle Satz
steht in `styles/tokens/colors.css` und `shadow.css` unter derselben Medienabfrage und
überschreibt dieselben Namen. Am Bildschirm gemessen: jeder Text in jedem Bereich erreicht
dunkel den Kontrast von WCAG AA.

Drei Regeln, die daraus folgen:

- **Keine Farbe als Zahl** in `ui/` oder `app.css`. Was eine Zahl ist, bleibt im dunklen
  Schema hell. Auch Rückfallwerte (`var(--x, #fff)`) zählen dazu — siehe nächster Punkt.
- **Jedes `var(--…)` zeigt auf ein Token, das es gibt** (`styles/tokens.test.ts`). Bis
  2026-11-10 taten das acht Namen nicht: `--accent-soft`, `--danger`, `--sh-2`, `--bg`,
  `--font-mono`, `--radius-2` liefen still auf ihren Rückfallwert, `--fs-small` (elf
  Dateien), `--fs-lg` und `--surface-1` hatten keinen — dort erbte das Element einfach,
  und die kleinen Hinweistexte standen in der Grösse ihrer Umgebung.
- **Schrift auf einer Akzentfläche ist `--auf-akzent`**, nicht `#fff`: im Dunklen wird der
  Akzent hell, und Weiss darauf ist nicht mehr lesbar.

## Tabellenfilter sind kleiner als Formularfelder

Ein `.field` ist auf ein Formular ausgelegt: volle Breite, grosse Innenabstände, eigene
Zeile. Über einer Tabelle steht es dagegen NEBEN der Tabelle und konkurriert mit ihr um
Aufmerksamkeit — die Filterleiste wirkte dort wie das Hauptereignis der Karte, obwohl sie
nur einstellt, was darunter zu sehen ist.

Die Klasse **`tabellenfilter`** (in `app.css`) zieht sie auf Tabellengrösse zusammen. Sie
wirkt am Container **und** direkt am Feld: eine Leiste mit fünf Feldern beschriftet man
einmal, ein einzelner Monatswähler in einer Kartenkopfzeile braucht dafür keine Hülle, die
es sonst nicht gäbe. Die Masse sind nicht erfunden — die Filterleiste der Import-Durchsicht
trug sie längst als eigenen Inline-Stil und sah als einzige richtig aus.

**Seit 2026-11-22 trägt auch deren Suchfeld die Klasse** (`field tabellenfilter`) statt
des Inline-Stils. Der kannte keine Breite: schmal stand das Feld in 13 px — iOS zoomte
beim Antippen — und 28 px hoch. Breit verschiebt sich dadurch die Polsterung um einen
Pixel (5/9 statt 5/8), bewusst in Kauf genommen: ein Filter, der als einziger anders
aussieht, ist genau das, was die Klasse abschaffen sollte.

Die Regel dahinter ist dieselbe wie bei `Zeilenauswahl`: **die Grösse eines Bedienteils
folgt dem, wo es steht, nicht dem, was es tut.**

## Ein Knopf neben dem Feld, nicht darunter

`bausteine/Feldzeile` legt ein Feld und den Knopf, der dazugehört, in eine Zeile. Das ist
keine Kosmetik, sondern eine Aussage: **ein Knopf unter einem einzelnen Feld liest sich als
Abschluss eines Formulars** — obwohl er nichts abschickt. Neben dem Feld liest er sich als
das, was er ist: eine zweite Möglichkeit an derselben Stelle. „Wähl einen Vertrag ODER leg
einen neuen an", „stell die Sperre ODER sperre sofort".

**Die Regel für den Zweifelsfall:** steht über dem Knopf noch ein Feld, das er nicht meint,
gehört er nach unten — dafür gibt es `.form-actions`. Meint er genau das eine Feld daneben,
gehört er daneben.

Zwei Dinge stecken in der Klasse, und beide sind der Grund, warum es sie überhaupt braucht:

- **`align-items: flex-end`.** Ein `FormField` setzt die Beschriftung ÜBER das Feld. Mittig
  ausgerichtet stünde der Knopf auf halber Höhe zwischen Label und Feld, also auf keiner
  Linie mit irgendetwas.
- **`min-width: 0` am Feld.** `.field` ist `width: 100%`. In einem Flex-Container heisst
  das: es nimmt die ganze Zeile, und der Knopf bricht um. Genau das war im `VertragsBlock`
  der Fall — dort stand `display: flex` längst, und trotzdem lag nichts nebeneinander. **Ein
  Flex-Container allein reicht nicht, wenn das Kind auf seiner vollen Breite besteht**, und
  von aussen sieht das aus, als sei das Layout gar nicht gesetzt.

## Aus einer aufgeklappten Liste in die Buchung

Wo einzelne Buchungen stehen — unter einem Budget (Übersicht, Budget-Verlauf) oder unter
einer Kategorie (Analyse) —, führt der Klick in den Buchungsdialog. Das ist die Stelle, an
der man den Fehler SIEHT: eine Zeile in der falschen Kategorie fällt beim Durchsehen einer
Auswertung auf, nicht im Kontoauszug. Ohne diesen Weg musste man sie sich merken und dort
wiederfinden.

Die gemeinsame Klasse heisst **`buchungszeile`** (`app.css`) und trägt die Fläche beim
Überfahren. Ein blosser `cursor: pointer` reicht dafür nicht — er zeigt sich erst, wenn der
Zeiger schon draufsteht, und in einer Liste probiert niemand jede Zeile durch. Dieselbe
Überlegung wie bei `Zeilenlink`, nur für eine Zeile, die zu kurz für einen Link ist.

Zwei Dinge, die beim Einbauen zählen:

- **Der Baustein bekommt den Klick als Option** (`onBuchung`), er baut den Dialog nicht
  selbst. Wer ihn anbietet, muss danach die Sicht neu rechnen lassen — eine geänderte
  Kategorie verschiebt Geld zwischen Budgets, und der Ausblick daneben rechnet aus
  denselben Buchungen. Ohne die Angabe bleiben die Zeilen Text; ein Knopf, der nichts tut,
  wäre schlechter als keiner.
- **Nur was eine Buchung IST.** Ein geplanter Posten ohne `istId` beschreibt, was fällig
  wird — ihn zu öffnen hiesse, einen Dialog auf etwas zu zeigen, das es nicht gibt.

## Der Kontoauszug steht in zwei Karten

Kopf und Gebuchtes, beide über die ganze Breite. Die zweite liegt NEBEN der ersten und
nicht darin — keine Karte in einer Karte: die Klammer, die sie sonst umschlösse, stünde
zweihundert Zeilen weiter oben und wäre im Code nicht zu sehen. Deshalb prüft
`kartenschachtelung.test.tsx` diesen Fall mit.

**Das Geplante stand hier und steht jetzt in der Übersicht** (`uebersicht/VorschauKarte.tsx`).
Der Auszug beantwortet „was ist passiert"; eine Liste über die Zukunft daneben beantwortet
eine andere Frage im selben Bild. Und „was kommt noch auf mich zu" ist keine Frage EINES
Kontos — wer vier führt, musste vier Auszüge öffnen und zusammenzählen.

**Mit ihr ist auch das Raster gegangen.** Die beiden Listen teilten sich den Platz im
goldenen Schnitt zugunsten der Buchungen (1,618 : 1); als die Vorschau wegzog, blieb das
Grid mit einer Spalte stehen, und die Buchungstabelle endete bei knapp zwei Dritteln der
Breite — Platz, den nichts mehr beanspruchte. **Ein Raster überlebt die Karte nicht, die
es begründet hat**, und ein einspaltiges Grid sieht im Code aus wie Absicht.

**Der Screen ist so breit wie jeder andere** — und alle sind breiter geworden, siehe unten.
Ein eigener Deckel für diesen einen Bereich war der erste Versuch und fiel sofort auf: eine
Seite, die breiter aufzieht als alle Nachbarn, sieht nach einem Fehler aus und nicht nach
einer Entscheidung.

## Die Einordnung an der Zeile

Seit 2026-11-15 trägt jede Zeile des Kontoauszugs eine Spalte **Einordnung**
(`kontoauszug/EinordnungsPillen.tsx`): Einnahme, Fixkosten, laufende Kosten, „aus Rücklage …",
Vorsorge, Umbuchung, ungeplant, wartet auf Zuordnung. Der Buchungsdialog sagt dasselbe als Satz
mit der Begründung (`bausteine/EinordnungsBlock.tsx`) — „zählt als Fixkosten, weil sie dem
Vertrag … zugeordnet ist". Der Satz ist die eigentliche Hilfe: das Wort allein erklärt
niemandem ohne Rechnungswesen, warum eine grosse Ausgabe den Monat nicht belastet.

**Die Art kommt aus `core/einordnung.ts` und aus nichts sonst.** Der Weg dorthin ist
`application/einordnungssicht.ts`: es ruft `einordner` mit `einordnungskontext`
— derselbe Kontext, aus dem die Ergebnisrechnung der Übersicht rechnet — und hängt nur
die NAMEN von Budget und Vertrag an. Beide Oberflächen wählen danach Wort und Farbe, mehr
nicht. Der Grund für die eine Stelle: der Auszug ist der Ort, an dem man nachsieht, warum
eine Zahl in der Übersicht so aussieht. Sortierte er selbst, erklärte er früher oder später
eine Rechnung, die es nicht gibt. **Wer in einer der beiden Dateien eine Bedingung auf
Charakter, Kategorie oder Vertrag schreibt, baut die zweite Sortierlogik.**

Drei Entscheidungen daran:

- **Eine eigene Spalte, keine weitere Pille am Namen.** Am Namen stehen schon bis zu vier
  Pillen, und die sagen etwas über EINZELNE Zeilen. Die Einordnung hat jede; als Spalte
  liest man sie hinunter und sortiert nach ihr. Schmal wandert sie ohne Zutun in die
  zweite Zeile — die Tabelle setzt an keiner Spalte `schmal`.
- **Die Pille „Umbuchung" steht nur noch dort.** Bis dahin stand sie in der
  Kategorie-Spalte; beide zu zeigen wäre dasselbe Wort zweimal nebeneinander. Die
  Kategorie-Zelle eines Umbuchungs-Beins bleibt leer — kein Strich, der „noch
  einzusortieren" sagte.
- **Der Dialog zeigt den GESPEICHERTEN Stand.** Eine Vorschau auf das, was im Formular
  gerade eingestellt ist, müsste die Regel aus dem Kern in der Oberfläche nachbauen.

Eine aufgeteilte Buchung kann mehrere Einordnungen tragen (eingeordnet wird der Anteil);
gezeigt werden die verschiedenen, jede einmal.

**Seit Paket 3 des Umbaus gibt es eine Pille, die keine Art ist: „wartet auf Zuordnung".**
Gerechnet wird ein solcher Anteil als ungeplant; die Pille sagt statt „Ungeplant", dass an
ihm etwas zu tun ist — mehrere Rücklagen hängen an seiner Kategorie (`wartetAuf` an der
Einordnung). Sie trägt den gestrichelten Rahmen des Geplanten, keine Warnfarbe. Gewählt
wird im Buchungsdialog (`bausteine/RuecklagenwahlBlock`), mit einer `Auswahl` je Anteil;
was dort zur Wahl steht und ob überhaupt, sagt die Sicht (`ruecklagenwahl` am
Buchungsdetail), nicht der Block. Vorbelegt wird nichts. Entnahmen aus einer Rücklage sind EINE
Art (`ruecklage`), seit Migration 81 auch die aus dem früheren aufbauenden Budget; die
Pille nennt die Rücklage, wenn es eine gibt.

## Was im Konto steht, hat jemand belegt

Die Vorschau — heute in der Übersicht, damals neben dem Auszug — ZEIGT, was kommt; sie
bucht es nicht. Bis 2026-08-25 hing an jeder geplanten Zeile ein Kästchen „als bezahlt markieren", und ein Klick legte daraus eine
Ist-Buchung an (`quelle: "bezahlt-markiert"`). Damit stand im Konto eine Zahlung, die
niemand belegt hatte: die Bank kannte sie nicht, ein Beleg existierte nicht, und beim
nächsten Abruf kam die echte Zeile zusätzlich dazu.

**Eine Ist-Buchung entsteht nur noch auf zwei Wegen: aus dem Abruf/Import oder von Hand.**
Eine Hochrechnung ist kein dritter. Der Use-Case dahinter ist entfernt, geprüft in
`interaktion.test.tsx`.

**Seit 2026-08-29 sind auch die Reste weg.** `IstQuelle` kannte weiterhin
`"bezahlt-markiert"`, und `IstBuchung.planRef` gab es noch — beides nur zum Lesen, damit
ein Bestand mit solchen Zeilen sich nicht selbst widerspricht. Solche Zeilen gab es nie:
weder im Bestand noch in der Migrationsgeschichte trug eine Buchung den Verweis. Damit
war der Grund für die Schonung entfallen, und die Reste kosteten mehr als sie trugen —
allen voran eine Rangstufe im Monatsausblick, die als „eindeutig, schlägt alles"
dokumentiert war und nie griff.

Abgeräumt wurde genau das, was hier vorhergesagt stand: das Schema (Migration 62 nimmt
`plan_quelle_id`, `plan_faelligkeit` und ihren Unique-Index), der Monatsausblick (Status
`bezahlt` samt Pille) und die Projektion (`projiziereRegel` hatte einen Filter `bezahlt`,
den nur das Kontoregister füllte — mit einer immer leeren Menge).

**Der Typ `PlanRef` ist geblieben**, und der Unterschied ist der Punkt: er identifiziert
weiterhin eine PROJIZIERTE Zeile im Kontoregister. Was fiel, ist allein die Ist-Seite —
die Behauptung, eine Buchung könne einen Plan-Posten belegen.

## Mobile first — und was das heute schon heisst

Seit 2026-09-02 ist die Oberfläche darauf ausgelegt, auf einem **Handy** zu laufen. Was
das bedeutet, ist enger als es klingt, und die Grenze gehört benannt:

- **Die Shell ist umgestellt.** In `app.css` steht die schmale Form ohne Medienabfrage da,
  die breiten kommen per `min-width` dazu. Dasselbe gilt für `.main`, `.field` und
  `.form-grid`. Schmal führt eine Leiste unten in die vier häufigsten Bereiche (unten,
  „Die Navigation in drei Stufen").
- **Die Übersicht ist schmal eigens geordnet**: der laufende Monat oben, „Damit die
  Zahlen stimmen" darunter als eine Zeile, die aufklappt (`uebersicht/CLAUDE.md`).
- **Buchungen und Rücklagen ebenso** (seit 2026-11-22): oben, womit man arbeitet; was man
  nachsieht, rückt darunter und klappt ein (`SchmalKlappblock`, eine Zeile aus
  `Klappblock` mit der Überschrift der Karte darin). Breit ändert sich in beiden nichts.
  - **Buchungen:** oben der Kopf des Auszugs mit einem Auswahlfeld für das Konto statt
    des Namens, dem Stand samt Abgleich und den Knöpfen — „Abrufen" kommt aus dem Kopf
    der Kontenliste dorthin. Dann das Gebuchte, dann „Gebunden auf …", zuletzt „Deine
    Konten (n)" eingeklappt. Ohne Konto bleibt die Liste oben und offen (sie trägt den
    leeren Zustand); auch über einem Depot steht der Kopf, sonst käme man vom Depot nur
    über die eingeklappte Liste weg.
  - **Rücklagen:** „Wartet auf Zuordnung" ganz oben, dann je Rücklage eine Zeile (Name,
    Stand bzw. Stand / Ziel, Balken, mit Kauf darunter klein der Wertverlust), die ganze Zeile öffnet Sorte, Rate, Knöpfe und den
    Verlauf. Eingeklappt darunter: Stand, Faustformel und „Diesen Monat" (eine Zeile mit
    den Überschriften der Karten darin), „Wo das Geld liegt", die Vorschläge, „Schon
    abgeschlossen"; der Erklärtext hinter „Wie funktioniert eine Rücklage?". Ohne eine
    einzige Rücklage stehen die Vorschläge offen — sie sind dann der Weg hinein.

  Geprüft in `kontoauszug/schmal.test.tsx` und `ruecklagen/schmal.test.tsx`.
- **Die übrigen BEREICHE sind es nicht.** Ihre Raster stehen weiter als `max-width`-Abfragen
  (`ausblick-karten`) oder tragen sich über `auto-fit` selbst (`karten-paar`, `kpis`). Sie
  funktionieren schmal, aber sie sind nicht dafür entworfen. Ein Registerband rollt
  waagerecht, mit einem Verlauf an der Kante (unten). Das ist der Stand, und die
  Neuaufteilung kommt danach.

**Eine Tabelle von Hand fällt schmal nicht zusammen.** Die zwei Spalten der schmalen Form
gibt es nur in der `DataTable`; eine eigene `<table>` behält alle Spalten und läuft
seitlich aus dem Bild. So stand es bis 2026-11-22 in der Inbox. Sie bleibt trotzdem eine
eigene Tabelle — ihre Zellen müssen umbrechen (Gründe einer Dublette, Herkunft eines
Vorschlags), die `DataTable` kürzt jede auf eine Zeile — und ordnet ihre Zellen schmal per
CSS in dieselbe Form um (`.inbox-tabelle` in `app.css`). Eine neue Tabelle nimmt die
`DataTable`; wer davon abweicht, baut die schmale Form selbst mit.

**Was nicht passt, bricht um oder wird kleiner — es läuft nicht seitlich hinaus** (seit
2026-11-22 in allen Bereichen und Reitern bei 390 px nachgemessen). Drei Stellen taten
es bis dahin, und jede steht für eine Art:

- **Eine Leiste, deren Knöpfe zusammen zu breit sind** (`Umschalter` in der Analyse):
  schmal endet sie am Behälter, und die Beschriftung jedes Knopfs bricht um. Ab 700 px
  wieder einzeilig.
- **Eine Zahl, die allein breiter ist als die Karte** (die grosse Zahl im Vermögen):
  `KPIStat` setzt die grosse Zahl auf `min(var(--fs-display), 12vw)`. Die 64 px gelten
  ab gut 530 px Fensterbreite, breit ändert sich nichts. Eine Zahl umbrechen geht nicht,
  kürzen darf man sie nicht — bleibt nur die Grösse.
- **Eine Zeile aus Text und Knöpfen** (Kategorien in den Einstellungen): der Text bricht
  um (`flex-wrap` und `min-width: 0` am Namen), die Knöpfe schrumpfen nicht
  (`.katrow-aktionen`). Ohne beides schob der Name die Knöpfe über den Kartenrand.

**Eine Reiterleiste rollt schmal, und man sieht es ihr an** (`Registerleiste`, seit
2026-11-22). Die Reiter der Analyse und der Einstellungen passen bei 390 px nicht in
eine Zeile, auch nicht mit kleinerem Abstand. Umbrechen wäre die andere Wahl gewesen;
zwei Reiterzeilen über einer Trennlinie lesen sich aber als zwei Ebenen. Zwei Dinge
machen das Rollen sichtbar:

- **Ein Verlauf an der rechten Kante**, ohne Messung: `::after` der Leiste klebt per
  `sticky` rechts. Am Ende der Leiste steht er an seinem eigenen Platz hinter dem
  letzten Reiter, über leerer Fläche, und ist damit weg — ebenso in jeder Leiste, die
  ohnehin passt. Er nimmt die Farbe des Seitengrunds (`--cream`); eine Leiste auf einer
  Karte bräuchte eine andere.
- **Der aktive Reiter rückt ins Bild**, beim Öffnen und bei jedem Wechsel
  (`aktivenReiterZeigen`), und zwar links vom Verlauf (`scroll-padding-inline-end`).
  Nur die Leiste rollt, nie die Seite: `scrollIntoView` hätte auch senkrecht
  gerollt, sobald die Leiste nicht ganz im Bild ist.

Breit gibt es beides nicht; dort passen die Reiter.

Vier Dinge, die bei jedem neuen Stück ab jetzt gelten und die man schmal nicht nachholen
kann:

- **Kein Raster ohne `min-width: 0`.** Ein Rasterkind wächst per Vorgabe mit seinem Inhalt;
  eine breite Tabelle zieht dann die ganze Seite auf, und der Scrollrahmen der `DataTable`
  kommt nie zum Zug.
- **44 px Trefferfläche** für alles, was ein Finger treffen muss (`--trefferflaeche`).
  Die Bausteine tragen sie seit 2026-11-22 selbst, als `min-height` (wo der Inhalt
  schmaler sein kann, auch `min-width`) im Abschnitt „Trefferflächen" am Ende von
  `app.css`, breit auf `auto` zurückgenommen. Wer einen Baustein mit Bedienteil baut,
  hängt seine Klasse dort an; `trefferflaechen.test.ts` prüft die Liste. Dasselbe gilt
  für eine Zeile, die aufklappt und selbst das Bedienteil ist, ohne Baustein zu sein
  (Monatskarten der Übersicht, Kopfzeile je Konto im Abgleich, schmal die Zeile je
  Rücklage): sie trägt
  `.aufklappzeile`, und der Test führt sie in einer eigenen Liste. **Keine
  Mindestbreite an Knöpfen mit Text:** in einer Flex-Zeile ersetzt sie das `auto`, das
  einen Knopf nie schmaler werden lässt als seine Beschriftung — so lief der Seitenkopf
  aus dem Bild.
- **Ein Eingabefeld unter 16 px lässt iOS Safari die Seite ZOOMEN**, sobald es den Fokus
  bekommt — und zurück zoomt sie nicht. `.field` ist deshalb schmal 16 px und erst ab
  700 px wieder 13,5. Das gilt für das Feld, das den Fokus bekommt, nicht für seine
  Hülle (im `Datumsfeld` trug bis 2026-11-22 nur die Hülle die 16 px), für ein natives
  `select` (`Zeilenauswahl`) und für jeden kleineren Sonderfall (`tabellenfilter`): der
  kleinere Grad steht dort erst ab 700 px. Geprüft in `trefferflaechen.test.ts`.
- **Ränder über `env(safe-area-inset-*)`**, nicht als feste Zahl. Voraussetzung dafür ist
  `viewport-fit=cover` in `index.html`; ohne die Angabe meldet `env()` überall Null.

### Das Fenster muss schmal werden duerfen

`minWidth` in `src-tauri/tauri.conf.json` stand auf **920** — oberhalb der Schwelle, ab
der die Schublade greift. Die Folge war nicht kosmetisch: die schmale Form liess sich in
der App **gar nicht ansehen**, das Fenster ging nicht so weit zu. Sie ist jetzt 360 (die
schmalsten Telefone), die Hoehe 480.

Der alte Wert war richtig, solange die Oberflaeche unter 920 auseinanderfiel; er ist
falsch, seit sie es nicht mehr tut. **Eine App, die mobile first sein soll und deren
eigenes Fenster sich weigert, schmal zu werden, widerspricht sich** — und der
Widerspruch faellt niemandem auf, weil man das Fenster einfach nicht kleiner zieht.

Der Wert steckt im Bundle, nicht in der laufenden App: nach dem Aendern muss
`npm run tauri dev` einmal neu bauen.

## Die Navigation in drei Stufen

| Breite | Form |
|---|---|
| bis 699 px | **Leiste unten** mit Übersicht, Buchungen, Rücklagen, Budgets und „Mehr"; „Mehr" holt die **Schublade** mit allen Bereichen herein. Oben eine Kopfleiste mit dem Namen des Bereichs. |
| ab 700 px | feste Spalte im Raster, 68 px, **nur Icons**; keine Leiste unten |
| ab 1100 px | dieselbe Spalte mit 248 px und Beschriftung |

### Schmal: die Leiste unten (seit 2026-11-22)

Am Handy ist der Daumen unten, und die Bereiche, in die man unterwegs geht, sind wenige:
nachsehen, wie man dasteht (Übersicht), zuordnen und abhaken (Buchungen), was noch da
ist (Budgets) und was zurückgelegt ist (Rücklagen). Sie stehen unten in einer festen
Leiste (`LEISTE` in `AppShell.tsx`), alles Übrige hinter „Mehr", das die Schublade öffnet.
Abrufen bleibt ein Knopf in Übersicht und Buchungen und bekommt keinen Platz in der Leiste.

- **Nur WELCHE Bereiche steht in `LEISTE`, nicht wie sie heissen.** Beschriftung und Icon
  kommen aus `GRUPPEN` und der `ScreenId`, wie in der Schublade — eine zweite Zuordnung
  wäre die Stelle, die beim nächsten Umbenennen vergessen wird.
- **Der aktive Bereich trägt `aria-current="page"`.** Steht man in einem Bereich ohne
  eigenen Eintrag, trägt „Mehr" die Markierung, mit `aria-current="true"`: es ist nicht
  der Bereich, sondern der Eintrag, hinter dem er liegt.
- **Ein versteckter Bereich fällt weg, die Leiste wird nicht aufgefüllt.** Sonst stünde
  je nach Einstellung an derselben Stelle etwas anderes, und der Daumen träfe das Falsche.
- **Sie steht IM Raster von `.app`** (dritte Zeile), nicht fixiert über dem Inhalt. Der
  Scrollbereich `.main` endet deshalb an ihrer Kante, und nichts verschwindet unter ihr,
  ohne dass ein Abstand ihre Höhe nachrechnen müsste. Die Wischleiste des Telefons
  polstert sie (`safe-area-inset-bottom`), nicht den Inhalt. Die Meldungen schweben
  schmal über ihr (`--leiste-hoehe`), Schublade und Dialoge liegen darüber.
- **Den Griff (☰) oben gibt es nicht mehr.** „Mehr" öffnet dieselbe Schublade, und zwei
  Wege zum selben Ziel an zwei Enden des Bildschirms lassen fragen, ob sie dasselbe tun.
  Der gewohnte Ort oben war das einzige, was für ihn sprach. Nach dem Schliessen geht der
  Fokus deshalb an „Mehr" zurück.
- **Eigenbau aus Base-UI-Knöpfen**: Base UI hat kein Bedienteil für eine Leiste von
  Sprungzielen (`NavigationMenu` ist für Menüs mit aufklappenden Unterpunkten). Die
  Einträge sind Knöpfe, keine Links — gewechselt wird ein Zustand, eine Adresse gibt es
  nicht.

Geprüft in `bausteine/AppShell.test.tsx` (Einträge, Markierung, „Mehr", versteckte
Bereiche).

Der Mechanismus der mittleren Stufe ist unverändert eine einzige Klasse: **was `.lbl`
trägt, verschwindet dort.** Wer der Shell etwas hinzufügt, kapselt die Beschriftung
entsprechend und hängt den Namen zusätzlich an `title` — schmal ist das Icon alles, was
bleibt.

**Die mittlere Stufe steht als BEREICH da** (`min-width` und `max-width` zusammen) und
nicht als Kette aus Setzen und Zurücknehmen. Sie ist weder der schmale noch der breite
Fall, sondern ein eigener dazwischen; sie aus dem einen zu setzen und im anderen sieben
Regeln lang wieder abzuräumen wäre kürzer zu schreiben und beim nächsten Anbau die Stelle,
an der man eine Rücknahme vergisst.

**Die Schublade hat einen Zustand, und das ist ein Bruch mit der alten Begründung.** Hier
stand lange: „Ohne JavaScript und ohne Schalter — die Fensterbreite ist die Frage, die CSS
selbst beantwortet." Das gilt für die Einklapp-Stufe weiterhin. „Ist die Schublade offen?"
ist keine solche Frage: sie hängt an einer Handlung. Ein reines CSS-Konstrukt (Checkbox
plus `:checked`) hätte den Zustand nur versteckt.

Drei Wege schliessen sie, und alle drei sind nötig — geprüft in
`bausteine/AppShell.test.tsx`:

- **Ein gewählter Bereich.** Der wichtigste: ohne ihn steht die Schublade nach dem Wechsel
  über dem Bereich, den sie gerade geöffnet hat, und der Erfolg der Handlung ist unsichtbar.
- **Escape** — aber nur, wenn kein Dialog die Taste schon verbraucht hat.
- **Der Scrim und der Knopf in der Schublade.** Beides, nicht eines: die Schublade nimmt
  fast die ganze Breite, und der Streifen daneben liest sich nicht als Bedienteil.

`visibility` fährt bei beiden mit der Überblendung mit. Das ist kein Zierrat — allein über
`transform` bliebe die geschlossene Leiste mit der Tabulatortaste erreichbar, und allein
über `opacity` läge ein unsichtbares Tuch über der ganzen App.

**Zwei Fallen der Fusszeile bleiben wörtlich bestehen:** `.aktualisierung` ist selbst ein
`div` und wäre von einem pauschalen `.foot > div` mit ausgeblendet — dann fehlte bei
schmalem Fenster der einzige Hinweis auf ein Update. Und die Regel dahinter gilt allgemein:
**Auskunft darf weichen, eine Handlung nicht.**

## Schmal steht der Bereichsname nur einmal

Die Kopfleiste nennt den Bereich, und `PageHead` tat es zwei Zentimeter darunter noch
einmal — auf 400 px waren das zwei Überschriften desselben Wortes in den ersten hundert
Pixeln. Die `h1` ist deshalb schmal nur noch für Vorlesehilfen da.

**Die Kopfleiste ist die bessere von beiden**, und das ist gemessen: `.main` ist der
Scrollbereich, die Leiste bleibt bei `top: 0` stehen. Sie beantwortet „wo bin ich" auch
weiter unten, die `h1` nur ganz oben.

Zwei Dinge, die daran hängen:

- **Sie verschwindet nur für Augen**, nicht aus dem Dokument. Eine Seite ohne `h1` hätte
  keine Gliederung mehr, und die Kopfleiste trägt einen `span`, keine Überschrift.
- **Der Untertitel bleibt sichtbar.** Er trägt an mehreren Stellen die Einschränkung, die
  die Zahlen darunter ehrlich hält — in der Übersicht etwa, dass die Karten zeigen, was
  im Monat ANSTEHT, über alle Konten.

Die Regel steht ausnahmsweise als `max-width` und nicht als Grundform: die sichtbare `h1`
aus der versteckten zurückzuholen kostet sieben Rücknahmen, und genau davor warnt die Regel
zur Icon-Stufe.

## Drei Ränge für jeden Text neben einer Zahl

Schmal muss Text weichen, und „welcher" ist keine Geschmacksfrage. Das Kriterium ist, was
der Text TUT:

| Rang | er tut | schmal |
|---|---|---|
| **Einschränkung** | ändert, was die Zahl daneben bedeutet | bleibt offen stehen — nie hinter einem Deckel |
| **Erklärung** | hilft beim ersten Mal, ist beim zehnten Ballast | darf einklappen, hinter eine ausgeschriebene Frage |
| **Nacherzählung** | sagt, was man ohnehin sieht | weg — auf JEDER Breite |

Die Ränge sind an den drei Fällen gemessen, an denen sie zuerst angewendet wurden:

- **Einschränkung:** der Untertitel der Übersicht endete bis 2026-11-15 auf „über die
  verfügbaren Konten", und das war der Grund, warum dasselbe Budget dort weniger Verbrauch
  zeigte als im Bereich Budgets. Fällt so ein Satz weg, lügt die Zahl daneben — und zwar
  dort, wo man am flüchtigsten hinsieht. (Der Satz ist inzwischen weg, weil der
  Unterschied weg ist: die Übersicht rechnet über alle Konten. Das ist der bessere Weg,
  eine Einschränkung loszuwerden.)
- **Nacherzählung:** der Untertitel des Kontenbereichs lautete „Kontostände, gebuchte und
  voraussichtliche Buchungen je Konto" und beschrieb genau das, was auf dem Bildschirm
  steht. Er ist **ganz** weg, nicht nur schmal: was breit nichts trug, trägt schmal
  erst recht nichts. Die Aussage, die dieser Bereich wirklich macht, steht an der Karte,
  wo sie hingehört — „Anfangsbestand + bestätigte Ist-Buchungen = realer Stand".

**Der lehrreichste Fall war der dritte, und er ist der Grund für das Kriterium überhaupt:**
unter der Karte *Da ist etwas zu tun* (bis 2026-11-08 in der Übersicht) standen beide Ränge in EINEM Absatz — erst was
„sicher" und „erwartet" bedeuten (Erklärung), dann „was hier NICHT steht, läuft im
gerechneten Fenster nicht ins Minus" (Einschränkung). Solange das ein Absatz ist, nimmt
jedes Wegräumen der Erklärung die Einschränkung mit, **und die leere Karte liest sich
danach als Freigabe**. Der Absatz wurde deshalb geteilt, bevor überhaupt etwas eingeklappt
wurde. Die Karte ist gegangen, die Rechnung steht seit 2026-11-15 als „Reicht das Geld?"
im Ausblick der Analyse — mit derselben Teilung, und `analyse/liquiditaet.test.tsx` hält
sie fest: die Erklärung im `<details>`, die Einschränkung daneben und nie darin.

**Warum Einklappen hier kein Rückfall in den Reiter-Fehler ist:** in der Analyse steht der
Befund, dass niemand sucht, was hinter einem Reiter liegt — ein Reiter sagt nicht, was
darunter ist. Ein `<summary>`, auf dem die Frage ausgeschrieben steht („Was heißen
‚sicher' und ‚erwartet'?"), sagt es. Und eingeklappt wird nur **Meta über den Inhalt**,
nie der Inhalt selbst.

## Wie breit eine Seite wird

`.screen` deckelt bei **1280 px**, nicht mehr bei 1040. Der alte Wert war der klassische
Lesedeckel und hier am falschen Inhalt gemessen: diese App liest man nicht, man sucht darin.
Konten, Analyse, Verträge, Rücklagen, Import und die Verwaltung führen alle mit einer
Tabelle, und jede davon war schmaler, als sie sein musste.

**Formulare halten das aus, ohne Zutun.** Genau das war der Einwand gegen mehr Breite — ein
600 px breites Eingabefeld taugt nichts —, und er greift hier nicht: *jedes* `form-grid` der
App sitzt in einem Modal, und die Dialoge deckeln bei 680 px. Auf einem Screen steht kein
einziges Formular. Das ist nachgesehen und nicht angenommen; beim ersten Anlauf war es
andersherum angenommen, und es hat eine Sonderbreite für einen einzigen Bereich gekostet,
die zwei Runden später wieder rausflog.

**Prosa braucht ihre eigene Grenze**: `.screen p { max-width: 78ch }`. Ein `<p>` steht in
dieser Codebasis ausschliesslich für Erklärtext (15 Stellen), nie für Tabellen- oder
Zeilentext — deshalb trifft die Regel genau das Richtige. Modale erwischt sie nicht, die
hängen per Portal am `body`.

Was dabei mitwächst und darf: `karten-paar` und `ausblick-karten` sind `fr`-Raster, die
KPI-Leiste bricht um, und die Charts skalieren über ihre `viewBox` — die laufen ohnehin
zwischen halber und voller Kartenbreite.

## Abstände: wer ihn setzt

**Der Abstand ZWISCHEN Karten kommt vom Behälter, nie von der Karte.** `.screen` ist ein
Stapel mit `gap-card`, der Inhalt eines Registers ebenso (`Registerleiste stapeln`), ein
Kartenpaar setzt seinen `gap`. Eine Karte mit eigenem `marginTop: var(--gap-card)` direkt
in einem solchen Behälter bekommt den Abstand doppelt — so stand es bis 2026-11-10 im
Kontoauszug: 32 px über der Kontokarte, 16 darunter. Und wo der Behälter dafür eine
`!important`-Regel brauchte, die die Ränder der Kinder wieder wegnimmt, war das der
Hinweis, dass der Abstand am falschen Ort stand.

**Innerhalb einer Karte** ordnen `Stapel` und `Zeile` (`bausteine/Anordnung`) mit Abständen
aus der Token-Reihe. Drei Fälle bleiben bewusst am Element und sind kein Rückstand:

- der Hinweis direkt unter seinem Feld (`marginTop: 6`) — der Abstand gehört zum Hinweis;
- `margin: 0` gegen den Standardrand eines `<p>`;
- ein einzelner Abstand, der eine Gruppe von der nächsten absetzt, wo es nur EINE solche
  Stelle im Behälter gibt.

Wer einen Behälter anfasst, in dem mehrere Kinder denselben `marginTop` tragen, macht ihn
zum `Stapel`.

**Am 2026-11-11 mit einem JSX-Parser über ganz `ui/` gemessen:** es gibt KEINEN solchen
Behälter mehr. Jeder, in dem zwei oder mehr Kinder einen Rand tragen, hat einen
ungleichmässigen Rhythmus — 16 px unter dem Titel, 12 zwischen Feldern, 6 für den Hinweis
unter seinem Feld. Ein `Stapel` kennt genau EINEN Abstand; diese Ränder in Stapel zu
überführen hiesse, das Aussehen zu ändern oder jedem Kind seinen Wert zurückzugeben — also
dasselbe unter anderem Namen. Der einzige gleichmässige Fall (`Bankzugänge`, Prüfergebnis)
ist es nur scheinbar: seine Kinder sind `<ul>`, deren Standardrand im Block-Fluss mit dem
nächsten zusammenfällt und in einem Flex-Stapel nicht.

## Die Fläche kommt von `Card`

**Inhalt steht in einer `Card`, nicht auf dem nackten Seitenhintergrund.** Sie trägt
`background: var(--surface)`, den Haarlinien-Rahmen und die Innenabstände; `.screen`
darunter ist nur ein Layout-Container ohne eigene Fläche. Ein Bereich, der seine Teile in
blanke `<div>`s setzt, sieht deshalb auf den ersten Blick „hintergrundlos" aus — und
danach fragt niemand nach dem Grund, sondern nach dem Fehler.

Selbst gezogene Rahmen (`border: 1px solid var(--line)` plus Radius) sehen ähnlich aus und
sind trotzdem falsch: die Fläche fehlt weiterhin, und beim nächsten Token-Wechsel laufen
sie gegen die Karten auseinander.

**Und keine Karte IN einer Karte.** Zwei Rahmen um dieselbe Sache, der Inhalt rückt
zweimal ein, und die Trennung, die eine Karte leisten soll, wird zur Verschachtelung. Die
Falle ist die Detailliste unter einer Tabelle: sie dort einzuhängen ist naheliegend, und
dass die Tabelle selbst schon in einer Karte steckt, sieht man dem Code nicht an — das
steht eine Datei weiter oben. Aufgeklapptes gehört NEBEN die Karte, nicht hinein.
`kartenschachtelung.test.tsx` prüft das am gerenderten DOM, weil die Verschachtelung erst
dort entsteht.

## Zwei Fragen, die verschieden aussehen müssen

Derselbe Bereich (`bausteine/HerkunftBereich`) beantwortet zwei Fragen, und wer sie
gleichbehandelt, beantwortet eine davon falsch:

- **Unter der Kontenliste:** „Was steht für dieses Konto überhaupt in der Datenbank?"
  → ALLE Zeilen, aus jeder Quelle. Eine nach Abrufwegen getrennte Antwort wäre keine.
- **Unter einem Bankzugang:** „Was hat DIESER Abruf gebracht?" → nur die Läufe dieses
  Zugangs, und die Zeilen erst, wenn einer davon gewählt ist. Eine Zeile aus einer Datei
  gehört hier nicht hin, auch wenn sie zum selben Konto gehört.

Gesteuert über `zugangId`. Ohne den Parameter gilt das erste, mit ihm das zweite.

## Die Analyse steht in Registern

**Seit 2026-11-08** stehen die Abschnitte nicht mehr untereinander, sondern in Reitern
(`bausteine/Registerleiste.tsx`): **Verlauf · Kategorien · Ausblick · Planrechnung ·
Befunde · Depot · Bericht**.
Untereinander war die Seite so lang, dass man für die Befunde oder ein Depot an allem
anderen vorbeiscrollte. Drei Dinge daran sind Entscheidungen:

- **Jedes Register trägt die Filter, die es einstellt** (seit 2026-11-09) — Verlauf
  Monat und Zeitraum an seiner Karte, Kategorien, Befunde und Depot den Zeitraum, der
  Ausblick keinen. Die Kennzahlen stehen im Verlauf. Einen Tag lang sassen Zeitraum,
  Monat und Kennzahlen über den Reitern: das las sich, als gälten sie überall, und für
  den Ausblick galten sie nie.
- **Und jedes Register hat seinen EIGENEN Zustand** (seit 2026-11-11). Bis dahin war er
  gemeinsam — ein Zeitraum in den Befunden verschob den Verlauf, ein Monat im Verlauf die
  Kategorien —, und das las sich als Verwechslung statt als Bequemlichkeit. Der Zustand
  liegt trotzdem im Screen, nicht im Register: gerendert wird nur das aktive, und ein
  Reiterwechsel soll nichts verwerfen. **Ein angeklickter Monat im Verlauf öffnet
  darunter seine Aufschlüsselung** (`Aufschluesselung`); das Register „Kategorien" ist
  eine eigene Auswertung über die Zeit (`KategorienRegister`, `kategorieReihen`).
- **Nur Register mit Inhalt bekommen einen Reiter.** Ohne abgerufenes Depot gibt es
  keinen Reiter „Depot" — ein Reiter ins Leere wäre schlechter als keiner.
- **Die Befunde bleiben innerhalb ihres Registers Karten untereinander** (unten). Das ist
  kein Widerspruch: ein Reiter „Befunde" sagt, was darunter liegt; sieben Reiter „Treue",
  „Ohne Plan", „Ausreißer" sagten es nicht.

Die Register davor beantworten **„wie viel und wohin"** — Verlauf (in zwei Fragen, unten;
zur Ausgabenfrage darunter die Aufschlüsselung eines angeklickten Monats), die Kategorien über die
Zeit und der **Blick nach vorn** (`AusblickKarte.tsx`, darunter „Reicht das Geld?" und „Wie lange reicht es ohne Einnahmen?"). Die Befunde (`BefundeBereich.tsx`) beantworten **„und wie tragfähig ist das"**:
fest gegen frei, Budget-Treue, Ungeplantes (unten), Verträge Soll gegen
Ist, Empfänger, Nutzung der Kategorien, Ausreißer.

### Der Verlauf beantwortet zwei Fragen

**Seit 2026-11-15 steht über dem Verlauf die Wahl der FRAGE** (`Umschalter`, im Zustand
`frage`), unabhängig von der Darstellung darunter:

| Frage | Sicht | rechnet | Darstellungen |
|---|---|---|---|
| „Wofür ging Geld raus?" | Auszahlung | `analyseVerlauf`, liquide Konten | Fluss · Saldo · Tabelle |
| „Was hat der Monat gekostet?" | Kosten | `analyseKostenverlauf`, alle Konten | Diagramm · Tabelle |

Die Begriffe stehen in `src/core/CLAUDE.md` unter „Auszahlung und Kosten". Vier Dinge
daran sind Entscheidungen:

- **Zwei Umschalter, nicht einer mit fünf Knöpfen.** Eine Zahl gehört in genau eine der
  beiden Sichten; in EINER Leiste läsen sich Frage und Darstellung als fünf Ansichten
  derselben Zahlen. Die Kostensicht hat deshalb auch ihr eigenes Feld für die Darstellung
  (`kostenAnsicht`): einen Saldo gibt es dort nicht — ein Kontostand ist Liquidität —, und
  mit einem gemeinsamen Feld stünde nach dem Wechsel eine Ansicht gewählt, die es nicht gibt.
- **Die Monatswahl und die Aufschlüsselung gehören zur Ausgabenfrage.** Sie schlüsseln
  Auszahlungen nach Kategorien auf; unter der Kostensicht stünden zwei Rechnungen
  übereinander, die nicht aufeinander aufgehen.
- **Der laufende Monat erscheint, zählt aber in keine Kennzahl.** Er steht blass bzw. mit
  Pille da, weil die Übersicht dieselbe Zahl zeigt und der Verlauf beim Wechsel der Frage
  keinen Monat verlieren soll. Aus Durchschnitt und Quoten bleibt er heraus: Rücklagen
  stehen schon mit der ganzen Rate da, das Gehalt vom Monatsende
  noch nicht. Der Satz dazu ist eine Einschränkung und steht offen unter den Zahlen.
- **Quoten sind ungerichtet und haben KEINE Schwelle.** Fixkosten- und Sparquote bleiben
  neutral; welche Quote „zu hoch" ist, hängt am Haushalt, und eine erfundene Grenze wäre
  eine Bewertung ohne Grundlage. Gerechnet werden sie im Kern (`ergebnisKennzahlen`),
  über die Summen des Zeitraums.

**Die Kostensicht ist nach hinten unvollständig, und das steht dabei.** Eine Rücklage
kennt nur ihren laufenden Zyklus; nach dem Ausbuchen fehlt den Monaten davor ihre Rate.
`analyseKostenverlauf` markiert diese Monate (`ruecklagenrateFehlt`), die Tabelle trägt
eine Pille, und unter den Zahlen steht der Satz offen — aber nur, wenn im Fenster
wirklich ein Monat betroffen ist. Ein Vorbehalt, der immer dasteht, wird überlesen.
Geprüft in `analyse/kostensicht.test.tsx`.

**Die Stapel des Kostendiagramms tragen die Reihenfarben** (`--serie-1`…`-6`,
`KostenStapelChart.tsx`), in fester Zuordnung zur Kostenart und nie nach Rang. Die vier
Geld-Tokens stehen dort nicht: ein amberfarbener Stapel hiesse „sieh hin", und dass ein
Monat etwas kostet, ist kein Befund. Sechs Reihenfarben, und seit 2026-11-15 sieben
Kostenarten: **die Tilgung trägt den Ton der Vorsorge (`--serie-6`) schraffiert**, im
Diagramm wie in der Legende. Eine siebte Farbe wäre ungeprüft auf Farbfehlsichtigkeit, ein
zyklischer Index gäbe ihr die der Fixkosten. Tilgung und Vorsorge bauen beide Vermögen auf
und stehen in derselben Stufe; der Ton sagt „dieselbe Familie", die Schraffur „eine andere
Art" — und eine Form trägt auch dort, wo Töne fürs Auge zusammenfallen. Wer eine achte
Zeile bringt, braucht wieder eine Entscheidung. Die Spalte „Tilgung" der Tabelle steht
nur da, wenn eine Schuld sie trägt.

**Jeder Befund ist eine eigene Karte, kein Register.** Der erste Versuch legte sie als
umschaltbare Lupen auf eine Fläche — kürzer, und genau deshalb falsch: was hinter einem
Reiter liegt, sucht niemand, und ein Befund, den man erst aufklappen muss, ist keiner. Der
Bereich wird dadurch lang; das ist der Preis, und er ist richtig herum bezahlt. Die
Seitengrösse der Tabellen ist dafür kleiner (8 statt 25) — sieben Karten, von denen jede
eine Bildschirmhöhe frisst, schieben einander aus dem Blick.

Drei Dinge, die beim Anbauen zählen:

- **Alle Befunde werden in EINEM Zug gerechnet** (`analyseBefunde`), aus derselben Basis
  wie die Zahlen darüber. Eine Karte, die sich ihre Buchungen selbst holt, rechnet früher
  oder später gegen eine andere Menge als ihre Nachbarin — genau der Fehler, gegen den es
  `analyseLaden` schon gibt.
- **Eine Ausgabe wird durch Negieren der Summe positiv, nie mit `Math.abs`.** Die Regel
  steht im Kopf von `core/auswertung.ts`: `Math.abs` je Buchung macht aus „es kam Geld
  zurück" ein „es wurde noch mehr ausgegeben". Wer eine Spalte ergänzt, übernimmt die
  Regel mit.
- **Der Blick nach vorn hängt NICHT am gewählten Zeitraum** — er steht fest bei sechs
  Monaten zurück und zwölf voraus (seit 2026-11-11, vorher sechs). Eine Projektion wird
  nicht besser, wenn man sie über zwei Jahre zieht; ihre späten Monate wären Behauptung
  statt Vorschau. Gezeichnet wird EINE Linie, deren geplanter Teil gestrichelt ist
  (`SaldoVerlaufChart`, `abIndex`): es ist derselbe Saldo, und zwei Linien behaupteten
  zwei Grössen. **Der laufende Monat ist Plan, nicht Ist** (seit 2026-11-11): halb gebucht
  knickte die Linie genau an der Naht ein. Das Ist endet mit dem Vormonat
  (`analyseAusblick`).

### Unter dem Ausblick: „Reicht das Geld?"

Die Liquiditätsvorschau (`core/liquiditaet.ts`, zwei Linien — siehe
`src/core/konten/CLAUDE.md`) steht seit 2026-11-15 als eigene Karte unter dem Blick nach
vorn (`LiquiditaetKarte.tsx`, gerechnet von `analyseLiquiditaet`). Der Saldo darüber
rechnet monatsweise über alle liquiden Konten zusammen; die Tabelle sagt je Konto und
taggenau, wie tief es geht und wann. Was daran Entscheidung ist:

- **Sie zeigt jedes liquide, aktive Konto — immer.** Die Vorgängerin in der Übersicht
  erschien nur bei einem Minus und war damit eine Warnung; als Warnung war sie zu laut.
  Eine Tabelle, die immer dasteht, ist eine Auskunft.
- **Nur `warnFarbe`, und nur unter null.** Kein Rahmen in Warnfarbe, kein grüner
  Tiefstand: er ist eine Höhe, keine Richtung. „Fest" und „erwartet" stehen als Wort in
  einer Pille.
- **Erklärung und Einschränkung sind zwei Absätze** (oben, „Drei Ränge"): was die beiden
  Linien bedeuten, klappt hinter der ausgeschriebenen Frage ein; dass ein Konto ohne
  Minus nicht „geprüft und in Ordnung" ist, steht offen daneben — samt dem Tag, bis zu
  dem gerechnet wurde.
- **Schmal bleiben Konto, der erwartete Tiefstand und „im Minus ab".** Die erwartete
  Linie ist die tiefere; an ihr sieht man zuerst, ob es eng wird.
- **Über der Tabelle steht die Kurve** (seit 2026-11-22, `LiquiditaetKurve.tsx`): die
  Summe der Konten der Tabelle, Tag für Tag, beide Linien als Treppe — die Stufe fällt
  auf den Tag des Postens. Beim Darüberfahren, Antippen oder mit den Pfeiltasten stehen
  UNTER ihr Tag, beide Stände, die Posten des Tages und der Budgetanteil; keine
  schwebende Blase, die ein Finger verdeckt. Ein eigener Chart und nicht
  `SaldoVerlaufChart`: der zeichnet Monate als schräge Linie und kennt Werte nur über
  `<title>`, also nicht am Handy. Er misst seine Breite und zeichnet in echten Pixeln —
  über eine feste `viewBox` stünde die Achsenschrift am Telefon in vier Pixeln da. Die
  Null ist immer im Bild. Die Reihe kommt fertig aus `analyseLiquiditaet` (`kurve`).

### In den Befunden: „Ungeplant"

Die Karte rechnet seit 2026-11-22 über die Einordnung (`ungeplantNachKategorie` in
`core/auswertung.ts`, über `einordnen`): die Anteile der Art `ungeplant`, dieselben wie in
der Zeile „Ungeplant" der Monatskarten, für den Zeitraum des Registers. Bis dahin hiess sie
„Ohne Budget und ohne Vertrag" und rechnete über `blindeFlecken` eine eigene Menge, in der
eine Ausgabe, die eine Rücklage trug, als ungeplant stand. Was auf die Wahl einer Rücklage
wartet, zählt mit (so rechnet die Übersicht) und steht als Pille an der Kategorie, mit dem
Satz darunter, sobald es vorkommt. Je Kategorie Summe und Anzahl; ein Klick auf die Zeile
zeigt die Buchungen darunter als `Buchungsliste` (`UngeplantTabelle.tsx`), aus der der
Buchungsdialog aufgeht.

### Darunter: „Wie lange reicht es ohne Einnahmen?"

Seit 2026-11-15 steht unter „Reicht das Geld?" eine dritte Karte (`ReichweiteKarte.tsx`,
gerechnet in `core/reichweite.ts`, geholt von `analyseReichweite`): wie viele Monate das
FREIE Geld der liquiden Konten die Kosten eines Monats trägt. Was daran Entscheidung ist:

- **Sie steht im Ausblick, nicht in der Übersicht.** Der Zähler ist ein Stand von heute,
  aber der Nenner ist ein Durchschnitt über ein Jahr, und die Aussage zeigt nach vorn.
  Eine Zahl, die erst mit Zeitraum und Annahme etwas bedeutet, ist keine Antwort auf
  „wie stehe ich gerade da" — sie ist dieselbe Frage wie „Reicht das Geld?", nur ohne
  die Einnahmen und über das Fenster der Tabelle hinaus.
- **Der Zähler ist die Zahl aus „Was da ist"** (`bilanzJeKlasse`, Klasse `liquide`,
  Spalte frei) und keine eigene. Wer sie in der Übersicht sucht, findet sie dort.
- **Der Nenner sind KOSTEN, nicht Auszahlungen** — aus der Ergebnisrechnung, gemittelt
  über die letzten zwölf abgeschlossenen Monate, frühestens ab dem ersten voll erfassten
  (`reichweitenMonate`). Der laufende zählt nicht, dieselbe Regel wie in der Kostensicht.
  Ein Jahr, weil Ungeplantes jahreszeitlich schwankt; Verträge sind ohnehin periodisiert.
  Unter drei Monaten gibt es keine Zahl, sondern den Satz, ab wann es eine gibt.
- **Zwei Zahlen, höchstens.** Ohne das Zurücklegen (Verträge, monatliche Budgets,
  Ungeplantes) und mit ihm (dazu Rücklagen und Vorsorge). Wer im
  Notfall das Zurücklegen aussetzt, kommt länger aus; welche Annahme gilt, entscheidet,
  wer liest.
- **Keine Farbe.** Monate sind ungerichtet, und eine Schwelle „zu wenig" gibt es im
  Bestand nicht. Die Faustformel der Rücklagen (drei Monatseinnahmen auf den
  Rücklagenkonten) misst etwas anderes und ist bewusst NICHT umgedeutet worden.
- **Die Annahme ist eine Einschränkung** und steht offen unter den Zahlen: worüber
  gemittelt wurde und was als frei gilt. Die Grenze bei ausgebuchten Rücklagen
  (`ruecklagenrateFehlt`) steht nur dabei, wenn sie einen gemittelten Monat trifft.

Geprüft in `analyse/reichweite.test.tsx`, `application/analysesichten.test.ts` und
`core/reichweite.test.ts`.

### Die Planrechnung — zwölf Monate Plan, Verträge anteilig

Seit 2026-11-22 steht nach dem Ausblick das Register **Planrechnung**
(`PlanrechnungRegister.tsx`, gerechnet von `analysePlanrechnung` über `planrechnung` in
`core/ergebnis.ts`): der Plan der Ergebnisrechnung für zwölf Monate ab dem laufenden.
Die Frage des Nutzers dahinter: reichen die Einnahmen in Summe für alles Geplante, was
bleibt, und reicht es für das Zurücklegen? Was daran Entscheidung ist:

- **Sie ist die anteilige Rechnung, die die Übersicht abgegeben hat.** Die Monatskarten
  zeigen seit demselben Tag nach Fälligkeit (`uebersicht/CLAUDE.md`); ein Quartalsvertrag
  steht hier mit einem Drittel in jedem Monat, dort ganz in einem.
- **Oben die Summe, darunter Monat für Monat.** Die Summe mit den Stufen der
  Ergebnisrechnung beantwortet die Frage; die Monate zeigen, wo es eng wird. Eine
  Zwischensumme steht nur, wenn danach noch etwas abgeht, wie in den Monatskarten.
- **Nur Plan, auch im laufenden Monat.** „Ungeplant" hat keinen Plan und fehlt; dass
  Ungeplantes nicht eingerechnet ist und Verträge verteilt sind, ist eine Einschränkung
  und steht offen unter der Summe.
- **Ohne Plan kein Reiter** (`hatPlan`), wie beim Depot.
- **Schmal** bleiben Monat und „Bleibt wirklich frei"; die Zeilen rücken beschriftet in
  die zweite Zeile. Den Namen setzt die Zelle selbst (`zweitzeile-beschriftung`), damit
  ein Stück zwischen Name und Betrag umbrechen darf statt gekürzt zu werden. Breit
  brechen die Spaltenköpfe um, sonst rollte die Tabelle bei der letzten Spalte aus dem
  Bild.

Geprüft in `analyse/planrechnung.test.tsx` und `core/ergebnis.test.ts`.

### Der Bericht — ein Zeitraum auf einem Blatt

Seit 2026-11-15 steht als letztes Register der **Bericht** (`BerichtRegister.tsx`,
gerechnet von `analyseBericht` über `core/bericht.ts`): für EINEN abgeschlossenen Monat
oder EIN Kalenderjahr drei Karten untereinander — das Ergebnis mit seinen Stufen neben dem
Zeitraum davor, der Weg zum Konto (die Überleitung) und das Nettovermögen am Tag vor dem
Zeitraum und an seinem letzten Tag. Was daran Entscheidung ist:

- **Er rechnet nichts Eigenes.** Dieselbe Eingabe wie Kostensicht und Reichweite
  (`kostenbasis`), ein Jahr ist die Summe seiner zwölf Monate — auch in der Überleitung,
  die deshalb wie im Monat exakt aufgeht (`core/bericht.test.ts`). Die Kennzahlen sind die
  der Kostensicht für diesen Zeitraum, mit ihren Wörtern.
- **Wählbar ist nur Abgeschlossenes und ganz Erfasstes**, ab dem ersten voll erfassten
  Monat (`reichweitenMonate`), ein Jahr nur mit allen zwölf. Vorgabe ist der jüngste.
  Ein angefangenes Jahr neben einem vollen wäre kein Vergleich.
- **Der Vergleich fehlt, statt zu lügen.** Ist der Zeitraum davor nicht ganz erfasst,
  gibt es keine zweite Spalte, und das steht als Satz darunter.
- **Ein Blatt, nichts eingeklappt.** Die Überleitung, in der Übersicht ein Beleg hinter
  einem Deckel, ist hier einer der drei Teile und hat eine eigene Karte. Die
  Einschränkungen (fehlender Vergleich, fehlende Rücklagenraten, Vermögenswerte und
  Schulden mit dem zuletzt eingetragenen Wert) stehen offen da, wenn sie treffen.
- **Die Schulden stehen im Vermögensteil als Abzug** (negativ), damit sich die Spalte zum
  Nettovermögen addiert und eine sinkende Schuld als Zuwachs dasteht. Gedreht wird das an
  einer Stelle, in `vermoegensvergleich`; gespeichert bleibt die Restschuld positiv.
- **Schmal** bleiben Name und Betrag des Zeitraums; die Veränderung wandert in die zweite
  Zeile und trägt dort ihren Namen (`zweitzeileName` an der Spalte — wie jede
  rechtsbündige Spalte der `DataTable`, hier nur ohne das € des Kopfes).

Kein Export und kein Druck — das Blatt ist so gebaut, dass es sich wie eines lesen lässt.
Geprüft in `analyse/bericht.test.tsx`.

**Ein Screen-Test, der einen Kategorienamen sucht, muss ihn jetzt in seiner Karte
suchen.** Derselbe Name steht in der Aufschlüsselung und in den Ranglisten darunter; eine
Suche über das ganze Dokument findet mehrere Elemente und bricht ab. `screens.test.tsx`
hat dafür `inMonatsauswertung()`.

## Laden

**Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen setzen.** Gestaffelte
`setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen — ein Kategorie-Lookup
meldet dann für einen Render „ohne Kategorie", und das sieht aus wie ein Datenfehler.

## Texte

Alle Texte über `t(…)` aus `src/i18n/i18n.ts`, de und en als zwei Blöcke. Schlüsselnamen
wiederholen sich über die Namensräume vielfach (`titel`, `suche`, `bearbeiten` …) — beim
Ändern **am NAMENSRAUM ankern, nie am blossen Schlüsseltext**, sonst trifft es den falschen
Bereich. `npm test` prüft de/en-Parität, Platzhalter und dass kein `t("…")` ins Leere zeigt —
nicht aber, ob ein Schlüssel im richtigen Namensraum liegt. Geprüft ist das nur an den
Modulgrenzen (`src/architektur.test.ts`): der Bereich Rücklagen und die Bausteine, die er
benutzt, zeigen keinen Schlüssel `budgets.…`.

## Tests für Screens

Erste Zeile `/** @vitest-environment jsdom */`, sonst laufen auch die Kern-Tests in jsdom.
`getDb` wird per `vi.mock("…/persistence/db")` auf einen `vi.hoisted`-Halter umgebogen (die
Datenbank ist je Test frisch, `vi.mock` läuft vor den Imports); `src/testwerkzeug/harness.tsx`
liefert `sqlLaden`, `frischeDb()`, `pluginApi()` und `rendere()`.

**Über `aria-label` greifen, nicht über die Rolle allein:** `getByRole("checkbox")` bricht,
sobald ein zweites Kästchen dazukommt. Derselbe Text steht oft mehrfach im DOM (Liste und
Kopfzeile desselben Screens) — dann `findAllByText`.
