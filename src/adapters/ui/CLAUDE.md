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

## Die Fläche kommt von `Card`

**Inhalt steht in einer `Card`, nicht auf dem nackten Seitenhintergrund.** Sie trägt
`background: var(--surface)`, den Haarlinien-Rahmen und die Innenabstände; `.screen`
darunter ist nur ein Layout-Container ohne eigene Fläche. Ein Bereich, der seine Teile in
blanke `<div>`s setzt, sieht deshalb auf den ersten Blick „hintergrundlos" aus — und
danach fragt niemand nach dem Grund, sondern nach dem Fehler.

Selbst gezogene Rahmen (`border: 1px solid var(--line)` plus Radius) sehen ähnlich aus und
sind trotzdem falsch: die Fläche fehlt weiterhin, und beim nächsten Token-Wechsel laufen
sie gegen die Karten auseinander.

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
