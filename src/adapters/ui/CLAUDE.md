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

## Zahlen anzeigen

**`useGeld()`** — nie eigenes `toFixed`, nie an der Locale-Schicht vorbei. Die Farbe kommt
aus **`bausteine/geldFarbe.ts`**: Plus grün, Minus `--warn-deep`, Null neutral. Eine Farbregel
für die ganze App, nicht eine je Screen.

**`useProzent()`** für Anteile (0…1) — dieselbe Regel, derselbe Ort. Sie stand hier lange
nur für Geld, und direkt daneben formatierten die Depot-Anteile mit `toFixed`: im Deutschen
„12.5 %" statt „12,5 %". Eine Locale-Regel, die nur für einen Zahlentyp gilt, wird für die
anderen umgangen. `stellen` ist die Obergrenze, eine glatte Zahl bleibt glatt.

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
  `.form-grid`.
- **Die BEREICHE sind es nicht.** Ihre Raster stehen weiter als `max-width`-Abfragen
  (`ausblick-karten`) oder tragen sich über `auto-fit` selbst (`karten-paar`, `kpis`). Sie
  funktionieren schmal, aber sie sind nicht dafür entworfen — eine Tabelle scrollt dort
  waagerecht, ein Registerband ebenso. Das ist der Stand, und die Neuaufteilung kommt
  danach.

Vier Dinge, die bei jedem neuen Stück ab jetzt gelten und die man schmal nicht nachholen
kann:

- **Kein Raster ohne `min-width: 0`.** Ein Rasterkind wächst per Vorgabe mit seinem Inhalt;
  eine breite Tabelle zieht dann die ganze Seite auf, und der Scrollrahmen der `DataTable`
  kommt nie zum Zug.
- **44 px Trefferfläche** für alles, was ein Finger treffen muss.
- **Ein Eingabefeld unter 16 px lässt iOS Safari die Seite ZOOMEN**, sobald es den Fokus
  bekommt — und zurück zoomt sie nicht. `.field` ist deshalb schmal 16 px und erst ab
  700 px wieder 13,5.
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
| bis 699 px | **Schublade** — links ausserhalb des Bildes, eine Kopfleiste mit Griff holt sie herein. Beschriftungen vollständig. |
| ab 700 px | feste Spalte im Raster, 68 px, **nur Icons** |
| ab 1100 px | dieselbe Spalte mit 248 px und Beschriftung |

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
  die Zahlen darunter ehrlich hält — „über die verfügbaren Konten" ist der Grund, warum
  dasselbe Budget hier weniger Verbrauch zeigt als im Bereich Budgets.

Die Regel steht ausnahmsweise als `max-width` und nicht als Grundform: die sichtbare `h1`
aus der versteckten zurückzuholen kostet sieben Rücknahmen, und genau davor warnt die Regel
zur Icon-Stufe.

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

## Die Analyse steht in zwei Blöcken

Der obere beantwortet **„wie viel und wohin"** — Kennzahlen, Verlauf (Fluss · Saldo ·
Tabelle), der **Blick nach vorn** (`AusblickKarte.tsx`) und die Aufschlüsselung nach
Kategorien. Der untere (`BefundeBereich.tsx`) beantwortet **„und wie tragfähig ist das"**:
fest gegen frei, Budget-Treue, Ausgaben ohne Budget und ohne Vertrag, Verträge Soll gegen
Ist, Empfänger, Nutzung der Kategorien, Ausreißer.

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
  Monaten zurück und sechs voraus. Eine Projektion wird nicht besser, wenn man sie über
  zwei Jahre zieht; ihre späten Monate wären Behauptung statt Vorschau. Gezeichnet wird
  EINE Linie, deren geplanter Teil gestrichelt ist (`SaldoVerlaufChart`, `abIndex`): es
  ist derselbe Saldo, und zwei Linien behaupteten zwei Grössen.

**Ein Screen-Test, der einen Kategorienamen sucht, muss ihn jetzt in seiner Karte
suchen.** Derselbe Name steht in der Aufschlüsselung und in den Ranglisten darunter; eine
Suche über das ganze Dokument findet mehrere Elemente und bricht ab. `screens.test.tsx`
hat dafür `inAufschluesselung()`.

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
