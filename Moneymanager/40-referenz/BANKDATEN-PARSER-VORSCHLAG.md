# Vorschlag: Bankdaten-Parser als geteiltes (summae-)Paket

> **Status:** Entwurf zur Prüfung · **Stand:** 2026-06-20 · **Autor:** Bruce + Claude
> **Zweck:** Bewerten, ob ein eigenständiger Bankauszug-Parser eine summae-Idee ist.
> **Bezüge:** TAKTIK-IMPORT, BUCHUNGSPACKAGE-ANFORDERUNGEN, ROADMAP (P3.5), ADR-0003

## Idee in einem Satz

Ein **eigenständiges, persistenz- und domänenfreies Modul**, das Bankauszüge mehrerer
Formate (**CAMT.053**, MT940, CSV) in **eine neutrale kanonische Form** parst — nutzbar von
Moneymanager *und* summae *und* Dritten, weil es nichts über Ledger, Kategorien oder Matching
weiß.

## Warum (Problem + Passung zu summae)

- Moneymanager braucht für den Bankimport (P3.5) genau diesen Parser. Laut TAKTIK-IMPORT sind
  „Parser reine Bibliotheks-Adapter, **null Domänenlogik**". Das schreit nach einer geteilten
  Komponente statt einer app-internen Wegwerflösung.
- **Passung zu summae:** summae ist ein persistenz-agnostischer Buchführungskern mit einer
  *Published Language* (A5-Datenformat) und einer **sprachübergreifenden Konformitätssuite**
  (PHP↔Node byte-identisch). Ein Parser, der viele Bankformate auf **eine kanonische Form**
  mappt, ist dieselbe Denkfigur — und ein Fixture-getriebener Korpus passt 1:1 zur summae-
  Testkultur. Bankauszug-Ingest ist generische Infrastruktur, die jedes Buchungssystem braucht.
- **Abgrenzung zu summaes Kern:** Der Parser bucht *nicht*. Er erzeugt nur neutrale Umsatz-
  Objekte. Die Übersetzung kanonisch → Buchungssatz (die ACL) bleibt app-seitig — bei
  Moneymanager die `Verbuchungsübersetzung` hinter dem `LedgerPort`.

## Scope

**Ist:**
- Parsen von CAMT.053 (XML, ISO 20022), MT940, CSV → kanonische Umsatz-/Auszugs-Objekte.
- Vorzeichen-/Richtungs-Normalisierung (CdtDbtInd → signierter Betrag), Datums-Normalisierung,
  tolerante Behandlung von Format-/Versions-Eigenheiten.
- Roh-Hash je Umsatz als Basis für Duplikaterkennung (deterministisch).

**Ist nicht:**
- Keine Kategorisierung, kein Auto-Matching, keine Regeln (app-/domänenspezifisch).
- Keine Persistenz, keine Ledger-Kopplung, kein Buchen.
- Keine Netz-/Bank-Anbindung (FinTS später als *Quelle*, die denselben Parser füttert).

## Kanonische Form (die Schnittstelle)

Grob, als Diskussionsgrundlage — das ist das eigentliche „Produkt":

```
Auszug {
  konto: { iban, waehrung, inhaber? }
  saldoEroeffnung, saldoSchluss: { betrag, waehrung, datum }
  zeitraum: { von, bis }
  umsaetze: Umsatz[]
}
Umsatz {
  betrag: Cent (signiert; − = Abfluss, aus CdtDbtInd)
  waehrung
  status: gebucht | vorgemerkt        // BOOK | PDNG
  buchungstag, valuta                 // BookgDt, ValDt
  gegenpartei: { name?, iban? }       // RltdPties Cdtr/Dbtr
  verwendungszweck: { unstrukturiert?, strukturiert? }   // RmtInf Ustrd/Strd
  bankTxCode?                         // BkTxCd (Domain/Family/SubFamily)
  referenzen: { endToEndId?, mandatId?, bankRef? }
  rohHash                             // Dedup-Basis
  sammelbuchung?: Umsatz[]            // NtryDtls mit mehreren TxDtls (Batch)
}
```

