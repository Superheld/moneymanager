# ADR-0002 — Ist-Schritt „light" über einen Ledger-Port

> **DDD-Ebene:** Entscheidung — ADR-Serie · **Status:** Akzeptiert · **Stand:** 2026-06-16 · **Bezüge:** KONZEPT §5, DOMAENENDESIGN, BUCHUNGSPACKAGE-ANFORDERUNGEN, SPEC-MVP §F/§G, BAUPLAN-MVP P3, ADR-0001

> Status: **Akzeptiert** · 2026-06-16 · Entscheider: Bruce + Claude
> Format: Kontext → Entscheidung → Begründung → Konsequenzen → Abgrenzung → Folgeentscheidungen.

## Kontext

- Der **Ist-Schritt (P3)** war bislang an das **Buchungspackage** und das früh zu fixierende
  **A5-Buchungsformat** gekoppelt (BUCHUNGSPACKAGE-ANFORDERUNGEN, BAUPLAN P3). Das Package
  existiert noch nicht; die A5-Entscheidung ist offen → P3 blockiert.
- Wunsch: Ist bereits nutzbar machen, indem **geplante Posten als „bezahlt" markiert** werden
  (1:1 Plan→Ist), **ohne** ein erneutes Erfassen.
- Gefahr, die vermieden werden muss: ein **freies manuelles Haushaltsbuch** für variable
  Ausgaben würde sich mit dem späteren **Girokonto-Abgleich** doppeln (dasselbe Geld zweimal).
- Der BAUPLAN sieht ausdrücklich die Contingency vor: „ab Phase 3 gegen **Mock des
  Rechenwerks** bauen, solange nur A5 steht" — bzw. solange das Package fehlt.

## Entscheidung

1. **App-seitiges Ist-Journal hinter einem Ledger-Port.** Wir warten nicht auf das GoBD-Package.
   Ist-Buchungen werden app-seitig gehalten, hinter einem **Port** `LedgerPort`. Das echte
   Package oder der Bankimport docken später hinter **demselben Port** an (austauschbar).

2. **Minimales, vorläufiges Ist-Buchungsformat** (NICHT das volle A5):
   `IstBuchung { id, datum, betrag (Cent, vorzeichenbehaftet), kontoId, kategorieId?, charakter,
   quelle: 'bezahlt-markiert' | 'import', planRef?: (QuellenId, Fälligkeit), rohHash? }`.
   Das ist die provisorische Published Language; bei Anbindung des Packages wird daraus dessen
   A5 übersetzt (ACL), die Plan-Schicht bleibt unberührt.

3. **Mark-as-paid nur für diskrete Plan-Posten** — Verträge/Zahlungsregeln, Topf-Zuführungen,
   geplante Einzelausgaben. Erzeugt eine Ist-Buchung mit `planRef` (1:1-Matching) und bewegt
   das **echte Quellkonto** (Kontostand sinkt real).

4. **Budgets/variable Ausgaben bleiben Plan/Limit bis zum Import** — **kein** freier
   Ausgaben-Logger. Echte Ist-Werte pro Kategorie liefert erst der Bankimport.

5. **Ein Ist-Journal als einzige Wahrheit, Dedup über die Quelle.** Jede Buchung trägt `quelle`.
   Der spätere Import **matcht und dedupliziert** gegen bereits erfasste (manuelle) Buchungen
   (Roh-Hash + Plan-/Betrag-/Datums-Heuristik); manuelle Einträge sind *vorläufig* und werden
   vom Import abgeglichen bzw. ersetzt. So koexistieren mark-as-paid und Bankimport ohne Doppelung.

6. **Reconciliation light:** Kontostand(real) = Startsaldo − Σ bezahlte Ist-Buchungen des Kontos.
   Beantwortet „stimmen die Summen?" für die markierten Posten ohne Bank. Volle Bank-
   Reconciliation kommt mit dem Import.

## Begründung

- **Entblockt P3** vollständig von der A5/Package-Entscheidung — der größte Gewinn.
- **Kein Doppelaufwand für den Nutzer:** bestätigen statt neu erfassen; variable Ausgaben werden
  nicht getippt, sondern warten auf die Bank.
- **Konsistent mit dem Schichtenmodell** (KONZEPT §5): Plan/Szenario bleiben getrennt; das
  Ist-Journal enthält nur Fakten. Der Ledger-Port hält die Sprache des späteren Packages offen
  (ADR-0001 §5).
- **Respektiert Entscheidung C** (SPEC C4): Töpfe bleiben kontolos/global gedeckt; mark-as-paid
  betrifft die Zahlungs-/Verbrauchsseite, nicht die Topf-Funding-Disziplin.

## Konsequenzen

**Positiv:** nutzbarer Plan/Ist-Abgleich ohne Package; echte Kontostände bewegen sich;
saubere Single-Source fürs Ist; Migrationspfad zu Package/Import ist eine reine Port-/ACL-Sache.

**Preis / negativ:** ein zweites, vorläufiges Ist-Format, das später auf A5 gemappt werden muss
(ACL-Aufwand). Mark-as-paid + Import brauchen verlässliche **Dedup-Heuristik**, sonst doch
Doppelungen. App-seitiges Journal ist **nicht GoBD-konform** — bewusst, es ist Vorstufe; das
echte Buch bleibt dem Package vorbehalten.

## Abgrenzung (NICHT Teil dieses Schritts)

- Kein GoBD-Buch, keine Festschreibung/Storno-Mechanik (kommt mit dem Package).
- Kein Bankimport (CSV/CAMT/FinTS), kein n:m-Auto-Matching — nur 1:1 über `planRef`.
- Kein manuelles Haushaltsbuch für variable Ausgaben.
- Kein volles A5; das Minimalformat ist provisorisch.

## Folgeentscheidungen / Bauplan (konkretisiert BAUPLAN P3)

1. ✅ **`LedgerPort` + app-seitiger Mock** (SQLite-Tabelle `ist_buchung`, Migration v9, UNIQUE-Index auf planRef), Schema = Minimalformat (`core/istbuchung.ts`).
2. ✅ **Use-Case `postenBezahltMarkieren` / `bezahltZuruecknehmen`** → schreibt/entfernt Ist-Buchung mit `planRef`; idempotent (Dedup über die Quelle).
3. ✅ **Reconciliation light** in Übersicht/Deckung/Stammdaten: realer Kontostand = Anfangsbestand + Σ Ist (`realerKontostand`/`liquideMittelReal`).
4. ✅ **Plan/Ist je Posten** sichtbar; Übersicht „Nächste Zahlungen" → abhakbar; bezahlte Posten fallen aus der Projektion (kein Doppelzählen).
5. **Topf-Verbrauch real** (Ausgabe in Topf-Kategorie entnimmt) — sobald Ist-Buchungen Kategorien tragen. *(offen)*
6. *Später:* Bankimport als zweite Quelle hinter demselben Port + Dedup/Matching + (dann) echtes Package.

Offen für eine spätere Sitzung: genaue **Dedup-Heuristik** Manuell↔Import; ob Töpfe je ein
eigenes (Unter-)Konto bekommen (KONZEPT §8, weiterhin optional).
