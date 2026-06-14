# Vendored Design-System-Komponenten

Diese `.jsx`/`.d.ts`-Dateien sind **verbatim kopiert** aus dem Repo-Verzeichnis
`../../../../../design-system/components/` — der Quelle der Wahrheit. Sie werden hier
**nicht** verändert, damit es keinen Drift gibt.

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
