# Anforderungen des Moneymanagers an das Buchungspackage

> **DDD-Ebene:** Referenz — Upstream-Contract (Ledger, Published Language) · **Status:** übergeben · **Stand:** 2026-06-13 · **Bezüge:** DOMAENENDESIGN, TAKTIK-IMPORT, ADR-0001-plattform

> Stand: 2026-06-07 · Übergabe-Dokument an das Package-Projekt (GoBD-konform, Doppik + KLR)
> Rolle: Der Moneymanager ist *Customer* des Packages. Nichts hierin darf die
> GoBD-Konformität berühren — alle Plan-/Szenario-Logik bleibt app-seitig.

## A. Harte Anforderungen

### A1. Rechenwerk als pure functions
Die Salden-/Aggregationslogik (Saldo je Konto/Kontengruppe, Summen je Dimension,
Stichtagsbetrachtung) muss als **reine, persistenzunabhängige Funktionen** nutzbar sein:
`saldo(buchungssätze, stichtag, filter) → betrag`.

Zweck: Der Moneymanager wendet dieselbe Logik auf seine app-seitigen Plan-Buchungssätze
an, ohne dass je etwas Unechtes ins GoBD-Buch geschrieben wird.
Trennung: *Rechenwerk* (wiederverwendbar) vs. *Aufbewahrung* (GoBD, nur Fakten).

### A2. Stichtags-Salden
Saldo beliebiger Konten zu **beliebigem Datum**, gefiltert nach KLR-Dimensionen —
als Kernabfrage, performant auch über viele Jahre.

### A3. KLR-Dimensionen auf Buchungsebene
Kostenstelle und Kostenträger je Buchungszeile. Der Moneymanager mappt:
Kostenstelle ≈ Kategorie, Kostenträger ≈ Person/Zweck.

### A4. Kalkulatorischer Kreis / Abgrenzung
Kalkulatorische Buchungen (KLR-wirksam, **nicht** zahlungswirksam), sauber vom
FiBu-Kreis getrennt und getrennt abfragbar. Use Case: Rücklagen-Ansparrate =
kalkulatorische Abschreibung.

### A5. Buchungsformat als Published Language
Das Buchungssatz-Schema (Soll/Haben, Konten, Betrag, Datum, Dimensionen, Referenzen)
ist die **versionierte, stabile Schnittstelle**. Breaking Changes nur mit Migrationpfad.

### A6. Stabile, referenzierbare Buchungs-IDs
Der Moneymanager speichert app-seitig Verknüpfungen (Plan/Ist-Matching, n:m) auf
Buchungs-IDs. IDs müssen dauerhaft stabil sein, auch über Storno hinweg.

### A7. Storno-Beziehungen abfragbar
Zu jeder Buchung: ist sie storniert, wodurch, was storniert sie? (Damit Matching
und Analysen Stornopaare korrekt behandeln.)

### A8. Konfigurierbarer Kontenrahmen
Kein fest verdrahteter SKR — der Moneymanager bringt einen schlanken
**Privat-Kontenrahmen** mit (Zahlungskonten, Anlagen, Aufwand/Ertrag je Kategorie-Mapping).

## B. Ausdrückliche Nicht-Anforderungen

- **Keine Plan- oder Szenario-Schichten im Package.** Bewusst app-seitig gelöst.
- **Keine Zukunfts-Features:** keine wiederkehrenden Buchungsvorlagen, keine Projektionen.
- **Kein Wissen über Verträge, Budgets, Töpfe** — das Package bleibt domänenfrei.

## C. Nice-to-have

- Mehrere unabhängige Bücher pro Installation öffnen/lesen (für spätere Fälle, kein Bedarf im MVP).
- Export der Buchungssätze in ein neutrales Format (CSV/JSON) für Analysen.

## D. Need-by

Erst zum **Ist-Schritt** (Import → Ist-Journal, Plan/Ist-Abgleich, Ist-Anteil im
Liquiditätsverlauf) — **nicht** vor der reinen Plan-Projektion und nicht vor der Basis
(Stammdaten, Verträge, Inventar, Budgets), die app-seitig ohne das Package läuft.
Contingency: Der Moneymanager startet gegen ein Interface/Mock des Rechenwerks, falls das
Package später fertig wird — dafür muss aber **A5 (Schema)** früh feststehen.
