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

## Gliederung

Ein Ordner je Navigationsbereich, dazu `bausteine/` für alles Geteilte (eigene Regeln dort
in `bausteine/CLAUDE.md`). Die Einsortierregel: **was zwei oder mehr Bereiche benutzen, ist
ein Baustein; was einer benutzt, gehört in dessen Ordner** — auch wenn es allgemein aussieht.

Der Ordner heißt `training/`, weil die Navigation den Bereich so nennt; fachlich ist es
`kategorien/` wie in Kern und Anwendung. Die drei bereichsübergreifenden Tests (`screens`,
`interaktion`, `formulare`) liegen in der Wurzel.

## Geld anzeigen

**`useGeld()`** — nie eigenes `toFixed`, nie an der Locale-Schicht vorbei. Die Farbe kommt
aus **`bausteine/geldFarbe.ts`**: Plus grün, Minus `--warn-deep`, Null neutral. Eine Farbregel
für die ganze App, nicht eine je Screen.

Zeilenaktionen sind Icons über `bausteine/IconButton.tsx` — ihr Text wandert in
`title`/`aria-label`, statt zu verschwinden.

## Bedienteile: fast alles von Hand, eine Ausnahme

**Base UI (`@base-ui/react`) ist die einzige UI-Bibliothek im Projekt**, und sie liefert
ausschliesslich MECHANIK — kein Aussehen. Alles Sichtbare kommt weiterhin aus `app.css`
und den Tokens.

Sie steht heute unter genau zwei Bausteinen:

| Baustein | statt | woher die Mechanik |
|---|---|---|
| `bausteine/Auswahl` | `<select className="field">` im Formular | Base UI `Select` |
| `bausteine/Datumsfeld` | `<input type="date">` | Base UI `Popover`, Kalender von Hand |

**Die Grenze, an der die Entscheidung fiel:** ein Auswahlfeld braucht Combobox-Semantik
(Knopf und Liste über ARIA verbunden, Tippsuche, Rollen) — das schreibt man nicht nebenbei
richtig. Ein Kalender ist dagegen ein `role="grid"` mit einem Fokuspunkt, den die
Pfeiltasten bewegen; das ist klein und klar, und Base UI hat ohnehin keinen Datepicker.
Positionierung, Schliessen bei Klick daneben und Fokusrückgabe kommen trotzdem aus dem
Popover statt aus Eigenbau.

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

## Die Seitenleiste klappt ein

Unter 1100 px Fensterbreite schrumpft sie auf 68 px und zeigt nur noch Icons. Das steuert
allein CSS (`app.css`, Abschnitt „Schmales Fenster") — kein Zustand, kein Schalter.

Der Mechanismus ist eine einzige Klasse: **was `.lbl` trägt, verschwindet dort.** Wer der
Shell etwas hinzufügt, kapselt die Beschriftung entsprechend und hängt den Namen zusätzlich
an `title` — schmal ist das Icon alles, was bleibt.

Zwei Fallen, beide schon einmal zugeschnappt:

- **Der Aktualisierungsknopf ist selbst ein `div` in der Fusszeile.** Eine pauschale Regel
  `.side .foot > div { display: none }` nimmt ihn mit, und dann fehlt bei schmalem Fenster
  der einzige Hinweis auf ein Update. Die Ausnahme steht wörtlich im CSS.
- **Auskunft darf weichen, eine Handlung nicht.** Version und Stadium fallen schmal weg,
  der Knopf bleibt. Das ist die Regel, nach der man im Zweifel entscheidet.

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

Derselbe Bereich (`konten/HerkunftBereich`) beantwortet zwei Fragen, und wer sie
gleichbehandelt, beantwortet eine davon falsch:

- **Unter der Kontenliste:** „Was steht für dieses Konto überhaupt in der Datenbank?"
  → ALLE Zeilen, aus jeder Quelle. Eine nach Abrufwegen getrennte Antwort wäre keine.
- **Unter einem Bankzugang:** „Was hat DIESER Abruf gebracht?" → nur die Läufe dieses
  Zugangs, und die Zeilen erst, wenn einer davon gewählt ist. Eine Zeile aus einer Datei
  gehört hier nicht hin, auch wenn sie zum selben Konto gehört.

Gesteuert über `zugangId`. Ohne den Parameter gilt das erste, mit ihm das zweite.

## Laden

**Verwandte Repos in EINEM Effekt per `Promise.all` laden und zusammen setzen.** Gestaffelte
`setState` lassen abgeleitete Werte kurz gegen leere Listen rechnen — ein Kategorie-Lookup
meldet dann für einen Render „ohne Kategorie", und das sieht aus wie ein Datenfehler.

## Texte

Alle Texte über `t(…)` aus `src/i18n/i18n.ts`, de und en als zwei Blöcke. Schlüsselnamen
wiederholen sich über die Namensräume vielfach (`titel`, `suche`, `bearbeiten` …) — beim
Ändern **am NAMENSRAUM ankern, nie am blossen Schlüsseltext**, sonst trifft es den falschen
Bereich. `npm test` prüft de/en-Parität, Platzhalter und dass kein `t("…")` ins Leere zeigt —
nicht aber, ob ein Schlüssel im richtigen Namensraum liegt.

## Tests für Screens

Erste Zeile `/** @vitest-environment jsdom */`, sonst laufen auch die Kern-Tests in jsdom.
`getDb` wird per `vi.mock("…/persistence/db")` auf einen `vi.hoisted`-Halter umgebogen (die
Datenbank ist je Test frisch, `vi.mock` läuft vor den Imports); `src/testwerkzeug/harness.tsx`
liefert `sqlLaden`, `frischeDb()`, `pluginApi()` und `rendere()`.

**Über `aria-label` greifen, nicht über die Rolle allein:** `getByRole("checkbox")` bricht,
sobald ein zweites Kästchen dazukommt. Derselbe Text steht oft mehrfach im DOM (Liste und
Kopfzeile desselben Screens) — dann `findAllByText`.
