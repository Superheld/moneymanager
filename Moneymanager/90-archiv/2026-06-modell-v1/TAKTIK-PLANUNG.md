# Taktisches Design — Planungs-Kontext (Core)

> **DDD-Ebene:** Taktisch — Core (Planung) · **Status:** tragend · **Stand:** 2026-06-13 · **Bezüge:** DOMAENENDESIGN, UBIQUITOUS-LANGUAGE, SPEC-MVP

> Stand: 2026-06-07 · Baut auf DOMAENENDESIGN.md auf · Methodik: DDD (Evans)
> Leitfrage je Aggregat: *Welche Invarianten müssen synchron gelten?*

## 0. Die zentrale Designentscheidung: Planbuchungen werden berechnet, nicht gespeichert

Eine Planbuchung ist **abgeleitetes Material**: vollständig bestimmt durch ihre Quelle
(Zahlungsregel, Budget, Topf) und den Termin. Sie wird deshalb als **Value Object**
modelliert, das die Projektion bei Bedarf erzeugt — und ist trotzdem stabil adressierbar
über `(QuellenId, Fälligkeit)`.

Konsequenzen:

- Persistiert werden nur: Zahlungsregeln, Budgets, Töpfe, Szenarien (Deltas), Zuordnungen.
- Die Projektion ist eine **pure function** → trivial testbar, kein Cache-Invalidierungs-Drama,
  sync-freundlich (später).
- Plan/Ist-Matching referenziert `(QuellenId, Fälligkeit)` statt gespeicherter Plan-Datensätze.
- Ändert sich eine Regel rückwirkend, bleiben Zuordnungen gültig, solange der Termin
  existiert; verwaiste Zuordnungen werden erkannt und zur Prüfung gemeldet.

## 1. Aggregates

### Zahlungsregel *(Aggregate Root)*
Aus einem Vertrag abgeleitete Regel: "erzeugt rhythmisch Betrag X von Quelle nach Ziel".

- **Felder:** VertragId (Referenz auf Stammdaten, nur ID), Rhythmus, Betrag, Quell-/Zielkonto
  (Zahlungskonten-Ids), Kategorie, Charakter (Aufwand | Ertrag | Umschichtung), Gültigkeitszeitraum
- **Invarianten:** Betrag ≠ 0 · Quelle ≠ Ziel · Charakter Umschichtung ⇒ Ziel ist eigenes
  Konto/Anlage · Gültigkeitszeitraum konsistent · Betragsänderungen sind datiert
  (Historie der Konditionen, nie Überschreiben)
- **Verhalten:** `fälligkeitenIm(zeitraum)`, `beende(zum)`, `ändereKondition(ab, betrag)`

### Budget *(Aggregate Root)*
- **Felder:** Kategorie, Periode (z. B. Monat), Rahmenbetrag, Glättungsregel
- **Invarianten:** Rahmenbetrag > 0 · Periode wohlgeformt
- Eindeutigkeit "ein Budget je Kategorie+Periode" ist kontextweite Regel → prüft die
  Anwendungsschicht via Repository (nicht synchron erzwingbar, bewusst akzeptiert)

### Rücklage *(Aggregate Root)*
- **Felder:** InventargegenstandId (Referenz Stammdaten), Zielwertfunktion
  (Wiederbeschaffungswert, Nutzungsdauer, Startzeitpunkt), Ansparrate
- **Invariante:** Ansparrate konsistent mit Zielwertfunktion und Restlaufzeit
  (bei Abweichung: explizit als "manuell übersteuert" markiert)
- **Verhalten:** `sollstand(am)`, `zuführungenIm(zeitraum)` (→ kalkulatorische Planflüsse)

### Rückstellung *(Aggregate Root)*
- **Felder:** Anlass, Schätzbetrag, Zeitfenster, optional Eintrittswahrscheinlichkeit
- **Invariante:** Schätzbetrag > 0 · Zeitfenster in der Zukunft oder offen
- Getrennt von Rücklage (andere Invarianten, andere Sprache)

### Freitopf *(Aggregate Root)*
Revolvierender Topf für unregelmäßige Ausgaben unbekannter Höhe (z. B. Klamotten): läuft mit,
wird **nicht** zurückgesetzt, hat **keinen erzwungenen Zielwert**. Trägt auch das bewusste
Ansparen für einen großen Einmal-Kauf.
- **Felder:** Zweck/Kategorie, Zuführungsregel, **optionales Wunschziel** (frei gesetzter
  Betrag, ohne Frist-Zwang); Saldo ergibt sich aus Zuführungen − Verbräuchen
