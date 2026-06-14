# Taktisches Design — Import-Kontext (Generic/Supporting)

> **DDD-Ebene:** Taktisch — Generic/Supporting (Import) · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** DOMAENENDESIGN, BUCHUNGSPACKAGE-ANFORDERUNGEN, TAKTIK-PLANUNG

> Stand: 2026-06-07 · Baut auf DOMAENENDESIGN.md auf
> Aufgabe: rohe Bankdaten → geprüfte, kategorisierte Ist-Buchungen für den Ledger.
> Generic im Parsing (Bibliotheken!), supporting in der Kategorisierung
> (Aufwand/Umschichtung-Semantik ist unsere).

## 1. Aggregates

### Umsatz *(Aggregate Root)*
Der rohe Bankdatensatz mit eigenem Lebenszyklus — er überlebt den Import-Lauf.

- **Felder:** ZahlungskontoId, Buchungstag, Valuta, Betrag, Verwendungszweck,
  Gegenpartei, Roh-Hash (Duplikaterkennung), Herkunft (LaufId), Status,
  Kategorisierungsvorschlag (Kategorie, Charakter, Quelle: regel | ki | manuell),
  nach Verbuchung: IstbuchungId (Ledger-Referenz)
- **Statusmaschine (Invariante):**
  `neu → kategorisiert(vorgeschlagen) → bestätigt → verbucht`, Abzweig `duplikat`
  (Endzustand) · `verbucht ⇒ IstbuchungId vorhanden` · verbuchte Umsätze sind unveränderlich
- **Verhalten:** `schlageKategorieVor(vorschlag)`, `bestätige(ggf. korrigiert)`,
  `markiereDuplikat(originalId)`

### ImportLauf *(Aggregate Root)*
- **Felder:** Quelle (Datei CSV/CAMT, später FinTS), Zeitpunkt, Konto, Statistik
  (eingelesen/neu/duplikate), UmsatzIds (Referenzen)
- **Invariante:** Lauf-Statusmaschine `eingelesen → geprüft → abgeschlossen`
- Bewusst dünn — Protokoll und Klammer, keine Fachlogik

### Kategorisierungsregel *(Aggregate Root)*
Der Feedback-Loop (KI-KONZEPT § 4.3): Nutzerkorrekturen werden zuerst zu Regeln.

- **Felder:** Muster (Gegenpartei-/Verwendungszweck-Pattern), ZielKategorie,
  optional Charakter, Priorität, Herkunft (manuell | ausKorrekturGelernt)
- **Invarianten:** Muster gültig/kompilierbar · Priorität eindeutig ordnenbar

## 2. Value Objects

| VO | Inhalt |
|---|---|
| **Roh-Hash** | deterministisch aus Konto + Datum + Betrag + Normalisierung des Zwecks; Basis der Duplikaterkennung |
| **Kategorisierungsvorschlag** | Kategorie, Charakter, Konfidenz, Quelle (regel \| ki \| manuell) |
| **Muster** | normalisiertes Match-Pattern mit `trifft(umsatz)` |

## 3. Domain Services (pure)

| Service | Aufgabe |
|---|---|
| **Duplikaterkennung** | `(umsatz, bestandsHashes) → duplikat?` — toleriert Bankformat-Eigenheiten (Valuta-Verschiebung, Zweck-Umbrüche) |
| **Kategorisierung** | `(umsatz, regeln) → Vorschlag?` — Regeln nach Priorität; trifft keine → Port **KategorisierungsFallback** (später: KI/Embeddings, KI-KONZEPT Stufe 1; ohne Runtime: bleibt unkategorisiert für die Review-Inbox) |
| **Verbuchungsübersetzung** | bestätigter Umsatz → Buchungssatz in der Published Language des Ledgers (Sachkonto via Zahlungskonto-Mapping, Kostenstelle via Kategorie-Mapping) — die ACL an der Ledger-Grenze |

## 4. Domain Events

| Event | Konsument |
|---|---|
| `UmsatzVerbucht` | **Planung** (Auto-Matching-Vorschlag Plan↔Ist) — das wichtigste Integrationsevent der App |
| `UmsatzWartetAufPrüfung` | Review-Inbox (UI) |
| `RegelAusKorrekturGelernt` | Protokoll/Transparenz ("warum wurde das so kategorisiert?") |

## 5. Repositories

`Umsätze.unkategorisierte()`, `.wartendAufBestätigung()`, `.hashesFür(konto, zeitraum)` ·
`ImportLäufe.letzteFür(konto)` · `Kategorisierungsregeln.nachPriorität()`

## 6. Ports (Hexagonal)

- **Quellen-Port:** `liesUmsätze(quelle) → [RohUmsatz]` — Adapter: CSV, CAMT,
  später FinTS. Parser sind Bibliotheks-Adapter, null Domänenlogik.
- **KategorisierungsFallback-Port:** optional (Feature-Gating nach KI-KONZEPT § 4.6)
- **Ledger-Port:** `verbuche(buchungssatz) → IstbuchungId`
