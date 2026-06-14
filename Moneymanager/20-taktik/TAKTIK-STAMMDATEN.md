# Taktisches Design — Stammdaten-Kontext (Supporting)

> **DDD-Ebene:** Taktisch — Supporting (Stammdaten) · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** DOMAENENDESIGN, UBIQUITOUS-LANGUAGE, TAKTIK-PLANUNG

> Stand: 2026-06-07 · Baut auf DOMAENENDESIGN.md auf
> Ehrliche Einordnung: Supporting Domain — das Modell ist bewusst einfach. Wo es nur
> Datenpflege ist, bleibt es Datenpflege; echte Domänenlogik gibt es an drei Stellen:
> Kündigungslogik, Kategorie-Hierarchie, Konto→Sachkonto-Mapping.

## 1. Aggregates

### Vertrag *(Aggregate Root)*
Das Dokument-Modell (die Zahlungsregel lebt im Planungs-Kontext).

- **Felder:** Anbieter, Vertragsnummer, InhaberPersonId, Beginn, Mindestlaufzeit,
  Verlängerungsregel, Kündigungsfrist, Status, DokumentIds (Anhänge), Notizen
- **Invarianten:** Statusmaschine `aktiv → gekündigt → beendet` (keine Sprünge zurück) ·
  Kündigung nur zu zulässigem Termin
- **Echte Domänenlogik:** `nächsterKündigungstermin(heute)` — aus Beginn, Mindestlaufzeit,
  Verlängerungsregel und Frist. Das ist das Herzstück der Kündigungs-Erinnerung.
- **Verhalten:** `kündige(zum)`, `verlängere()`, `hängeDokumentAn(id)`

### Inventargegenstand *(Aggregate Root)*
- **Felder:** Bezeichnung, Anschaffungsdatum, Anschaffungspreis, Wiederbeschaffungswert,
  Nutzungsdauer, optional Foto/DokumentIds
- **Invarianten:** Nutzungsdauer > 0 · Wiederbeschaffungswert ≥ 0
- Die Ansparlogik liegt **nicht** hier, sondern in der Rücklage (Planung) —
  der Gegenstand ist nur die Faktenbasis.

### Zahlungskonto *(Aggregate Root)*
- **Felder:** Bezeichnung, Typ (Giro | Tagesgeld | Bargeld), optional IBAN,
  InhaberPersonIds, **SachkontoId** (Ledger-Mapping)
- **Invariante:** genau ein Sachkonto-Mapping, unveränderlich nach erster Buchung

### Person *(Aggregate Root)*
- **Felder:** Name, Geburtsdatum (Vorsorge braucht es später), Rolle im Haushalt
- Ab Tag 1 vorhanden, auch bei einem Zugang (Architektur-Leitplanke aus KONZEPT § 2)

### Kategorie *(Aggregate Root)*
- **Felder:** Name, optionale Elternkategorie, Default-Charakter
  (Aufwand | Ertrag | Umschichtung), **KostenstellenId** (Ledger-Mapping)
- **Invarianten:** keine Zyklen in der Hierarchie · Kostenstellen-Mapping eindeutig

### Anlage *(Aggregate Root — Stufe 2, hier nur reserviert)*
Typ (Depot | ETF | Renten-/Lebensversicherung | Immobilie), Wertstände als manuell
gepflegte Zeitreihe, InhaberPersonId. Modellierung erfolgt mit Stufe 2.

## 2. Value Objects

| VO | Inhalt |
|---|---|
| **Kündigungsfrist** | Dauer + Bezugspunkt (zum Laufzeitende / zum Monatsende / …) |
| **Verlängerungsregel** | automatische Verlängerung um X, einmalig/rollierend |
| **IBAN** | validiert |
| **Dokumentreferenz** | Id + Dateiname + Typ (zeigt in die generische Dokumentenablage) |

## 3. Domain Events (Integrationsrichtung: → Planung, → Vorsorge)

| Event | Konsument |
|---|---|
| `VertragAngelegt` | Planung legt Zahlungsregel-Entwurf an (Übersetzung an der Grenze) |
| `VertragGeändert` | Planung prüft Regel-Konsistenz |
| `VertragGekündigt` | Planung beendet Regel zum Termin; Vorsorge prüft Deckungslücke |
| `InventargegenstandErfasst` | Planung schlägt Rücklage vor |
| `KündigungsterminNaht` | UI/Erinnerung (zeitgesteuert aus `nächsterKündigungstermin`) |

## 4. Repositories

`Verträge.aktive()`, `.kündbareBis(datum)` · `Inventar.ohneRücklage()` ·
`Zahlungskonten.alle()` · `Kategorien.baum()` · `Personen.alle()`

## 5. Hinweis zur gemeinsamen UI

Die Vertragsmaske schreibt in zwei Kontexte (Vertrag hier, Zahlungsregel in Planung).
Das orchestriert die Anwendungsschicht — zwei Commands, eventual consistent über
`VertragAngelegt`. Kein gemeinsames Aggregat, keine geteilte Transaktion über Kontexte.
