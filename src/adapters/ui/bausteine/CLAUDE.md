# `bausteine/` — was mehrere Bereiche benutzen

Hier liegt, was nicht einem Bereich gehört: die Shell (`AppShell`, `Bereich`, `PageHead`),
wiederkehrende Bedienteile (`Modal`, `IconButton`, `CategoryPicker`), die Farbregel für
Beträge (`geldFarbe`) und der Einstellungs-Kontext (`EinstellungenProvider`,
`einstellungenKontext`, Quelle von `useGeld`).

**Die Regel dafür ist messbar, nicht Geschmack:** Was aus **zwei oder mehr** Bereichen
benutzt wird, gehört hierher. Was nur ein Bereich braucht, bleibt in seinem Bereichsordner
— auch wenn es „allgemein" aussieht. Ein Baustein, den nur ein Screen benutzt, ist kein
Baustein, sondern ein Teil dieses Screens.

## Der Design-System-Teil

Die `.jsx`/`.d.ts`-Dateien (`Card`, `KPIStat`, `Pill`, `CoverageTrack`, `DataTable`,
`Button`, `FormField` mit `Input`, `Dialog`) stammen aus dem Design-System, das ausserhalb
des Repos liegt. Es ist eine **Vorlage, keine Vorgabe**: was hier liegt, gehört der App und
darf geändert werden. Wer aus dem Design-System nachzieht, holt sich einen Vorschlag, keine
Wahrheit — und prüft, was hier inzwischen weiterentwickelt wurde.

`index.ts` bündelt diesen Block, damit ein Screen `from "../bausteine"` schreiben kann. Die
eigenen Bausteine daneben werden einzeln importiert.

## `Zeilenauswahl` — eine Wahl in einer Tabellenzeile

Ein Formularfeld ist für FORMULARE gebaut: volle Breite, grosse Innenabstände, eigene
Zeile. In einer Tabellenzelle sprengt es die Zeilenhöhe und erzwingt eine Spaltenbreite,
die der Inhalt nicht braucht. `Zeilenauswahl` ist so gross wie eine `Pill` daneben und
gehört dorthin, wo eine Zeile eine kleine Entscheidung trägt.

Das Gegenstück im Formular ist heute `Auswahl` (siehe unten) und war früher
`<select className="field">`; an der Aufgabenteilung ändert das nichts.

Sie ist bewusst **keine Pill-Variante**: eine Pille ist ein Etikett und sagt, was etwas
IST. Hier wird gewählt, und das muss man ihr ansehen — Rahmen, Zeiger, Auswahlpfeil. Wer
sie „Pille" nennt, baut sie früher oder später auch wie eine und verliert die Auswahl.

Zwei Dinge, die der Typ erzwingt, weil sie sonst verlorengehen:

- **`label` ist Pflicht.** In einer Tabelle steht die Beschriftung in der Kopfzeile und
  nicht am Feld; ohne den Namen meldet eine Vorlesehilfe nur „Auswahl", und die Spalte ist
  für sie verloren.
- **Gesperrtes bleibt sichtbar** (`gesperrt`, nicht weglassen). Eine Möglichkeit, die es
  gerade nicht gibt, verschwindet sonst stumm — und dann steht in der Datenbank etwas
  anderes als auf dem Bildschirm.

## `Auswahl` — die Wahl aus einer Liste

Der Ersatz für `<select className="field">` in FORMULAREN, gebaut auf Base UI
(`@base-ui/react`) — der einzigen UI-Bibliothek im Projekt.

**Warum überhaupt eine Bibliothek**, wo hier sonst alles selbst geschrieben ist: ein
natives `<select>` öffnet die Liste des Betriebssystems, und die folgt nicht dem Design der
App — andere Schrift, andere Abstände, andere Farben, je Plattform anders. In einer
Oberfläche, in der alles andere aus denselben Tokens kommt, ist genau das der sichtbare
Bruch.

**Warum nicht selbst gebaut.** Ein Auswahlfeld ist eine der undankbarsten Komponenten
überhaupt: Tastaturbedienung samt Tippsuche, ARIA zwischen Knopf und Liste, Fokusfalle,
Schliessen bei Klick daneben, Positionierung am Fensterrand. Wer das selbst schreibt, hat
am Ende eine Komponente, die mit der Maus gut aussieht und mit der Tastatur nicht
funktioniert. Base UI liefert diese Mechanik und **kein Aussehen** — das steht in
`app.css` und kommt aus denselben Tokens wie der Rest.

