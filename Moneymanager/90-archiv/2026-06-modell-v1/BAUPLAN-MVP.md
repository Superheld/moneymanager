# Moneymanager — Bauplan: Walking Skeleton → MVP-Ausbau

> **DDD-Ebene:** Lieferung — Bauplan · **Status:** aktiv · **Stand:** 2026-06-13 · **Bezüge:** ADR-0001-plattform, SPEC-MVP, ROADMAP

> Stand: 2026-06-13 · Konkretisiert ROADMAP NEXT #4 · Grundlage: ADR-0001 (Tauri + React/TS,
> hexagonal, portabler TS-Domänenkern), SPEC-MVP.md, TAKTIK-*.md.
> Prinzip: **erst ein dünner End-to-End-Durchstich** (Walking Skeleton), der jede
> Architekturnaht beweist, **dann vertikale Scheiben** mit echtem Wert. Keine horizontale
> Schicht-für-Schicht-Bauerei.

## Leitplanken fürs Bauen

- **Vertikal schneiden:** jede Scheibe geht von der UI bis zur Persistenz durch und ist
  lauffähig — nie „erst alle Aggregate, dann alle UIs".
- **Core zuerst, Core rein:** der Domänenkern (`core/`) ist pure TypeScript, ohne Tauri/IO.
  Projektion/Deckung/Matching sind side-effect-free → trivial unit-testbar.
- **Package erst zum Ist-Schritt** (ROADMAP, BUCHUNGSPACKAGE §D). Bis dahin: nichts davon
  nötig; ab Phase 3 gegen **Mock des Rechenwerks** bauen, solange nur **A5 (Schema)** steht.
- **Definition of Done je Phase** ist ein *sichtbares, lauffähiges* Ergebnis, kein Zwischenstand.

## Ordnerstruktur (ab Phase 0, hexagonal)

```
core/      reine Domäne (Aggregate, Value Objects, Domain Services) — kein Tauri, kein IO
app/       Anwendungsschicht: Use-Cases/Commands, orchestriert, ohne Geschäftslogik
adapters/  Persistenz (SQLite), UI (React), später Ledger-Port (WASM/Sidecar), Import-Parser
shell/     Tauri (Fenster, Dateizugriff, IPC)
```

---

## Phase 0 — Walking Skeleton (plan-only, kein Package)

**Ziel:** Die komplette Architektur einmal end-to-end beweisen — mit der *dünnsten* Scheibe,
die trotzdem die **Core Domain** (Projektion) berührt.

**Der eine Durchstich:**
1. Tauri 2 + React + TS läuft als Desktop-Fenster.
2. Use-Case „**Zahlungsregel anlegen**" (Betrag, Rhythmus = monatlich, Startdatum) → über
   **Repository-Port** in **SQLite** gespeichert.
3. **Projektion** (pure function in `core/`) erzeugt aus der gespeicherten Regel Planbuchungen
   für 12 Monate.
4. UI zeigt den projizierten Verlauf als simple Liste/Linie.

**Bewiesene Nähte:** Build/Run (Tauri) · React (WebView) ↔ Tauri (Rust) ↔ SQLite (der riskante
IPC-/Persistenz-Pfad) · `core/` als pure TS aufrufbar · hexagonale Ports/Adapter.

**Definition of Done:** Regel anlegen → App schließen/öffnen → Regel **und** projizierter
12-Monats-Verlauf sind wieder da. 1 Unit-Test (Projektion, ohne IO) + 1 Smoke-Test des Slice
laufen grün.

**Bewusst draußen:** Verträge, Budgets, Töpfe, Import, Ist, Mehrfachkonten, schöne UI.

---

## Phase 1 — Stammdaten-Fundament

**Ziel:** Die Bezugsdaten, auf die alles Weitere zeigt.

**Umfang:** Personen · Zahlungskonten (Typ, optional IBAN, Inhaber; internes Sachkonto-Mapping
als Platzhalter) · Kategorien als Baum (keine Zyklen, Default-Charakter). Überwiegend CRUD
(Supporting Domain — bewusst einfach).

**DoD:** Eine Zahlungsregel referenziert jetzt **echte** Konten/Kategorien; Stammdaten sind
pflegbar und reload-fest.

---

## Phase 2 — Planungs-Core (der Differenzierer, weiter plan-only, kein Package)

**Ziel:** Die vollständige Plan-Projektion aus allen Quellen — die Seele der App.

