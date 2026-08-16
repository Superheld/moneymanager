# Changelog

Alle nennenswerten Änderungen an Moneymanager. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/); Versionierung [SemVer](https://semver.org/lang/de/).

## [0.12.0] — 2026-08-16

Der Monatsausblick wird zum Einstieg, Verträge und Budgets schlagen sich selbst vor —
und die Planungsseite fliegt raus, weil sie das falsche Versprechen gab.

### Hinzugefügt
- **Monatsausblick** ganz oben in der Übersicht: drei Karten (laufender Monat + zwei
  Vorschauen), jede als Aufrechnung wie auf Papier — Einnahmen − Verträge − Budgets −
  Rücklagen = bleibt. Der laufende Monat trägt zwei Spalten (gebucht / geplant), die
  kommenden nur den Plan. Jede Zeile klappt auf und zeigt ihre Posten. **Einnahmen kommen
  aus Verträgen**, nicht aus einer Hochrechnung der Vergangenheit; fehlen sie, sagt die
  Karte das, statt eine Zahl zu erfinden.
- **Vertragsvorschläge.** `core/vertragErkennung` gruppiert gebuchte Zahlungen (Gläubiger-ID,
  sonst normalisierter Empfängername), leitet aus den Median-Abständen den Rhythmus ab und
  bietet Kandidaten im Verträge-Screen an; übernehmen füllt die Anlege-Maske vor, „kein
  Vertrag" merkt sich ein Merkzettel. Erkennt **beide Richtungen** (auch Gehalt) und liefert
  das Konto gleich mit. Am echten Bestand: 19 Kandidaten, davon 3 Einnahmen.
- **Budgetvorschläge.** Rahmen je Hauptkategorie = Median der Monatssummen **minus dem
  vertraglich gebundenen Teil**. Der Abzug ist der Inhalt: was ein Vertrag automatisch
  abbucht, steuert kein Budget. Kategorien, die fast nur aus Verträgen bestehen, bekommen
  deshalb gar keinen Vorschlag. Dazu die Schwankung (höchster Monat ÷ Median) — bei
  „Konsum & Lifestyle" steht dort ×23, und das sagt mehr als der Rahmen selbst.
- **Verträge in drei Ansichten:** Liste (frei sortierbar), Fälligkeit (was als Nächstes
  abgeht) und Turnus (nach Takt gruppiert). Dazu der **monatliche Rücklagenbedarf** —
  was die nicht-monatlichen Verträge pro Monat kosten, obwohl sie nicht abgehen.
- **Buchung auf mehrere Kategorien aufteilen** (S-7). Value Objects im Aggregat `IstBuchung`;
  der Ledger-Betrag bleibt eine Zeile, geteilt wird allein die Zuordnung. Alle Auswertungen
  laufen über `kategorieAnteile`.
- **Umbuchung aus einer bestehenden Buchung** (S-1): Gegenbein erzeugen, zwei vorhandene
  Buchungen nachträglich paaren, Paarung wieder lösen.
- **Buchungsdetails** statt nur „bearbeiten": Empfänger und Verwendungszweck (Join über
  `Umsatz.istbuchungId`), anklickbare Gegenbuchung, Herkunfts-Abschnitt (Quelle, Importlauf,
  native ID, Roh-Hash, Plan-Bezug). Aus der Übersicht heraus erreichbar.
- **Übersicht ausgebaut:** Monat direkt wählbar, Ø Ausgaben als Kennzahl, Abweichung eines
  Monats vom Zeitraum-Ø, Kategorien wahlweise einzeln oder zu **Hauptgruppen** gebündelt,
  Ø pro Monat je Kategorie, und drei Darstellungen (Fluss, Saldo, Tabelle) auf einer Fläche
  statt untereinander.
- **Inventar gleicht gegen ein echtes Konto ab.** Der Gegenstand nennt das Konto, auf dem
  seine Rücklage liegt; je Konto wird der reale Stand anteilig am Soll auf die Gegenstände
  verteilt, die darauf zeigen (Migration 17).
- **Alpha-Kennzeichen** in der Seitenleiste (`APP_STADIUM`), plus der Abschnitt „Stadium"
  in CLAUDE.md, der festhält, was in der Alpha erlaubt ist und wann die Freiheit endet.

### Geändert
- **Import liest xlsx statt CSV** — Finanzguru bietet nichts anderes mehr. Der Quellen-Port
  reicht jetzt rohe Bytes durch statt Text; die Encoding-Frage gehört zum Format. Eigener
  minimaler Leser (fflate zum Entpacken), kein SheetJS: dessen letzte npm-Fassung trägt zwei
  High-Advisories ohne Fix.