Zwei Dinge, die man wissen muss:

- **`items` ist nicht optional.** Ohne die Zuordnung Wert → Text zeigt der geschlossene
  Knopf den WERT an, und der ist bei uns fast überall eine UUID.
- **Die Optionen kommen als Liste, nicht als Kinder.** An den meisten Stellen entstanden
  die `<option>` ohnehin aus einem `map` über Konten, Kategorien oder Verträge — eine
  Liste hereinzureichen ist dort weniger Code als vorher, nicht mehr.

**Nicht verwechseln mit `Zeilenauswahl`.** Die ist für eine kleine Entscheidung IN einer
Tabellenzeile und so gross wie eine Pille daneben; `Auswahl` ist das Formularfeld über die
volle Breite. Die Unterscheidung ist dieselbe wie vorher zwischen `Zeilenauswahl` und
`select.field`.

**Der Bestand ist gewandert.** Seit 2026-08-25 steht in `ui/` kein natives `<select>`
mehr — ausser dem einen in `Zeilenauswahl`, und das ist eine Entscheidung: dort ist das
Feld so gross wie eine Pille daneben, und eine eigene Liste im Portal wäre für drei
Einträge in einer Tabellenzeile Aufwand ohne Gegenwert.

## `Modal` — der Dialog-Layer, und zwei Dinge, die nur verschachtelt auffallen

**Der Layer hängt per Portal am `document.body`.** Ein Modal wird dort gerendert, wo es
aufgeht — seit die Kategorie in der Auszugszeile wählbar ist, also mitten in einer
Tabellenzelle. Steht über ihm irgendwo eine `opacity` (der Auszug dämpft damit Zeilen,
deren Buchungstag noch vor uns liegt), erbt ein `position: fixed`-Kind sie: der Dialog
erscheint durchscheinend, liegt im Stapel der Zeile statt über der Seite, und der Scrim
deckt nur die Tabelle ab. Das Portal nimmt ihn aus dem Baum, und alle drei Wirkungen sind
weg. Wer den Layer je wieder inline rendert, holt sie zurück.

**Escape schliesst nur den OBERSTEN Dialog** — den auslösenden nie. Dafür führt `Modal.tsx`
eine Menge offener Nummern, und die Nummer wird beim ersten **Render** vergeben, nicht im
Effekt: React rendert von aussen nach innen und führt die Effekte von innen nach aussen
aus. Ein Stapel, in den sich jeder Dialog im Effekt einträgt, steht deshalb auf dem Kopf,
und der äussere schluckt die Taste, die dem inneren galt. Gemessen, nicht vermutet.

Geprüft in `Modal.test.tsx` — beides an einem verschachtelten Aufbau, weil ein einzelner
Dialog auf leerer Seite sich in beiden Fällen richtig verhält.

