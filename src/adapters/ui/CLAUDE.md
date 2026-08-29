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

## Der Buchungsdialog liegt in Teilen

`buchung/BuchungDetail.tsx` trägt das Formular — alle drei Rollen (anlegen, Entwurf
prüfen, bearbeiten) in EINER Maske, und das bleibt so: jede Erweiterung soll an einer
Stelle ankommen statt an dreien. Was daneben liegt, braucht den Zustand der Maske nicht
und wurde deshalb 2026-08-25 herausgezogen:

| Datei | beantwortet |
|---|---|
| `VertragsBlock` | gehört diese Zahlung zu einem Vertrag? |
| `DublettenBlock` | steht sie womöglich schon ein zweites Mal da? |
| `BuchungsHerkunft` | woher sie kommt — reine Anzeige |
| `JournalBlock` | was daran geändert wurde — und der Weg zurück |
| `Richtungswahl` | Höhe und Richtung des Betrags, samt der Zerlegung dahinter |
| `SplitModal` · `ZurUmbuchungModal` | die beiden Folge-Dialoge (S-7, S-1) |

**Das Kriterium war nicht die Grösse, sondern die Abhängigkeit:** herausgezogen ist, was
seine Daten hereinbekommt und Entscheidungen zurückmeldet. Der Rest gehört zum Formular
und bleibt dort, auch wenn die Funktion damit die grösste im Bereich ist.

Keins davon ist ein `bausteine/`-Kandidat: alle werden von genau einem Screen benutzt
(siehe `bausteine/CLAUDE.md`). `buchung/ddmm.ts` ist die Ausnahme von der Ausnahme — vier Zeilen,
drei Nutzer im selben Bereich, und kein natürlicher Besitzer; über `BuchungDetail` zu
importieren hätte einen Ring gebaut.

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

Die Regel dahinter ist dieselbe wie bei `Zeilenauswahl`: **die Grösse eines Bedienteils
folgt dem, wo es steht, nicht dem, was es tut.**

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

## Was im Konto steht, hat jemand belegt

Die Vorschau — heute in der Übersicht, damals neben dem Auszug — ZEIGT, was kommt; sie
bucht es nicht. Bis 2026-08-25 hing an jeder geplanten Zeile ein Kästchen „als bezahlt markieren", und ein Klick legte daraus eine
Ist-Buchung an (`quelle: "bezahlt-markiert"`). Damit stand im Konto eine Zahlung, die
niemand belegt hatte: die Bank kannte sie nicht, ein Beleg existierte nicht, und beim
nächsten Abruf kam die echte Zeile zusätzlich dazu.

**Eine Ist-Buchung entsteht nur noch auf zwei Wegen: aus dem Abruf/Import oder von Hand.**
Eine Hochrechnung ist kein dritter. Der Use-Case dahinter ist entfernt, geprüft in
`interaktion.test.tsx`.

Zwei Reste stehen bewusst noch: `IstQuelle` kennt weiterhin `"bezahlt-markiert"` und
`IstBuchung.planRef` gibt es noch — beides nur zum LESEN, damit ein Bestand mit solchen
Zeilen sich nicht selbst widerspricht. Erzeugen kann sie nichts mehr; wer sie ganz abräumt,
fasst dabei das Schema, den Monatsausblick (Status `bezahlt`) und die Projektion mit an.

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

## Wie breit eine Seite wird

`.screen` deckelt bei **1280 px**, nicht mehr bei 1040. Der alte Wert war der klassische
Lesedeckel und hier am falschen Inhalt gemessen: diese App liest man nicht, man sucht darin.
Konten, Analyse, Verträge, Inventar, Import und die Verwaltung führen alle mit einer
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
