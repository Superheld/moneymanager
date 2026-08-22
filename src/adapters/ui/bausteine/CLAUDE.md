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

## `Auswahlpille` — eine Wahl in einer Tabellenzeile

Ein `<select className="field">` ist für FORMULARE gebaut: volle Breite, grosse
Innenabstände, eigene Zeile. In einer Tabellenzelle sprengt es die Zeilenhöhe und erzwingt
eine Spaltenbreite, die der Inhalt nicht braucht. `Auswahlpille` ist so gross wie eine
`Pill` daneben und gehört dorthin, wo eine Zeile eine kleine Entscheidung trägt.

Sie ist bewusst **keine Pill-Variante**: eine Pille ist ein Etikett und sagt, was etwas
IST. Hier wird gewählt, und das muss man ihr ansehen — Rahmen, Zeiger, Auswahlpfeil.

Zwei Dinge, die der Typ erzwingt, weil sie sonst verlorengehen:

- **`label` ist Pflicht.** In einer Tabelle steht die Beschriftung in der Kopfzeile und
  nicht am Feld; ohne den Namen meldet eine Vorlesehilfe nur „Auswahl", und die Spalte ist
  für sie verloren.
- **Gesperrtes bleibt sichtbar** (`gesperrt`, nicht weglassen). Eine Möglichkeit, die es
  gerade nicht gibt, verschwindet sonst stumm — und dann steht in der Datenbank etwas
  anderes als auf dem Bildschirm.

## Zwei Fallen, die man kennen muss

**`DataTable` ist die App-Fassung**, nicht die des Design-Systems: sie trägt Sortierung,
Pagination, Zeilenklick, Spaltenbreiten, feste Zeilenhöhe und die Breitenkappung (innerer
Block mit `max-width` je Zelle, plus Fangnetz-Scrollrahmen). Beim Nachziehen aus dem
Design-System nicht überschreiben — dort ist weniger drin.

**`Input` hat kein `onChange`** und ist für berechnete oder abgeleitete Felder gedacht.
Editierbare Eingaben bauen wir mit echten `<input>`/`<select>` im selben Token-Stil. Wer das
übersieht, baut ein Feld, das sich nicht tippen lässt.

Die Tokens liegen getrennt unter `src/styles/`, nicht hier.