- **Invarianten:** Zuführungsregel wohlgeformt · Wunschziel (falls gesetzt) > 0 · Verbrauch
  frei, klein oder groß, ohne Deckel
- **Verhalten:** `sollstand(am)` nur definiert, wenn ein Wunschziel gesetzt ist; sonst nur
  laufender Stand

### Topf *(gemeinsame Abstraktion — Abstract Core, kein Aggregat)*
**Entscheidung 2026-06-13 (A):** Rücklage, Rückstellung und Freitopf sind **drei getrennte
Aggregate** (andere Invarianten, andere Sprache), die sich ein gemeinsames `Topf`-Interface
teilen. Die *geteilte Mechanik* — laufender Saldo aus Zuführungen/Verbräuchen — gehört auf
diese Abstraktion (Evans' **Abstract Core**), nicht dreimal kopiert; jedes Aggregat ergänzt
nur seinen **Zielwert** und dessen Invarianten. **Zielwert ist optional und getypt:** keiner
oder frei/Wunsch (Freitopf) · Schätzbetrag + Zeitfenster (Rückstellung) · Wiederbeschaffung +
Nutzungsdauer (Rücklage, Abschreibungs-Analogie). `sollstand(am)` ist nur definiert, wenn ein
Zielwert existiert.

### Szenario *(Aggregate Root)*
Benannte, verwerfbare Schicht von Abweichungen gegenüber dem Plan.

- **Felder:** Name, Menge von Deltas (Regel-Override: andere Kondition/Ende;
  Zusatzposten: einmalige/wiederkehrende fiktive Zahlung; Topf-Override)
- **Invarianten:** Deltas referenzieren existierende Quellen · Szenario berührt nie
  die Plan-Schicht selbst
- **Verhalten:** `angewendetAuf(planquellen)` → effektive Quellenmenge für die Projektion

### Zuordnung *(Aggregate Root; eine je Istbuchung)*
Das Plan/Ist-Matching, app-seitig (Ledger kennt kein Plan).

- **Felder:** IstbuchungId (Ledger-Referenz), Menge von Teilzuordnungen
  `(Planreferenz = QuellenId + Fälligkeit/Periode, Teilbetrag)`
- **Invariante (der Grund für diesen Aggregatschnitt):**
  Σ Teilbeträge ≤ Betrag der Istbuchung — keine Überzuordnung
- n:m entsteht von selbst: eine Istbuchung → mehrere Planposten (Sammellastschrift),
  ein Planposten ← mehrere Istbuchungen (Teilzahlungen)

## 2. Value Objects (immutabel, mit Verhalten)

| VO | Inhalt / Operationen |
|---|---|
| **Geldbetrag** | Betrag + Währung; Arithmetik, Vergleich (Closure of Operations) |
| **Rhythmus** | monatlich/quartalsweise/jährlich/einmalig + Anker- und Fälligkeitslogik; `terminImin(zeitraum)` |
| **Zeitraum, Fälligkeit, Periode** | Datumslogik, Schnittmengen |
| **Charakter** | Aufwand \| Ertrag \| Umschichtung |
| **Planbuchung** | QuellenId, Fälligkeit, Geldbetrag, Konten, Kategorie, Charakter, Schicht — *berechnet, nie persistiert* |
| **Zielwertfunktion** | Wiederbeschaffungswert, Nutzungsdauer → `sollwert(am)`, `rate()` |
| **Glättungsregel** | Verteilung eines Budgetrahmens über die Periode |
| **Schicht** | plan \| szenario(Name) |

## 3. Domain Services (alle side-effect-free)

| Service | Signatur (sinngemäß) | Anmerkung |
|---|---|---|
| **Projektion** | `(regeln, budgets, töpfe, szenario?, zeitraum) → [Planbuchung]` | Das Herz des Kontexts. Pure function. |
| **Liquiditätsverlauf** | `(planbuchungen, istSaldenAbruf, zeitraum) → Verlauf` | Ist-Salden kommen aus dem Ledger-Rechenwerk (pure functions, Anforderung A1); Plan-Deltas addiert die App. |
| **Deckungsrechnung** | `(töpfe, liquideMittel, stichtag) → freieLiquidität` | freie Liquidität = liquide Mittel − Σ Sollstände; wird negativ, wenn zu viel verplant ist — das ist das Signal. **Keine** Allokation/Priorität; jeder Topf behält seinen vollen Sollstand. Nur Töpfe *mit* Zielwert haben einen Sollstand. |

Kein `PlanungsService`, kein `VertragsManager` — Verhalten liegt auf den Aggregaten,
die Services sind echte Domänen-Berechnungen über mehrere Aggregate.

**Plan/Ist bei Töpfen — Entscheidung 2026-06-13 (C): „Plan = Ist" + globale Deckung.**
Der Ist-Stand eines kontolosen Topfes wird **nicht** separat geführt; die geplante Zuführung
gilt als erfolgt. Über-/Unterzahlung erscheint daher als **globale Deckung** (Σ Topf-Sollstände
vs. liquide Mittel) und geht ins Minus, wenn zu viel verplant ist (keine Allokation, keine
aktive Warnung) — das ist die Antwort auf „ein Konto ist nur eine Zahl und zeigt die Töpfe
nicht". Echte Pro-Topf-Funding-Disziplin
entsteht nur, wenn ein Topf ein **eigenes (Unter-)Konto** hat: dann sind die Zuführungen reale
Umschichtungen und das bestehende Matching (`Zuordnung`) liefert Über-/Unterzahlung direkt.
Ein erfasstes **Nebenbuch** (kalkulatorische Earmark-Buchungen) bleibt als spätere Option offen.

## 4. Domain Events (bewusst wenige)

| Event | Zweck |
|---|---|
| `ZahlungsregelBeendet` | Kündigung erfasst — Vorsorge und Analysen wollen das wissen |
| `KonditionGeändert` | Beitragserhöhung — Trigger für Ambient-Hinweise (später) |
| `IstbuchungZugeordnet` | Matching vollzogen — Analysen/Review-Inbox |
| `ZuordnungVerwaist` | Planreferenz existiert nach Regeländerung nicht mehr — Prüffall |

Eingehende Events aus anderen Kontexten: `VertragAngelegt/Geändert` (Stammdaten) →
Anwendungsschicht legt Zahlungsregel-Entwurf an (Übersetzung an der Kontextgrenze);
`IstbuchungEingegangen` (Import/Ledger) → Auto-Matching-Vorschlag.

## 5. Repositories (je Aggregate Root, Sprache der Domäne)

- `Zahlungsregeln.aktiveIm(zeitraum)`, `.auslaufendeBis(datum)`
- `Budgets.fürPeriode(periode)`
- `Rücklagen.alle()`, `Rückstellungen.offene()`
- `Szenarien.benannt(name)`
- `Zuordnungen.fürIstbuchung(id)`, `.offenePlanpostenIm(zeitraum)`, `.verwaiste()`

## 6. Architektur im Kontext

Hexagonal: Domäne (oben beschriebenes Modell) kennt weder Persistenz noch Ledger-Package
direkt. Ports: `IstSaldenAbruf` + `Buchungsformat` (Adapter: Buchungspackage),
Persistenz-Port je Repository. Anwendungsschicht orchestriert Use Cases
("Regel anlegen", "Monat abgleichen") ohne eigene Geschäftslogik.

## 7. Bewusst offen (erst bei Implementierung/Erfahrung entscheiden)

- Glättungsregel-Varianten für Budgets: linear reicht fürs MVP. **Saisonal** ist meist gar
  kein Budget-Problem (saisonales Ansparen = Topf mit Frist); offen bleibt nur *saisonaler
  Verbrauch ohne Übertrag* (z. B. Winter-Heizkosten) → nicht-lineare Glättung, später.
- Auto-Matching-Heuristik (gehört in den Import-/Anwendungsbereich, nicht ins Domänenmodell)
- ~~Ob `Topf` als Interface auftaucht~~ → **entschieden 2026-06-13 (A):** `Topf` ist
  gemeinsame Abstraktion (Abstract Core) für drei Aggregate (Rücklage, Rückstellung,
  Freitopf), Zielwert optional. Siehe §1.
- Topf mit eigenem (Unter-)Konto vs. kontolos: ob/wann ein eigenes Konto angeboten wird
  (schaltet echte Pro-Topf-Disziplin frei, §3) — UX-Frage für später.