**Schwebende Ebenen ausserhalb des Modals** (Auswahlliste, Kalenderblatt) hängen ebenfalls
am body, tragen aber von sich aus keinen z-Index — und ein Modal-Layer trägt 50, gewinnt
also gegen jedes `z-index: auto`, egal wie weit hinten es im Dokument steht. Deshalb setzt
`app.css` (Abschnitt „Schwebende Ebenen") einen Wert am **Positioner**; am Popup darin
wirkte er nicht, weil nur ein positioniertes Element einen z-Index annimmt.

## Aufklappbereiche: zehn Zeilen breit, fünf Zeilen schmal

`aufklappen.ts` hält die beiden Zahlen und sonst nichts. Sie stehen in ZEILEN und nicht in
Pixeln: ein Deckel soll „hier ist mehr, als hineinpasst" sagen, und das liest man an
angeschnittenen Zeilen ab. Die Höhe einer Zeile weiss nur die Stelle, die sie zeichnet —
sie kommt von dort, die Anzahl von hier.

Zwei Zahlen, weil es zwei Breiten gibt: eine Tabelle über die volle Kartenbreite verträgt
zehn Zeilen, eine Liste in einer halb so breiten Karte steht neben einer zweiten, die
dabei mitwächst. Die Grenze folgt der Breite, nicht der Art des Inhalts.

Eine Falle: **ein Deckel gilt nicht, solange etwas DARIN aufgeklappt ist.** Sonst läge eine
Buchungstabelle in einem Rahmen von fünf Zeilen Höhe — ein Scrollbereich im Scrollbereich,
und der äussere frisst die Hälfte des inneren. So gelöst in `AnalyseScreen/GruppenSektion`.

## `CategoryPicker` — die Kategorie, in zwei Grössen

Ein Knopf, der ein Such-Modal mit dem gruppierten Kategoriebaum öffnet. `kompakt` ändert
NUR den Knopf: im Formular ein Feld über die volle Breite, in einer Tabellenzeile ein
kleines Etikett in der Grösse einer `Zeilenauswahl`. Das Modal bleibt dasselbe.

**Nicht durch eine `Zeilenauswahl` ersetzen**, auch wenn es in der Zeile danach aussieht:
die ist für eine Handvoll fester Werte gebaut. Ein Kategoriebaum braucht Gruppierung und
Suche, und die flach in eine Liste zu kippen war genau das, woran die native Fassung
gescheitert ist.

Er steht in der Kategoriespalte des Kontoauszugs, und das ist kein Beiwerk: die Kategorie
ist die Angabe, die nach einem Import am häufigsten nicht stimmt. Eine Spalte, die sie nur
ANZEIGT, schickt für jede Korrektur durch den Dialog.

**Getippt wird gesucht, mit den Pfeiltasten gewählt, mit Enter übernommen.** Der Fokus
bleibt dabei im Suchfeld — sonst könnte man nach dem ersten Pfeildruck nicht weitersuchen;
die Markierung ist deshalb nur eine Einfärbung (`data-markiert`).

Zwei Entscheidungen dazu, die man kennen muss:

- **Die Zeilen bleiben gewöhnliche `button`.** Eine `listbox` mit `option`-Zeilen wäre die
  lehrbuchgetreue Form und hätte den Weg genommen, der schon da ist: Knöpfe stehen in der
  Tab-Reihenfolge, wer nicht mit der Maus arbeitet, kommt seit jeher per Tab und Enter
  durch die Liste. Die Pfeiltasten sind ein ZUSATZ für den, der ohnehin tippt.
- **Beim Suchen markiert der erste TREFFER**, nicht die erste sichtbare Zeile. Eine Gruppe
  steht auch dann da, wenn nur eines ihrer Kinder passt — sie ist sichtbar, aber nicht
  gemeint. Dafür trägt die flache Navigationsliste je Zeile ein `treffer`-Merkmal.

## `Datumsfeld` — ein Datum eingeben oder aussuchen

Der Ersatz für `<input type="date">`. Der Wert ist immer ISO (`yyyy-mm-dd`) oder leer;
angezeigt und gelesen wird in der Sprache des Nutzers.

**Es ist eine EINGABE mit Kalenderknopf, kein blosser Knopf.** Der erste Entwurf war
letzteres — schöner anzusehen und im Gebrauch ein Rückschritt: wer ein Datum kennt, tippt
es schneller, als er es im Kalender sucht, und das native Feld konnte das. Aufgefallen ist
es daran, dass ein bestehender Screen-Test das Datum eintippte und rot wurde. Der Test
hatte recht.

**Warum hier selbst gebaut, wo `Auswahl` eine Bibliothek benutzt:** Base UI hat keinen
Datepicker (nachgesehen, nicht vermutet). Das wiegt weniger schwer, als es klingt — die
schwierige Hälfte eines Auswahlfeldes ist die Combobox-Semantik. Ein Kalender ist ein
`role="grid"` mit einem Fokuspunkt, den die Pfeiltasten bewegen, und das ist eine kleine,
klare Konvention. Positionierung, Schliessen bei Klick daneben und Fokusrückgabe kommen
trotzdem aus Base UIs Popover und werden nicht nachgebaut.

Vier Dinge, die man beim Anfassen wissen muss:

- **Die Reihenfolge von Tag und Monat kommt aus `Intl`**, nicht aus einer Annahme. `05.03.`
  und `03/05/` sind dieselben Ziffern mit anderer Bedeutung; eine feste Reihenfolge baut je
  nach Sprache still das falsche Datum.
- **ISO wird immer erkannt**, unabhängig von der Sprache — so steht es in der Datenbank,
  und wer es eintippt, meint es auch so.
- **Übernommen wird beim Verlassen und bei Enter**, nicht bei jedem Anschlag. Während
  „05.0" getippt ist, gibt es noch kein Datum.
- **Unlesbares ändert den Wert nicht**, das Feld springt zurück. Eine halb getippte Eingabe
  darf nicht als Datum durchgehen.

## `Zeilenlink` — der Bezeichner, der weiterführt

`DataTable` kann per `onRowClick` die ganze Zeile klickbar machen, und **das sieht man ihr
nicht an**: der Cursor wechselt, sonst nichts. Wer eine Tabelle vor sich hat, probiert
nicht jede Zeile durch — er sieht keine Möglichkeit und geht davon aus, dass es keine gibt.
Genau so ist die Verwaltung lange dagesessen, vier Register voller Tabellen, in denen
nichts zu klicken schien.

Ein Link im Bezeichner zeigt sich dagegen selbst an. Er ist die kleinere Trefferfläche und
trotzdem der bessere Weg, weil man ihn überhaupt findet.

**Wohin er führt: nach UNTEN, nicht woandershin.** Der Klick klappt das Gewählte unter der
Tabelle auf — derselbe Aufbau wie im Kontoauszug, wo unter der Kontenliste das gewählte
Konto steht. Ein Sprung in ein anderes Register ist schneller gebaut und im Gebrauch
schlechter: man verliert die Zeile aus den Augen, von der man ausgegangen ist, und muss
zurück, um die nächste anzusehen. Der zweite Klick auf denselben Bezeichner klappt wieder
zu.

**Nicht verwechseln mit `.linkbtn`.** Die Klasse gibt es schon und sie ist für das
Gegenteil da: eine gedämpfte NEBENAKTION in einer Zeile („Profil ansehen"), die sich
zurückhalten soll. `Zeilenlink` ist der Weg weiter und muss sich zeigen — Akzentfarbe,
Unterstrich.

**Es ist ein `button`, kein `a`:** innerhalb der App wird nicht navigiert, sondern ein
Register gewechselt. Es gibt keine Adresse zum Kopieren. Ein `a` ohne `href` wäre für eine
Vorlesehilfe gar nichts, eines mit `href="#"` ein Versprechen, das die App nicht hält.

**`titel` ist Pflicht** und ein ganzer Satz. „Girokonto" allein sagt einer Vorlesehilfe
nicht, dass hier etwas passiert, und dem Sehenden nicht, was.

## `useSchmal` — die einzige Layout-Frage in JavaScript

Sonst gilt: die Fensterbreite ist eine Frage, die CSS selbst beantwortet, und in `app.css`
steht die schmale Form ohne Abfrage da. Das reicht, solange sich nur das AUSSEHEN ändert.

Es reicht nicht, wo sich das **Markup** ändert. `DataTable` wird unter 700 px aus einer
Tabelle mit sechs Spalten eine mit zwei, in der die übrigen Werte als zweite Zeile unter
dem Namen stehen. **Zellen zusammenzulegen kann CSS nicht** — es kann sie nur verstecken,
und das hiesse, ihren Inhalt wegzuwerfen statt ihn zu verschieben.

Zwei Dinge, die man beim Benutzen wissen muss:

- **Ohne `matchMedia` gilt BREIT.** jsdom bringt es nicht mit; ohne diesen Ausweg fiele
  jeder Screen-Test um, und mit einer Meldung, die nach der Komponente aussieht statt nach
  der Umgebung. Wer die schmale Form prüfen will, stellt `window.matchMedia` selbst —
  `DataTable.test.tsx` zeigt wie.
- **Die Schwelle steht zweimal da**, hier und in `app.css`. Eine Medienabfrage kann keine
  CSS-Variable lesen (Spezifikation, kein Rückstand der Browser). Wer sie hebt, hebt sie an
  beiden Stellen.

Es ist `useSyncExternalStore` und nicht `useState` plus Effekt: der ERSTE Render muss schon
stimmen, sonst zeichnet ein Telefon einmal die breite Tabelle und ersetzt sie im nächsten
Bild.

## `DataTable` schmal: zwei Spalten, und die Vorgabe wirft nichts weg

Auf einem Telefon war der Scrollrahmen bisher die ganze Antwort: man sah die ersten Spalten
und musste seitwärts schieben, um an den Betrag zu kommen — also an das, wofür man
hingesehen hat. Schmal fällt die Tabelle deshalb auf zwei Spalten zusammen: links der
Bezeichner mit den verschobenen Werten gedämpft darunter, rechts die eine Zahl.

**Es bleibt eine Tabelle und wird keine Kartenliste.** Die Zahl steht in jeder Zeile an
derselben Stelle, und damit bleibt das Einzige erhalten, wofür eine Tabelle da ist: eine
Spalte hinunterlesen, ohne sie zu suchen. Aus demselben Grund bleiben die beiden
Spaltenköpfe stehen — mit ihnen ginge sonst auch die Sortierung, und die zeigt weiterhin
auf die ursprüngliche Spalte, nicht auf die zweite von zwei.

**Die Vorgabe verschiebt, sie streicht nicht.** Ohne Angabe wird die erste Spalte zum
Titel, die erste rechtsbündige zum Wert, und alles Übrige wandert in die zweite Zeile. Das
sieht unaufgeräumt aus und ist Absicht: eine Spalte still fallen zu lassen wäre in einer
Finanz-App eine gekürzte Auskunft, die niemand entschieden hat — und über zwanzig Tabellen
tragen (noch) keine Angabe.

**Aufgeräumt wird je Tabelle, über `column.schmal`** (`titel` · `wert` · `zweitzeile`).
Sobald EINE Spalte das setzt, gilt nur noch das Gesetzte und der Rest fällt weg. Der
Mechanismus ermöglicht das Wegräumen, er nimmt es nicht vorweg.

Eine Zahl steckt darin, die man kennen muss: schmal liegt **`table-layout: fixed`** an und
die Wertspalte ist auf `12ch` festgelegt. Ohne beides zöge ein langer Name die Tabelle
wieder aus dem Bild — genau das Übel, gegen das die schmale Form gebaut ist.

## `Dialog` schmal: ueber die ganze Hoehe, Fusszeile bleibt stehen

Breit ist er eine 680er Box mit 48 px Luft darueber. Auf einem Telefon hiess das:
Formular ausfüllen, scrollen, „Speichern" suchen — und der Knopf lag unter dem Bildrand,
**ohne dass man das sieht**: der Dialog ist ein eigener Scrollbereich, der Rest der Seite
steht still, es gibt also kein Anzeichen, dass da noch etwas kommt.

Schmal füllt er deshalb den Bildschirm und wird zu drei Teilen, von denen nur der mittlere
scrollt: Kopf, Inhalt, Fusszeile. Damit ist die Handlung immer sichtbar — dieselbe Regel
wie beim Update-Knopf in der Seitenleiste: **Auskunft darf weichen, eine Handlung nicht.**

Zwei Dinge, die man beim Anfassen wissen muss:

- **`position: sticky` an der Fusszeile ist hier der falsche Weg**, obwohl er kürzer wäre.
  Die Box trägt `overflow: hidden` für ihre runden Ecken und ist damit selbst ein
  Scrollbereich, in dem nichts scrollt; das Sticky hätte keine Wirkung, und man sähe es ihm
  nicht an. Drei Teile mit einem scrollenden Mittelstück sagen, was gemeint ist.
- **`minHeight: 0` am Inhalt ist Pflicht.** Ein Flex-Kind besteht sonst auf seiner
  Inhaltshöhe und schiebt die Fusszeile aus dem Bild — genau der Fehler, der behoben werden
  sollte, nur eine Ebene tiefer.

Die Ränder folgen `env(safe-area-inset-*)`: schmal liegt der Dialog unter der Kerbe und
über der Wischleiste, und beide sind je nach Gerät verschieden hoch.

## Zwei Fallen, die man kennen muss

**`DataTable` ist die App-Fassung**, nicht die des Design-Systems: sie trägt Sortierung,
Pagination, Zeilenklick, Spaltenbreiten, feste Zeilenhöhe, die Breitenkappung (innerer
Block mit `max-width` je Zelle, plus Fangnetz-Scrollrahmen) und `rowStyle`. Beim Nachziehen
aus dem Design-System nicht überschreiben — dort ist weniger drin.

`rowStyle(row)` liegt ZULETZT auf der Zeile und ist für `opacity` gedacht: das dämpft den
ganzen Teilbaum auf einmal, auch die Zellen, die ihre Farbe selbst setzen (Beträge). Über
`color` ginge das nicht, die Zellen überschreiben es. Benutzt wird es im Kontoauszug für
Buchungen, deren Buchungstag noch vor uns liegt.

**`Input` hat kein `onChange`** und ist für berechnete oder abgeleitete Felder gedacht.
Editierbare Texteingaben bauen wir mit echten `<input>` im selben Token-Stil. Wer das
übersieht, baut ein Feld, das sich nicht tippen lässt. Für eine AUSWAHL gilt das nicht mehr
— dafür gibt es `Auswahl` (siehe oben).

Die Tokens liegen getrennt unter `src/styles/`, nicht hier.
