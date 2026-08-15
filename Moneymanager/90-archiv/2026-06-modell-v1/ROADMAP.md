# Moneymanager — Roadmap

> **DDD-Ebene:** Lieferung — Roadmap (Now/Next/Later) · **Status:** aktiv · **Stand:** 2026-06-20 · **Bezüge:** KONZEPT, SPEC-MVP, BAUPLAN-MVP

> Stand: 2026-06-20 (zuletzt geradegezogen) · Format: Now / Next / Later · Team: Bruce + Claude
> Grundlage: KONZEPT.md (§ 7 Feature-Schnitt), KI-KONZEPT.md, DDD-Vorgehen

## Leitplanken

- **Reihenfolge schlägt Datum.** Solo-Projekt → keine Quartalsversprechen, nur verlässliche Sequenz.
- **Design vor Code.** Strategisches DDD wird abgeschlossen, bevor taktisches Design und
  Implementierung beginnen — Core Domain verdient die Denkarbeit.
- **Buchungspackage erst zum Ist-Schritt.** Es wird erst zur echten Abhängigkeit, wenn echte
  Ist-Buchungen entstehen (Import → Ist-Journal). Die Basis (Stammdaten, Verträge, Inventar,
  Budgets, Plan-only-Projektion) ist app-seitig ohne das Package baubar.

---

## Gebaut — Stand v0.9.0 (2026-06-20)

Die App ist über die reine Plan-Projektion hinaus; der Ist-Schritt läuft app-seitig
(Ledger-Port), das Buchungspackage ist dafür noch **nicht** gebunden.

| Phase | Inhalt | Stand |
|---|---|---|
| P0 | Walking Skeleton (Regel → Projektion → SQLite) | ✓ |
| P1 | Stammdaten (Personen, Konten, Kategorien) | ✓ |
| P2 | Verträge · Budgets · Inventar/Töpfe · Liquiditätsplaner · Szenario | ✓ |
| P3 | Ist „light" (ADR-0002): bezahlt-markieren, Ledger-Port, Reconciliation light, Konto-Register, Umbuchen | ✓ |
| P3.1 | Topf-Entnahme als Buchungssatz, realer Topf-Stand, Budget Plan/Ist (ADR-0003) | ✓ |
| — | Internationalisierung: Sprache + Mehrwährung, strikt locale-gekoppelt (ADR-0004) | ✓ (v0.8.0) |

Damit haben **alle drei Plan-Flächen** (Verträge, Budgets, Töpfe/Inventar) einen Ist-Abgleich.
Die Zuordnung läuft über das benannte Gegenkonto, nicht über die Kategorie (ADR-0003).

---

## NOW — Strategisches Design abschließen ✓ (2026-06-07)

Ergebnis in **DOMAENENDESIGN.md** und **BUCHUNGSPACKAGE-ANFORDERUNGEN.md**.

1. ✓ Bounded Contexts: Ledger · Planung · Stammdaten · Import · Vorsorge
   (Stammdaten ↔ Planung: getrennte Kontexte, gemeinsame UI)
2. ✓ Ubiquitous Language je Kontext, Mehrdeutigkeiten aufgelöst (Vertrag, Konto, Buchung)
3. ✓ Context Map (Ledger als Open-host Service / Published Language)
4. ✓ Anforderungen ans Buchungspackage dokumentiert (A1–A8) — **an Package-Projekt übergeben!**

## NEXT — Taktisches Design + MVP-Spec

Ziel: Entwicklerfreundliche Spec, dann Baustart.

1. **Taktisches Design je Kontext** — Aggregates, Entities, Value Objects, Domain Events
   - ✓ Planung (TAKTIK-PLANUNG.md) · ✓ Stammdaten (TAKTIK-STAMMDATEN.md) ·
     ✓ Import (TAKTIK-IMPORT.md) — alle 2026-06-07; Vorsorge folgt in LATER
2. ✓ **MVP-Spec** (SPEC-MVP.md, 2026-06-13) — User Stories, Akzeptanzkriterien, Datenmodell-Skizze
3. ✓ **Plattform-Entscheidung** (ADR-0001-plattform.md, 2026-06-13): lokale Desktop-App,
   React + TypeScript, **Tauri**; portabler TS-Domänenkern (hexagonal) hält Server/Browser-
   und Mobile-Pfad offen.
4. **MVP bauen** (KONZEPT § 7, Stufe 1):
   - Stammdaten: Personen, Konten, Kategorien
   - Vertragsverwaltung inkl. Einnahmen + Kündigungsfristen-Erinnerung
   - Rücklagen (Inventar → Ansparrate) + Rückstellungen
   - Budgetplaner
   - Liquiditätsplaner (Jahresprojektion, Plan-only)
   - CSV/CAMT-Import + regelbasierte Kategorisierung  *(ab hier Buchungspackage nötig)*
   - Plan/Ist-Abgleich, Basis-Analysen
   - Dazu die KI-Vorbereitungen ohne KI (KI-KONZEPT § 4): Vorschlags-Status,
     Review-Inbox, Engine als Funktionskatalog, Dokumentenablage

**Abhängigkeit (Stand 2026-06-20):** Die Basis des MVP rechnet app-seitig, ohne Package —
das ist gebaut. Der Ist-Schritt „light" läuft ebenfalls app-seitig hinter dem `LedgerPort`
(ADR-0002/0003). Das echte Buchungspackage **summae** wird erst zur Abhängigkeit, wenn der
**Bankimport** kommt (Import → Ist-Journal, Stichtagssalden, KLR, Plan/Ist auf echter Masse).