- **Budgets und Töpfe sind ein Bereich.** Zusammengelegt wurde die Oberfläche, NICHT das
  Modell: eine Budget-Ausgabe ist Aufwand, eine Topf-Einzahlung nicht. Dahinter laufen
  unverändert `budgetAnlegen` und `topfAnlegen`.
- **„Umschichtung" heißt in der Oberfläche „Sparen & Vorsorge"** — die letzte Stelle, an der
  ein Buchhaltungswort ungeglossart durchschlug. Der gespeicherte Enum-Wert bleibt.
- **Navigation geradegerückt:** „Übersicht" ist die Historie (was tatsächlich war) und der
  Startbildschirm.
- **Vertragsmaske gegliedert** in „Zahlung" (rechnet in die Planung) und „Vertragsdaten"
  (Laufzeit, Kündigung). Beginn und Fälligkeit haben jetzt eigene Felder.
- **Tabellen:** feste Zeilenhöhe, gekappte Zellinhalte (voller Text im `title`), Sprung auf
  erste/letzte Seite und direkte Seitenwahl, waagerecht scrollbarer Rahmen als Fangnetz.
- **Migrationen ohne Scheintransaktion.** Über tauri-plugin-sql landen `BEGIN`/`COMMIT`
  nicht auf derselben Verbindung (Pool, sqlx `max_connections: 10`). Statt einer Klammer,
  die wie Sicherheit aussieht, ist jetzt jedes Statement wiederholbar.
- **Werkzeuge:** Node 26 über `mise.toml` (CI zieht nach), TypeScript 7, vitest 4, vite 8,
  i18next 26 / react-i18next 17, @vitejs/plugin-react 6. `@types/node` explizit,
  `"types": ["node"]` in der tsconfig.

### Entfernt
- **Planung und Deckung.** Beide Screens, Szenarien, die Liquiditätsprojektion
  (`projiziereLiquiditaet`, `projiziereVerlauf`) und der zugehörige Port. Sie kommen
  irgendwann wieder, dann aber anders geschnitten — das bisherige Modell versprach eine
  Genauigkeit, die es nicht hielt.
- **Ersatz-Topf.** `TopfTyp` kennt nur noch `puffer` und `spartopf`. Das Inventar rechnet
  seine Rücklage selbst (`monatsRuecklage`, `sollRuecklage`), statt ein eigenes Sparvehikel
  zu führen; „ersetzt" bucht nichts mehr, es startet nur den Zyklus neu.
- **Schema-Altlasten** (Migration 18): `szenario`, `szenario_posten` und die drei
  Ersatz-Topf-Spalten an `topf`. Alle nachweislich leer, kein Datenverlust. Erste Migration,
  die wegnimmt — erlaubt durch das Alpha-Stadium, mit unveränderten Regeln darunter.

### Behoben
- **Budget-Verbrauch stand dauerhaft auf 0.** Budgets hängen an Hauptkategorien, gebucht
  wird auf deren Kindern — von 5207 Ist-Buchungen traf keine einzige ihre Budget-Kategorie
  direkt. `budgetVerbrauch` zählt jetzt den Unterbaum; die Kategorienliste ist Pflichtparameter,
  damit man sie nicht vergessen kann.
- **Doppelzählung beim Import.** Finanzguru liefert gesplittete Buchungen zweimal — als
  Original UND zerlegt in Teilbuchung/Restbetrag. In der echten Datei 78 Teile zu 38
  Originalen; ohne Fix wären 3.568,17 € doppelt gezählt worden.
- **`laeuft` rechnete über `ord`**, das einen Sortierschlüssel liefert und keinen Tageszähler
  — laufende Verträge landeten unter „beendet".
- **Gläubiger-ID ging beim Import verloren** (Migration 16); sie ist der präzisere Schlüssel
  für die Vertragserkennung als ein abgeschnittener Empfängername.
- **Vertragsbeginn verschob still den Zahlungstakt:** ein Feld hatte zwei Aufgaben
  (Fristenbasis und Startdatum der Zahlungsregel) — bei einem Jahresvertrag um bis zu elf Monate.
- **Fehlende i18n-Schlüssel** rendern den Pfad statt zu werfen; ein Test sammelt jetzt alle
  statisch lesbaren `t()`-Aufrufe und prüft sie gegen `i18n.exists()`. Ein zweiter verbietet
  sichtbare Texte als Literal.
- **Fast Refresh repariert** — `EinstellungenProvider` exportierte neben der Komponente auch
  Hooks, wodurch jede Änderung im UI-Baum einen vollen Reload auslöste (19 pro Dev-Session).
- Verwaiste Umsätze beim Löschen einer Umbuchung; `<Trans>`-Hervorhebungen ohne `key`
  (React-Warnung auf jedem Screen mit ausgezeichnetem Fließtext).

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
