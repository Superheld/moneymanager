# Moneymanager — Design System

Eine lokale Finanzverwaltungs-App, die das Denken des betrieblichen Rechnungswesens
(Liquiditätsrechnung, Rücklagen, Abschreibungen, Bilanz) auf Privathaushalte überträgt —
in einer Sprache, die normale Menschen verstehen. Die App ist *heimlich eine private Bilanz
plus Finanzplan*: Sie unterscheidet **Plan vs. Ist**, **Ausgabe vs. Vermögensumschichtung**
und **Zweckbindung vs. Liquidität**.

Dieses Design-System hält die visuelle Sprache fest, mit der dieses Konzept alltagstauglich
wird: ruhig, warm, fokussiert — ein gut gesetztes Finanzdokument statt eines lauten Dashboards.

**Quellen / Herkunft.** Abgeleitet aus der Hi-Fi-Exploration in `../hifi/` (Richtung 02
„Freundlich & modern", Fokus-Layout mit flacher Farbgebung) und den Lo-Fi-Wireframes in
`../wireframes.html`. Das fachliche Glossar stammt aus dem Produktkonzept (siehe unten).

---

## Index / Manifest

- `styles.css` — globaler Einstieg (nur `@import`). Konsumenten verlinken diese Datei.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `radius.css`, `shadow.css`, `fonts.css`
- `components/` — wiederverwendbare Primitive:
  - `core/` — `Pill`, `Card`, `KPIStat`, `CoverageTrack`, `NavItem`
  - `charts/` — `LiquidityChart` (Ist/Plan-Jahreskurve), `Donut`, `Sparkline`
  - `data/` — `DataTable` (Haarlinien-Tabelle), `Vessel` (Topf-Füllstand)
  - `controls/` — `Button`, `SegmentedControl`
  - `forms/` — `Dialog`, `FormField` (+ `Input`), `RadioCard`, `LiveResult`
  - `layout/` — `PageHeader` (+ Kontextzeile), `ScenarioChip`
- `ui_kits/uebersicht/` — Übersicht-Screen (Einzel-Kit)
- `ui_kits/app/` — **alle 10 App-Screens** als eigenständige Layouts (`uebersicht`, `liquiditaet`,
  `toepfe`, `budgets`, `vertraege`, `deckung`, `analysen`, `anlagen`, `vorsorge`, `stammdaten`)
- `app/` — **Referenz-Implementierung**: klickbarer Prototyp (`Moneymanager.html`) mit Router,
  Screen-Renderern (`s_*.js`), Anlegen-Dialogen (`s_flows.js`) und gemeinsamen Helfern (`h.js`)
- `Design System.html` — Galerie aller Bausteine + Screens auf einer Seite (ohne DS-Tab)
- `guidelines/` — Foundation-Specimen-Cards
- `SKILL.md` — Agent-Skill-Einstieg

## Einen Screen zusammensetzen (statt neu bauen)

1. **App-Shell** aus `app/app.css` (Sidebar `.side` + `.main`), Marken-Mark oben.
2. **`PageHeader`** mit Titel, Untertitel, Kontextzeile (Datum + `ScenarioChip`) und rechts
   `SegmentedControl`/`Button`.
3. **KPI-Reihe**: 3–4 `KPIStat` (genau eine `hero`-Zahl pro Screen, Rest `chip`).
4. **Inhalt** in `Card`-Flächen: `LiquidityChart` / `Donut` / `Sparkline` für Visuals,
   `DataTable` für Listen, `Vessel` + `CoverageTrack` für Töpfe/Budgets, `Pill` für Charakter.
5. **Anlegen-Flow**: `Dialog` mit `FormField`/`Input`, `RadioCard` für lehrende Auswahlen,
   `LiveResult` für die Live-Rechnung.
6. **Wording** immer aus dem Glossar; **Plan = gestrichelt Teal, Ist = solide Ink**; Beträge
   tabular mit `−` (U+2212).

> Die Screens in `ui_kits/app/` zeigen genau diese Komposition — als Vorlage kopierbar.

---

## CONTENT FUNDAMENTALS — wie wird getextet?

- **Sprache:** Deutsch. **Anrede „du"**, persönlich, nie belehrend. Beispiel:
  „*Dir stehen heute 4.180 € zur Verfügung.*", „*Deine Töpfe sind zu 86 % gedeckt.*"
- **Fachlich streng innen, alltagstauglich außen.** Das Datenmodell nutzt präzise
  Rechnungswesen-Begriffe, die UI übersetzt sie **konsequent** (Glossar = verbindliches
  UI-Wording **und** Ubiquitous Language im Code).
- **Ton:** sachlich-freundlich, knapp. Zahlen sprechen, kein Marketing-Sprech, keine Ausrufe.
- **Klartext-Sätze statt Kennzahl-Wüsten:** zentrale Lage in *einem* Satz zusammenfassen
  („… nur Ende **Juli** wird es mit **1.500 €** kurz eng.").
- **Casing:** Fließtext normal; Eyebrows/Sektionslabels in VERSALIEN mit weitem Tracking
  (`--ls-eyebrow`). Keine Title-Case-Erfindungen.
- **Keine Emoji.** Symbole sparsam (Unicode-Pfeile/Häkchen in Formularen okay).
- **Vorzeichen & Einheiten:** Beträge mit Tausenderpunkt (de-DE), `€` als kleines Suffix,
  Minus als Gedankenstrich-Minus „−" (U+2212), nicht Bindestrich.

### Glossar — Modell → UI-Wording (verbindlich)

| Fachbegriff (Code/Modell) | UI für Menschen |
|---|---|
| Rücklage | **Spartopf** (für Ersatz) |
| Rückstellung | **Puffer** (für Überraschungen) |
| Abschreibung / Ansparrate | **Ansparrate** |
| Liquidität | **Verfügbares Geld** |
| Umschichtung | **Sparen/Anlegen** (kein Verbrauch) |
| Deckungsgrad | **„Wie gut ist der Topf finanziert?"** |
| Aktiva / Anlage | **Vermögen** |
| Haushalt | dein eine Datenbestand |

---

## VISUAL FOUNDATIONS

**Gesamtcharakter.** Warm, ruhig, fokussiert. Ein klares Zentrum (eine große Zahl) statt
gleichwertiger Kacheln. Eher „gut gesetztes Dokument" als „Tool". Flach — Haarlinien
statt Schatten; Schatten nur für wirklich schwebende Flächen.

**Farbe.** Warm-neutrale Basis (Creme `--cream`, Karten fast weiß `--surface`, Hue ~80–85,
Sättigung sehr niedrig). **Ein** Akzent: Teal (`--accent` / `--accent-deep` für Text auf
hell, `--accent-wash` als getönter Hintergrund). Semantik: **Plan = Teal**, **Ist = Ink**,
**Engpass/über Budget = Amber** (`--warn`), **Ertrag/gedeckt = Grün** (`--ok`). Akzent wird
sparsam gesetzt — er markiert *Plan* und *Marke*, nicht Dekoration. **Keine Farbverläufe**
auf Flächen (bewusst entfernt — wirkte „gemacht").

**Typografie.** Eine Familie: **Hanken Grotesk** (400–800). Große Zahlen sehr fett
(`--fw-black`) mit engem Tracking (`--ls-tight`); Fließtext 15px/1.55; Sektionslabels als
VERSALIEN-Eyebrows. Beträge & ausgerichtete Zahlen mit **Tabularziffern** (`.num`).

**Charts.** Sehr reduziert. **Ist = durchgezogene Ink-Linie**, **Plan = gestrichelte
Teal-Linie**, dünne Flächenfüllung unter Plan. „heute"-Linie gestrichelt amber. Engpass als
amberner Punkt mit Label. Achsen/Grid in `--line`, Labels in `--ink-3`. Keine 3D, keine
Schlagschatten, keine Legenden-Kästen.

**Karten & Container.** Hintergrund `--surface`, Haarlinie `--border`, Radius `--r-xl`
(18px) bis `--r-2xl` (24px für große Container). Innenabstand `--pad-card` (24px). Default
**ohne Schatten**; `--shadow-card` nur für floatende/abgehobene Elemente.

**Pills/Tags.** Vollrund (`--r-pill`), 1px Border, Text in der jeweiligen Semantikfarbe.
„Umschichtung" = teal umrandet (kein Verbrauch!), „Einnahme" = grün, „Aufwand" = neutral.

**Tracks/Balken (Deckung, Budget).** Höhe 7px, vollrund, Schiene `--line`, Füllung
`--accent`; bei Überschreitung `--warn`. Beschriftung „Ist / Soll €" rechts, tabular.

**Layout.** Übersicht ist **asymmetrisch**: breiter Hero links (Fokus-Zahl + Verlauf +
Klartext), schmale ruhige Spalte rechts (Zahlungen, Budgets, Hinweise). App-Shell: linke
Sidebar `--surface`, Inhalt auf `--cream`. Großzügige Gutter (`--pad-screen`).

**Radius-System.** Inputs 7px · Nav/Chips 11px · Stat-Tiles 15px · Karten 18px ·
große Container 24px · Pills/Avatare vollrund.

**Bewegung.** Zurückhaltend. Sanfte Fades/Hover (Hintergrund nach `--cream`/`--accent-wash`),
keine Bounces, keine Dauer-Loops. `prefers-reduced-motion` respektieren.

**Hover/Press.** Hover: dezent getönter Hintergrund (`--cream` bzw. `--accent-wash`),
keine harten Farbsprünge. Aktiv/ausgewählt: `--accent-wash` Fläche + `--accent-deep` Text.

---

## ICONOGRAPHY

Bewusst **icon-arm**. Statt eines Icon-Sets tragen **Typo, Farbe und kleine geometrische
Marker** die Bedeutung: runde Statuspunkte (`--warn`/`--ink-3`), kurze Linien-Swatches in der
Chart-Legende, vollrunde Pills. Brand-Mark = abgerundetes Quadrat mit „M" auf `--accent`.
**Keine Emoji.** Falls künftig ein Icon-Set nötig wird: dünn-strichige, runde Linien-Icons
(z. B. Lucide) passen zur Tonalität — dann per CDN einbinden und hier dokumentieren.

---

## Hinweis für die Freigabe

Damit andere im Team dieses Design-System sehen, in den **Share**-Menü den Dateityp auf
**Design System** stellen.
