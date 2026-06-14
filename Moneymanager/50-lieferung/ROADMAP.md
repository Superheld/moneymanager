# Moneymanager — Roadmap

> **DDD-Ebene:** Lieferung — Roadmap (Now/Next/Later) · **Status:** aktiv · **Stand:** 2026-06-13 · **Bezüge:** KONZEPT, SPEC-MVP, BAUPLAN-MVP

> Stand: 2026-06-07 · Format: Now / Next / Later · Team: Bruce + Claude
> Grundlage: KONZEPT.md (§ 7 Feature-Schnitt), KI-KONZEPT.md, DDD-Vorgehen

## Leitplanken

- **Reihenfolge schlägt Datum.** Solo-Projekt → keine Quartalsversprechen, nur verlässliche Sequenz.
- **Design vor Code.** Strategisches DDD wird abgeschlossen, bevor taktisches Design und
  Implementierung beginnen — Core Domain verdient die Denkarbeit.
- **Buchungspackage erst zum Ist-Schritt.** Es wird erst zur echten Abhängigkeit, wenn echte
  Ist-Buchungen entstehen (Import → Ist-Journal). Die Basis (Stammdaten, Verträge, Inventar,
  Budgets, Plan-only-Projektion) ist app-seitig ohne das Package baubar.

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

**Abhängigkeit (normalisiert):** Die Basis des MVP — Stammdaten, Verträge, Inventar inkl.
Abschreibung/Ansparrate, Budgets/Töpfe und die Plan-only-Projektion — braucht das Package
*nicht*; sie rechnet rein app-seitig (Planbuchungen werden berechnet, nicht gespeichert).
Das Buchungspackage (Ist-Journal, Stichtagssalden, KLR-Dimensionen, Rechenwerk) wird erst
nötig, sobald echte Ist-Buchungen ins Spiel kommen: Import → Ist-Journal, Plan/Ist-Abgleich
und der Ist-Anteil im Liquiditätsverlauf. Need-by: vor diesem Ist-Schritt, nicht vor der
Plan-Projektion. Früh fix stehen muss nur **A5 (Buchungsformat-Schema)**. Contingency: gegen
ein Interface/Mock des Rechenwerks starten.

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
| Runtime-Strategie KI (Ollama extern vs. llama.cpp embedded) | LATER, vor KI-Stufe 1 |
