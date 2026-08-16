# Vendored Design-System-Komponenten

Diese `.jsx`/`.d.ts`-Dateien stammen aus dem Repo-Verzeichnis
`../../../../../design-system/components/` und werden von dort übernommen.

**Ausnahme `DataTable`:** die App-Fassung ist dem Design-System vorausgelaufen und trägt
Sortierung, Pagination, Zeilenklick, Spaltenbreiten, feste Zeilenhöhe und die Breitenkappung
(innerer Block mit `max-width` je Zelle, Fangnetz-Scrollrahmen). Sie ist hier die
Quelle der Wahrheit; wer das Design-System aktualisiert, darf sie nicht blind überschreiben.
Alle übrigen Dateien sind verbatim kopiert und werden hier nicht verändert.

**Prinzip:** Wir holen nur die Komponenten, die die App wirklich braucht. Aktuell:

| Datei | Herkunft im Design-System |
|---|---|
| `Card` | `components/core/Card` |
| `KPIStat` | `components/core/KPIStat` |
| `Pill` | `components/core/Pill` |
| `CoverageTrack` | `components/core/CoverageTrack` |
| `DataTable` | `components/data/DataTable` |
| `Button` | `components/controls/Button` |
| `FormField` (+ `Input`) | `components/forms/FormField` |
| `Dialog` | `components/forms/Dialog` |

`Input` aus dem DS ist **nur Anzeige** (kein `onChange`) — gedacht für berechnete/
abgeleitete Felder. Editierbare Eingaben bauen wir mit echten `<input>`/`<select>`
im selben Token-Stil.

**Aktualisieren:** wenn das Design-System wächst, die benötigten Dateien neu aus
`design-system/components/<kategorie>/` hierher kopieren und `index.ts` ergänzen.
Tokens liegen separat unter `src/styles/`.
