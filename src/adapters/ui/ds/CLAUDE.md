# `ds/` — kopierte Design-System-Bausteine

Diese `.jsx`/`.d.ts`-Dateien sind **Kopien**, keine eigene Arbeit. Sie stammen aus dem
Design-System, das außerhalb des Repos liegt und in einem Klon nicht vorhanden ist.

**Hier nichts erfinden.** Eigene Bausteine gehören eine Ebene höher nach `ui/`. Wer eine
Datei in diesem Verzeichnis ändert, ändert eine Kopie: beim nächsten Abgleich ist die
Änderung weg, und bis dahin weicht die App unbemerkt vom System ab.

## Die zwei Ausnahmen, die man kennen muss

**`DataTable` ist hier die Quelle der Wahrheit.** Die App-Fassung ist dem Design-System
vorausgelaufen und trägt Sortierung, Pagination, Zeilenklick, Spaltenbreiten, feste
Zeilenhöhe und die Breitenkappung (innerer Block mit `max-width` je Zelle, plus
Fangnetz-Scrollrahmen). Sie darf beim Aktualisieren **nicht blind überschrieben** werden.
Alle übrigen Dateien sind verbatim kopiert.

**`Input` aus dem DS ist nur Anzeige** — es hat kein `onChange` und ist für berechnete oder
abgeleitete Felder gedacht. Editierbare Eingaben bauen wir mit echten `<input>`/`<select>`
im selben Token-Stil. Wer das übersieht, baut ein Feld, das sich nicht tippen lässt.

## Was hier liegt

`Card` · `KPIStat` · `Pill` · `CoverageTrack` · `DataTable` · `Button` · `FormField` (+ `Input`)
· `Dialog` — geholt wird nur, was die App wirklich braucht.

Die Tokens liegen getrennt unter `src/styles/`, nicht hier.

## Aktualisieren

Die benötigten Dateien aus dem Design-System hierher kopieren und `index.ts` ergänzen —
`DataTable` dabei aussparen (siehe oben). Da das Design-System nicht im Repo liegt, geht das
nur an einem Arbeitsplatz, der es hat; ein Klon kann diese Dateien nur benutzen, nicht
abgleichen.
