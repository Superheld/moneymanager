# Changelog

Alle nennenswerten Änderungen an Moneymanager. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/); Versionierung [SemVer](https://semver.org/lang/de/).

## [0.11.0] — 2026-06-22

Konto als Auszug, Tabellen-Komfort überall, und zwei Verhaltensänderungen am Import.

### Hinzugefügt
- **Konto-Auszug.** Statement-Ansicht je Konto mit prominentem realem Stand (Masthead);
  gebuchte Historie als Tabelle mit Pagination, Volltextsuche (Empfänger/Zweck) und
  Filtern nach **Art** (Einnahmen/Ausgaben/Umbuchungen, Segmented Control) und Kategorie.
  Importierte Zeilen zeigen den Empfänger statt des Füllworts „Buchung".
- **Konto per Klick wechseln** in der Konten-Übersicht (Tabelle, sortierbar).
- **Tabellen-Komfort generisch** in `DataTable`: opt-in Spalten-Sortierung und Pagination;
  genutzt in Historie, Verträgen, Budgets, Konten.
- **Historie-Detail als Inline-Akkordeon** (Einzelbuchungen klappen unter der Kategorie auf).

### Geändert
- **Umbuchungen werden beim Import gepaart** → verknüpfte Doppelbuchung (transferId +
  Gegenkonto), statt zweier einseitiger Umschichtungen wie in 0.10.0. Heuristik: Gegenbetrag
  + zwei eigene Konten + Buchungstag ≤ 3 Tage versetzt; ohne Partner Fallback auf einseitig.
- **Standardkategorien-Backfill:** fehlende Standardkategorien werden bei jedem Start
  ergänzt (idempotent), nicht mehr nur bei komplett leerer DB — so ziehen Taxonomie-
  Erweiterungen auf bestehenden DBs nach.
- Konto-Register: Sortierung entfernt (der laufende Saldo ist chronologisch); dafür mehr Filter.

### Behoben
- Historie-Lade-Race (Kategorien zu spät gesetzt → fälschlich „ohne Kategorie").
- Historie-Breite an die anderen Seiten angeglichen (`.screen`-Container).

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
