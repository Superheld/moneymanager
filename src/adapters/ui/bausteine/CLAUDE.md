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

Ein `<select className="field">` ist für FORMULARE gebaut: volle Breite, grosse
Innenabstände, eigene Zeile. In einer Tabellenzelle sprengt es die Zeilenhöhe und erzwingt
eine Spaltenbreite, die der Inhalt nicht braucht. `Zeilenauswahl` ist so gross wie eine
`Pill` daneben und gehört dorthin, wo eine Zeile eine kleine Entscheidung trägt.

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

## Zwei Fallen, die man kennen muss

**`DataTable` ist die App-Fassung**, nicht die des Design-Systems: sie trägt Sortierung,
Pagination, Zeilenklick, Spaltenbreiten, feste Zeilenhöhe und die Breitenkappung (innerer
Block mit `max-width` je Zelle, plus Fangnetz-Scrollrahmen). Beim Nachziehen aus dem
Design-System nicht überschreiben — dort ist weniger drin.

**`Input` hat kein `onChange`** und ist für berechnete oder abgeleitete Felder gedacht.
Editierbare Eingaben bauen wir mit echten `<input>`/`<select>` im selben Token-Stil. Wer das
übersieht, baut ein Feld, das sich nicht tippen lässt.

Die Tokens liegen getrennt unter `src/styles/`, nicht hier.
