# Moneymanager — Strategisches Domänendesign (DDD)

> **DDD-Ebene:** Strategisch — Subdomänen, Bounded Contexts, Context Map · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** KONZEPT, UBIQUITOUS-LANGUAGE, TAKTIK-*

> Stand: 2026-06-07 · Ergebnis des strategischen Designs (Distillation, Bounded Contexts,
> Ubiquitous Language, Context Map). Taktisches Design folgt je Kontext (siehe ROADMAP, NEXT).

## 1. Subdomänen & Distillation

| Typ | Subdomäne | Begründung |
|---|---|---|
| **Core** | Finanzprojektion | Die Erfindung: Plan-Zahlungen aus allen Quellen, Liquiditätsverlauf, Topf-Deckung, Plan/Ist. Keine Bibliothek hilft hier. |
| **Core** | Vorsorge | Person × Risiko × Deckung, Lücken, Rentenlücke — eigenständiges Konzept, Verkaufsargument. |
| Supporting | Stammdatenverwaltung | Nötig, aber kein Differenzierer. |
| Supporting | Kategorisierung | Wegen Verflechtung mit Aufwand/Umschichtung-Semantik nicht generic. |
| Supporting | Analysen | Leseschicht, kein eigenes Modell. |
| Generic | Buchungsimport | CSV/CAMT/FinTS per Bibliothek, null Designenergie. |
| Generic | Zugänge/Auth, Dokumentenablage | Commodity. |

Sonderfall: **Doppik/KLR-Kern** ist fachlich anspruchsvoll, aber ausgelagert ins
separate, GoBD-konforme **Buchungspackage** (eigenes Projekt) → aus Sicht dieser App
ein zugelieferter Baustein.

## 2. Bounded Contexts

Fünf Kontexte. Test war jeweils: *Wo bedeutet dasselbe Wort Verschiedenes?*

### Ledger *(= Buchungspackage, separates Projekt)*
Doppik + KLR, GoBD-konform. Nur Fakten (Ist), append-only, Storno, Festschreibung.
Kennt weder Verträge noch Pläne.

### Planung *(Core)*
Zahlungsregeln, Budgets, Töpfe, Projektions-Engine, Plan/Ist-Matching, Szenarien.
Hält Plan-/Szenario-Buchungen als eigenes Modell (im Buchungsformat des Ledgers,
aber nie im GoBD-Buch gespeichert).

### Stammdaten
Verträge als Dokumente (Anbieter, Laufzeit, Kündigungsfrist, PDF), Inventar, Konten,
Personen, Kategorien, später Anlagen.

**Entscheidung Stammdaten ↔ Planung: getrennte Kontexte, gemeinsame UI.**
Begründung: "Vertrag" hat zwei verschiedene Modelle (Dokument-Lebenszyklus vs.
Zahlungsregel) mit verschiedenen Änderungsgründen (Kündigungsfrist ändert sich ≠
Zahlungsstrom ändert sich). Die Kontextgrenze ist semantisch — dass der Nutzer beides
in *einer Maske* pflegt, ist Präsentation und verletzt die Grenze nicht. Die Maske
schreibt in beide Kontexte.

### Import
Rohe Bankumsätze einlesen (CSV/CAMT, später FinTS), Duplikate erkennen,
Kategorisierungs-Pipeline (Regeln, später KI-Fallback) → liefert fertige
Ist-Buchungen an den Ledger.

### Vorsorge *(Core, Ausbau in Stufe 2)*
Risiken, Deckungen, Lücken, Zielgrößen. Sieht Verträge als Deckungsinstrumente —
eigene Sicht auf fremde Daten, eigenes Modell. Vorsorge ist **nicht** auf Vermögen
reduzierbar: zwei Beine — Vermögensaufbau *und* Risikotransfer durch echte Verträge
(BU, Risiko-LV, Rente) —, gemessen als **Deckung vs. Lücke**, nicht als Saldo
(siehe RECHNUNGSWESEN-BEZUG.md §5).

**Kein Kontext:** Analysen — Leseschicht über Ledger-Rechenwerk und Planung.

## 3. Ubiquitous Language

Die **kanonische Sprachreferenz** — Begriffe je Kontext, aufgelöste Mehrdeutigkeiten (Vertrag,
Konto, Buchung) und das UI-Wording — steht in **UBIQUITOUS-LANGUAGE.md**. Dort zuerst pflegen;
dieses strategische Dokument verweist nur.

## 4. Context Map

```mermaid
graph TD
    SD[Stammdaten] -->|Customer/Supplier:<br>Vertrag → Zahlungsregel| PL[Planung ★Core]
    SD -->|Konten/Kategorien-Referenzen| IM[Import]
    SD -->|ACL: Vertrag als<br>Deckungsinstrument| VS[Vorsorge ★Core]
    PL -->|Conformist: nutzt Buchungsformat<br>+ Rechenwerk (pure functions)| LG[Ledger = Buchungspackage<br>Open-host Service,<br>Published Language]
    IM -->|liefert Ist-Buchungen<br>im Buchungsformat| LG
    PL -.->|liest Wertstände/Beiträge| VS
    AN([Analysen — Leseschicht]) -.-> LG
    AN -.-> PL
```

Beziehungen im Klartext:

- **Ledger = Open-host Service mit Published Language.** Das Buchungsformat (Soll/Haben,
  Konten, Datum, Dimensionen) ist die versionierte, stabile Schnittstelle. Da das Package
  GoBD-konform bleiben muss, gilt strikt: Anforderungen fließen als Wünsche dorthin
  (Customer/Supplier zwischen den Projekten), niemals als Eingriff.
- **Planung ist Conformist gegenüber dem Ledger:** Sie übernimmt das Buchungsformat
  unverändert für ihre Plan-Schichten und nutzt das Rechenwerk als pure functions.
- **Stammdaten → Planung ist Customer/Supplier:** Planung (Customer) leitet aus dem
  Vertrag ihre Zahlungsregel ab; Übersetzung an der Grenze, keine geteilten Klassen.
- **Vorsorge schützt sich per ACL:** Sie übersetzt Verträge/Anlagen in ihr eigenes
  Modell (Deckung) und hängt nicht an deren Innenstruktur.
- **Analysen** sind keine Beziehung, sondern Lesezugriff über definierte Abfragen.
- **Kein Shared Kernel.** Der **Topf** gehört allein der Planung; andere Kontexte
  *referenzieren* ihn (Stammdaten liefert den Inventargegenstand, der Ledger die Salden) oder
  *lesen* ihn (Analysen, Bilanz-Linse) — geteilt wird er nicht. Bewusst geteilt sind nur
  kleine Elemente: die Value Objects **Geldbetrag/Zeitraum/Charakter** und das
  **Buchungsformat** (Published Language). Vorsorge sieht einen Topf nur über ihren ACL als
  Deckungsinstrument. (Entscheidung 2026-06-13.)

## 5. Konsequenzen für das taktische Design (NEXT)

- Reihenfolge: Planung (Core, zuerst) → Stammdaten → Import; Vorsorge in Stufe 2.
- Aggregat-Kandidaten je Kontext erst nach Invarianten-Analyse — nicht vorab raten.
- Die gemeinsame UI-Maske (Vertrag) ist Application-Layer, kein Domänenproblem.