**summae-Prüfung (2026-06-20):** Der Doppik-/KLR-Kern ist reif und deckt **A1–A8** ab
(A5-Datenformat versioniert als JSON-Schema v0.4; pure-function-Rechenwerk, Stichtagssalden,
Dimensionen, stabile UUID-v7-IDs, Storno bidirektional, konfigurierbarer Kontenrahmen).
summae existiert in PHP (Referenz) und **TypeScript/Node** (byte-identisch über eine gemeinsame
Testsuite) — **noch nicht in Rust**. Offen buchungsseitig nur **A4** (kalkulatorische Buchungen
über Dimensionen gelöst, nicht als eigene Buchungsart markiert) — heute irrelevant, weil wir die
kalkulatorische Abschreibung app-seitig als Plan rechnen.

**Anbindung (entschieden 2026-06-20): TS-Kern in die Webview bündeln.** Der TS-Kern hängt nur
von `big.js` ab; die einzige Node-Bindung sind zwei `node:crypto`-Aufrufe (`randomBytes` in
`Uuid.v7`, `createHash` im Export). Lösung: schlanker Web-Crypto-Shim (`getRandomValues` /
`subtle.digest`) + Vite-Alias, dann bündelt Vite den reifen TS-Kern direkt mit. Der GoBD-Engine
läuft damit im Webview (JS, byte-identisch getestet). **Rust-summae bleibt das spätere Ziel**
(Produktwert über Moneymanager hinaus, saubere `src-tauri`-Grenze) — weil Moneymanager summae
nur über den `LedgerPort` anspricht, ist der spätere Umstieg ein Port-Tausch, kein Umbau.
Verworfen: auf den Rust-Rewrite warten (würde den Import unnötig lange blockieren).

### Nächster Schritt — Bankimport (P3.5), entblockt

A5 steht (summae v0.4), Anbindung entschieden (TS-Bundle, oben). Reihenfolge:

1. **summae-core einbinden** — Web-Crypto-Shim (`randomBytes`→`getRandomValues`,
   `createHash`→`subtle.digest`/pure-js sha256) + Vite-Alias auf `node:crypto`, Dependency
   ziehen, Smoke-Test: Konto anlegen → buchen → Stichtagssaldo im laufenden Tauri-Fenster.
2. **CSV/CAMT-Import** als zweite Quelle hinter dem `LedgerPort` (TAKTIK-IMPORT).
3. **Auto-Matching + Dedup** (Manuell ↔ Import; n:m/Teilbeträge = das `Zuordnung`-Aggregat,
   das ADR-0003 §7 bewusst auf diesen Schritt vertagt hat).
4. Danach: echtes summae hinter dem `LedgerPort` (provisorisches Ist-Format → A5 per ACL).

Contingency entfällt weitgehend: kein Mock nötig, da summae fachlich nutzbar ist.

## LATER — Ausbaustufen (Richtung, bewusst grob)

**Stufe 2 — Vermögen & Vorsorge**
- Anlagen (manuelle Wertstände) + Umschichtungs-Semantik in den Analysen
- Vorsorge-Cockpit: Person × Risiko × Deckung, Lücken, Rentenlücke
  (vorher: taktisches Design Vorsorge-Kontext)
- Vertragserkennung aus Umsätzen (deterministische Periodizitätserkennung)
- Erweiterte Analysen, What-if-Simulation als Engine-Feature

**Stufe 3 — Anbindung & Komfort**
- FinTS/HBCI direkt (inkl. DK-Produktregistrierung)
- KI-Schicht nach KI-KONZEPT § 5: Embeddings-Kategorisierung → Dokument-Extraktion →
  Befragung/Briefings → agentische Szenarien
- Mehrere Zugänge / Haushalts-Sync (lokaler Server), Mobile-Frage

## WON'T (bewusst nicht / noch nicht)

- Cloud-Pflicht oder Cloud-only-Features — verletzt Leitprinzip "lokal first"
- Kredite/Verbindlichkeiten — modellierbar, aber kein MVP-Bedarf
- Trading/Depotanbindung mit Orderausführung — Tracking ja, Handeln nie
- PSD2-/Drittanbieter-APIs — unvereinbar mit lokal (FinTS deckt den Bedarf)

## Offene Entscheidungen (mit Fälligkeit)

| Entscheidung | Fällig |
|---|---|
| ~~Schnitt Stammdaten ↔ Planung~~ ✓ getrennte Kontexte, gemeinsame UI | entschieden 2026-06-07 |
| ~~Plattform (Desktop vs. lokaler Server)~~ ✓ lokale Desktop-App, React+TS, Tauri (ADR-0001) | entschieden 2026-06-13 |
| ~~summae-Anbindung~~ ✓ **TS-Kern in die Webview bündeln + `node:crypto`-Shim** — reversibel über den `LedgerPort`, Rust-summae bleibt späteres Ziel (Umstieg = Port-Tausch). Kehrt die Annahme vom 2026-06-19 um. | entschieden 2026-06-20 |
| Runtime-Strategie KI (Ollama extern vs. llama.cpp embedded) | LATER, vor KI-Stufe 1 |
