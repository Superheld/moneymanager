# Changelog

Alle nennenswerten Änderungen an Moneymanager. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/); Versionierung [SemVer](https://semver.org/lang/de/).

## [0.10.0] — 2026-06-22

Großes Funktions-Release: Bankimport, Rückblick/Auswertungen, Buchungs-Bearbeitung,
Komfort für Listen & Tabellen.

### Hinzugefügt
- **Import (Finanzguru-CSV).** Modulare Quellen-Naht (`Quellenadapter`-Port + Registry) —
  weitere Formate/Apps lassen sich als eigenes Adapter-Objekt andocken, ohne Bestandscode
  zu ändern. Robustes CSV-Parsing (papaparse).
- **Konto-Zuordnung beim Import.** Quell-Konten werden per IBAN automatisch verknüpft oder
  mit vorausgefülltem Namen/Typ neu angelegt; neuer Kontotyp **Kreditkarte**.
- **Duplikaterkennung.** Native Buchungs-ID (exakt, gleiche Quelle) + Roh-Hash
  (quellenübergreifend) — identische Re-Importe bringen 0 neue Buchungen.
- **Review-Inbox.** Reversibler Entwurfs-Stapel: importierte Umsätze prüfen, je Zeile
  kategorisieren (Vorschläge aus dem Finanzguru-Remapping), nach Konto/Status filtern,
  Volltextsuche über Empfänger/Zweck, dann **verbuchen** ins Ledger.
- **Umbuchungen** (interne Übertragungen) werden erkannt und als Umschichtung gebucht,
  nicht als Ausgabe/Einnahme; sie verzerren Auswertungen nicht.
- **Historie (Rückblick).** Eigene Seite mit KPIs, echten Monatsflüssen (Einnahmen/Ausgaben)
  und realem Saldo-Verlauf; Zeitraum 12/24 Monate, Jahr, gesamt. Klick auf einen Monat →
  Kategorie-Aufschlüsselung; Klick auf eine Kategorie → Einzelbuchungen (Inline-Akkordeon).
- **Buchungen bearbeiten & entfernen** im Konto-Register (auch importierte; Löschen setzt den
  verknüpften Umsatz zurück in die Inbox, Import-Spur bleibt erhalten).
- **Listen & Tabellen.** Spalten-Sortierung (Klick auf Kopf) und Pagination in `DataTable`;
  Übersichtszahlen (KPIs) auf Inventar, Verträgen, Budgets und Töpfen; Pagination/„ältere
  anzeigen" im nun langen Konto-Register.

### Geändert
- Kategorie-Taxonomie (Standardkategorien) überarbeitet/erweitert.

### Bekannt / offen
- Split-Buchungen werden erkannt und gewarnt, aber noch nicht entzerrt (Doppelzählung vor
  produktivem Verbuchen prüfen).
- Plan/Ist-Auto-Matching, weitere Importquellen (CAMT/FinTS) und KI-Vorschläge stehen aus.

## [0.9.0] — Topf-Entnahme als Buchungssatz + Plan/Ist (ADR-0003)
Reale Topf-/Inventar-Stände, echte Entnahmen, Budget Plan/Ist über benanntes Gegenkonto.

## [0.8.0] — Ist „light": Konto-Register, Umbuchen, Reconciliation (ADR-0002)
Geplante Posten abhaken, realer Kontostand, verknüpfte Umbuchungen.

## [0.7.x] — Mehrwährung/i18n (ADR-0004), Stammdaten & Planung
Liquiditätsplaner, Verträge, Budgets, Inventar/Töpfe, Szenarien.

## [0.6.0] — Grundgerüst
Walking Skeleton, Stammdaten, hexagonaler TS-Kern, SQLite-Migrationskette.