**Umfang (vertikale Scheiben in dieser Reihenfolge):**
1. **Verträge** (Stammdaten) + abgeleitete **Zahlungsregel** (Planung): eine Maske, zwei
   Commands, eventual consistent über `VertragAngelegt`. Inkl. **Einnahmen** (Charakter Ertrag)
   und **Kündigungstermin** + Erinnerung (`nächsterKündigungstermin`, `KündigungsterminNaht`).
2. **Budgets** (Reset zum Periodenende, lineare Glättung) → geglättete Plan-Abflüsse.
3. **Töpfe**: Ersatz (Rücklage), Puffer (Rückstellung), Spartopf (Freitopf) — drei Aggregate am
   gemeinsamen `Topf`-Interface, **Zielwert optional**.
4. **Liquiditätsplaner** vollständig: **zwei Kurven** — Kontosaldo (echte Flüsse) und freie
   Liquidität (= Saldo − Σ Topf-Sollstände); Deckung = freie Liquidität, **darf ins Minus**
   (Überplanung sichtbar, keine Allokation/Warnung).
5. **Szenario** (What-if, verwerfbare Delta-Schicht) — optional am Ende der Phase.

**DoD:** Aus Verträgen, Budgets und Topf-Zuführungen entsteht eine 12-Monats-Projektion je
Konto und gesamt; freie Liquidität geht bei Überplanung sichtbar ins Minus. **Eine nutzbare
Plan-only-App** — erster echter Meilenstein.

---

## Phase 3 — Ist-Schritt *(ab hier ist das Buchungspackage nötig; sonst Mock gegen A5)*

**Ziel:** Echte Bankdaten rein, Plan gegen Ist.

**Umfang:**
1. **Import** (CSV/CAMT) über Quellen-Port → Umsätze; **Duplikaterkennung** (Roh-Hash).
2. **Kategorisierung** (Regeln nach Priorität) → Vorschlag; kein Treffer → **Review-Inbox**.
3. **Verbuchung** über die ACL → Buchungssatz in der Published Language → `IstbuchungId`
   (Ledger-Package oder Mock); verbuchte Umsätze unveränderlich.
4. **Plan/Ist-Matching** (`Zuordnung`, n:m, Σ Teilbeträge ≤ Istbetrag) + Auto-Matching-Vorschlag
   auf `UmsatzVerbucht`.
5. **Liquiditätsverlauf mit Ist-Anteil**; **Topf-Verbrauch** real → Überziehung pro Topf
   sichtbar (negativer Topfstand).

**Vorbedingung:** **A5 (Buchungsformat-Schema)** steht — sonst gegen Interface/Mock des
Rechenwerks bauen.

**DoD:** Eine CSV importieren → kategorisieren → verbuchen → Plan/Ist je Kategorie/Vertrag/Topf
sehen.

---

## Phase 4 — Analysen + KI-Vorbereitung *ohne* KI

**Ziel:** MVP-Abschluss laut KONZEPT §7.

**Umfang:** Basis-Analysen (Plan/Ist je Achse, Schichten explizit benannt) · Vorschlags-Status
überall (`vorgeschlagen | bestätigt`) · Review-Inbox · Engine als Funktionskatalog ·
generische Dokumentenablage.

**DoD:** MVP-Funktionsumfang (KONZEPT §7 / SPEC-MVP) vollständig und konsistent bedienbar.

---

## Querschnitt (über alle Phasen)

| Thema | Vorgehen |
|---|---|
| **Tests** | `core/` pure functions: dichte Unit-Tests (Projektion, Deckung, Matching, Kündigungstermin). Adapter: Integrationstests (SQLite, Parser). Pro Phase ein Smoke-/E2E-Pfad des neuen Slice. |
| **Persistenz** | SQLite hinter Repository-Port; Schema wächst je Phase, Migrationen ab Phase 1. |
| **Package-Anbindung** | erst Phase 3; als WASM/Sidecar hinter Ledger-Port; vorher Mock. |
| **UI** | WebView-freundliche, gängige Bausteine (ADR-0001: Rendering variiert je OS). |
| **Auto-Update/Packaging** | Tauri-Updater einplanen, sobald Phase 2 ein vorzeigbares Ergebnis hat. |

## Reihenfolge auf einen Blick

**P0** Skeleton (Regel → Projektion → Verlauf, end-to-end) → **P1** Stammdaten → **P2**
Planungs-Core (Verträge, Budgets, Töpfe, Liquiditätsplaner) = *nutzbare Plan-App* → **P3**
Ist-Schritt (Import, Verbuchung, Plan/Ist; Package nötig) → **P4** Analysen + KI-Vorbereitung
= *MVP fertig*.