Versions-Varianten, die abzudecken sind: `camt.053.001.02`, `.04`, `.08`; MT940; CSV-Dialekte.

## Build vs. Buy (Marktlage 2026-06)

Geprüft (npm):
- **`@classytic/fin-io`** (v0.6.7, MIT) — multi-format (CAMT.053/MT940/CSV → „one canonical
  shape"), Deps nur `fast-xml-parser` + `papaparse` (browsertauglich). **Aber:** Teil eines
  **kommerziellen, MongoDB-zentrierten Commerce-Ökosystems** (`@classytic/*`, inkl. eigenem
  MongoDB-Ledger), **kein öffentliches Repo** für fin-io selbst → Vendor-Abhängigkeit, Quelle
  nur via npm-Tarball einsehbar. Sehr jung (0.x).
- **`statementkit`** (v0.2.0) — sehr breit (inkl. OCR), aber **teils kostenpflichtig**, früh.
- `camt-parser` (v2.1.0, XSD-Validierung), `@ingram-tech/camt053` (0.1.0) — Optionen, jung.
- Ältere (`camt`, `node-camt`, `camtts`) — veraltet/falscher Message-Typ.

**Tendenz:** Da es keine reife, offene, browsertaugliche CAMT.053-Lib *ohne* Vendor-Lock gibt,
spricht viel fürs **Selbstbauen** mit denselben browsersicheren Bausteinen (`fast-xml-parser`
für XML, `papaparse` für CSV) — als standalone Modul, das *wir* kontrollieren und das summaes
Testkultur (Fixture-Konformität) erbt. fin-io kann als Referenz/Benchmark für die kanonische
Form dienen.

## Testkorpus (das entscheidende Kriterium)

Bruce' Bedingung: „wenn wir ausreichend Testdaten haben, **quer durch die Welt**". Quellen,
direkt nutzbar:

- **GitHub-Fixtures (Roh-XML):** viafintech/camt_parser (`053.001.02`, DE/SEPA),
  jasperkrijgsman/dutch-sepa-iso20022 (NL), tjeerdnet/CAMT053Parser (Java-Beispiele),
  gecapo/camt.053.001.02-validator (inkl. XSD), statementkit-Repo (30+ Banken als Korpus).
- **Bank-/Standard-Quellen:** Goldman Sachs Developer (`001.02` US, `001.08` SEPA + struktur.
  Remittance), iso20022.org (offizielle Samples + XSDs, alle Versionen).
- **Echt-Sample:** Export aus eigener Bank (beste Realdaten; sensibel behandeln).

Abdeckung anstreben: Versionen `001.02/.04/.08`, Länder DE/NL/CH/US/EU, Sonderfälle
(strukturierter Verwendungszweck, Sammelbuchungen, FX, Gebühren, Retouren). Dieser Korpus wird
für **beide** Wege (buy *und* build) gebraucht — er ist der erste Bauschritt.

## Offene Fragen für die summae-Prüfung

1. **Gehört der Parser in summae** (Modul/Package im Monorepo) oder ein **eigenes Repo**, das
   summae und Moneymanager beide konsumieren?
2. **Sprachstrategie:** summae ist multi-impl (PHP/TS, byte-identisch). Folgt der Parser dem
   (Konformitätssuite über Sprachen) oder startet er TS-only (Moneymanagers akuter Bedarf)?
3. **Kanonische Form vs. summaes A5:** Ist die Parser-Ausgabe eine eigene neutrale Form (und
   die Abbildung auf A5 bleibt App-/ACL-Sache), oder soll der Parser direkt A5-nah ausgeben?
4. Lizenz/Naming, falls publiziert.

## Status / nächster Schritt

Reine Aufschreibung zur Prüfung — **nichts gebaut**. Wenn die Idee für summae trägt: zuerst den
**Testkorpus** zusammenstellen (gating), dann die kanonische Form festklopfen, dann Parser
(eigene Lib oder fin-io hinter Adapter) + Konformitätstests. Für Moneymanager läuft das in
jedem Fall hinter dem `Quellen-Port` (TAKTIK-IMPORT), Architektur unverändert.
