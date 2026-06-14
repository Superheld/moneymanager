# UI-Kit — App (alle Screens)

Die vollständige Moneymanager-App im finalen Design (Richtung 02, Fokus-Layout, flache
warme Farbgebung). Jede Datei ist ein eigenständiger, voll gerenderter Screen mit App-Shell
(Sidebar + Inhalt) auf den Design-System-Tokens.

Screens: `uebersicht` · `liquiditaet` · `toepfe` · `budgets` · `vertraege` · `deckung` ·
`analysen` · `anlagen` · `vorsorge` · `stammdaten`.

**Quelle / Referenz-Implementierung:** `../../app/Moneymanager.html` (klickbarer Prototyp mit
Router + Anlegen-Dialogen). Die Screen-Renderer liegen in `../../app/s_*.js`, gemeinsame
Helfer (Charts, Pills, Tracks, KPIs, Tabellen) in `../../app/h.js`, die Komponenten-CSS in
`../../app/app.css`.

**So baust du einen neuen Screen:** App-Shell aus `app.css` übernehmen, `PageHeader` (Titel +
Kontextzeile), dann Inhalte aus den Komponenten zusammensetzen: `Card`, `KPIStat`,
`LiquidityChart`/`Donut`/`Sparkline`, `DataTable`, `Vessel`, `CoverageTrack`, `Pill`,
`Button`/`SegmentedControl`. Für Anlegen-Flows: `Dialog` + `FormField` + `RadioCard` +
`LiveResult`. Wording immer aus dem Glossar (siehe `../../readme.md`).
