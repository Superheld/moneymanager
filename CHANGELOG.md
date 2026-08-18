# Changelog

Alle nennenswerten Änderungen an Moneymanager. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/); Versionierung [SemVer](https://semver.org/lang/de/).

## [0.14.0] — 2026-08-19

Die App holt sich die Buchungen jetzt selbst bei der Bank — und, was mehr Arbeit war:
sie kann sagen, ob sie damit vollständig ist. Dazwischen liegt alles, was eine
abgerufene Zeile durchläuft, bis sie im Konto steht.

### Hinzugefügt

**FinTS-Abruf (S-6).** PIN/TAN über `lib-fints`, Transport über `tauri-plugin-http`
(Bankserver senden keine CORS-Header, die Webview allein käme nicht durch). Die Bank
wird aus der Liste der Deutschen Kreditwirtschaft gewählt — 1735 Institute mit BLZ, Ort
und FinTS-Endpunkt liegen im Repo, die Registrierungsnummer ausdrücklich nicht: sie steht
in der `.env`, und ein Test scheitert, sobald sie in einer versionierten Datei auftaucht.
Zugänge und Kontozuordnungen sind dauerhaft, Abruf auf Knopfdruck.

**Dublettenfinder** (`application/import/dublette.ts`) — deterministisch und
quellenagnostisch, er vergleicht Bankzeile gegen Dateizeile, ohne zu wissen, welche
welche ist. Kein Modell: die Frage ist Identität, nicht Ähnlichkeit, und bei einer
Fehlentscheidung muss der Grund lesbar sein. Betrag und Konto sind harte Vorbedingungen,
darüber ein Punktesystem aus Datum (Buchungstag ODER Valuta), Gläubiger-ID plus
Mandatsreferenz, Zweck-Präfix und Gegenpartei. Am echten Bestand gemessen: 50 identisch,
3 zur Bestätigung vorgelegt, 7 wirklich neu; ein Reimport derselben Datei erkennt
5279 von 5279 wieder, in 2 ms. Wird eine Zeile wiedererkannt, entsteht keine zweite —
die vorhandene bekommt die Felder, die ihr fehlen.

**Bankabgleich.** Bei jedem Abruf wird der Kontostand geholt, den die BANK meldet, und
gegen den gerechneten gestellt. Das ist der Unterschied zwischen „in sich schlüssig" und
„nachweislich vollständig": ohne eine zweite, unabhängige Quelle sieht ein Konto mit einer
fehlenden Buchung genauso richtig aus wie eines ohne. Die Differenz steht im Kontokopf und
als Spalte in der Übersicht, mit Vorzeichen und Deutung — Bank hat mehr heißt fehlende
Einnahme, App hat mehr heißt fehlende Ausgabe oder Dublette. Ohne Toleranz: ein Cent ist
eine fehlende Buchung, kein Rundungsfehler.

**Ein Buchungsdialog für drei Rollen** — anlegen, Entwurf prüfen, bearbeiten. Vorher
waren es zwei Masken mit denselben fünf Feldern; jede Erweiterung war doppelt zu bauen
oder blieb auf einer Seite liegen (so fehlte im Anlegen das Konto). Der Entwurfs-Modus
schreibt nichts, bis man drückt: Übernehmen bucht, Verwerfen legt weg, Wegklicken lässt
alles stehen. Tag und Betrag sind dort fest — das ist die Aussage der Bank, keine
Eingabe. Umbuchung und Vertragszuordnung lassen sich schon am Entwurf entscheiden.

**Konten als eigener Bereich**, online wie offline in einem Anlege-Dialog, mit
sichtbarer Verbindung und wartenden Buchungen je Konto. Die Verwaltung läuft jetzt über
Register statt Klappkarten.

### Geändert

- **Abgerufene Buchungen stehen beim Konto, nicht in der Import-Inbox.** Die Inbox ist
  der Ort für den gelegentlichen Dateiimport; ein Bankabruf ist Alltag und gehört dorthin,
  wo man auf das Konto schaut.
- **Der Abrufzeitraum ist wählbar** (fortlaufend / 30 / 90 / 180 / 360 Tage). Ein
  ausdrücklicher Wunsch gewinnt gegen den letzten Stand.
- **Das Konto einer Buchung ist änderbar.** Der Konto-Match des Imports ist eine
  Vermutung; wer die Buchung vor sich hat, korrigiert sie. Bei einem Umbuchungs-Bein
  verweigert der Use-Case den Wechsel — das Gegenkonto steht am anderen Bein.
- **„Löschen" sagt jetzt, was es tut:** bei importierten Buchungen bleibt die Bankzeile
  erhalten und steht danach wieder unter den Entwürfen.

### Behoben

- **Verworfene Bankzeilen waren unerreichbar.** Verwerfen war ein Endzustand, die Zeile
  stand in keiner Oberfläche, und einen Rückweg gab es im Code nicht — eine
  versehentlich verworfene Zeile nahm ihren Betrag aus dem Kontostand mit, ohne Spur.
  Jetzt sichtbar unter „Weggelegt", mit derselben Dublettenprüfung wie oben (steht das
  Gegenstück wirklich im Bestand?) und mit Rückweg.
- **Eine Umbuchung zwischen zwei unbestätigten Entwürfen** ließ sich nicht als solche
  bestätigen: die Paarung entsteht beim gemeinsamen Verbuchen, und das Gegenbein liegt
  per Definition auf einem anderen Konto. Es wird jetzt mitgenommen.
- **„Bestätigen & bearbeiten" bestätigte nur** — der Callback hielt einen veralteten
  Zustand fest, in dem die eben erzeugte Buchung nicht sein konnte.

### Sicherheit

- **Eine echte Kontoverbindung stand in zwei Tests.** Unter einem erfundenen
  Institutsnamen eine echte Bankleitzahl samt echter Kontonummer, zusammengesetzt zu
  einer gültigen IBAN. Der erfundene Name macht die Zahlen nicht anonym. Ersetzt durch
  frei erfundene Werte und aus der noch nicht veröffentlichten Historie entfernt.
- **Ein Empfängername in einem Test** las sich wie ein echter Personenname und stand
  zusammen mit Betrag und Verwendungszweck da. Ersetzt. Er steht allerdings bereits in
  der veröffentlichten Historie (8d2f5b4).

## [0.13.0] — 2026-08-17

Zwei Themen, die dasselbe Ziel haben: die App soll die Arbeit erkennen, statt sie
abzufragen. Verträge zeigen jetzt auf echte Buchungen statt auf einen Namen, und
Buchungen bekommen ihre Kategorie selbst — aus einem Modell, das auf den eigenen
Korrekturen trainiert ist und jede Entscheidung begründet.

### Hinzugefügt

**Automatische Kategorisierung.** Eine importierte Zahlung ohne mitgelieferte Kategorie
kam bisher unkategorisiert in der Inbox an — der Normalfall für jeden Bankimport (CSV,
FinTS). Jetzt entscheidet eine Kette, von „festgelegt" zu „geraten":

  Umbuchung → Festlegung → Vertrag → Modell → Import-Kategorie

- **Klassifikator** (`core/klassifikator`): multinomiale logistische Regression über
  Bag-of-Words, rein, zero-dep. Linear ist Absicht — der Lern-Spike zeigte MLP und
  tief+breit gleichauf, der Deckel ist daten- und nicht modelllimitiert. Bei einem
  linearen Modell IST die Begründung das Modell: jede Entscheidung zerfällt ohne
  Näherung in „woran lag es" ([anonymisiert] → Lebensmittel: `emp=[anonymisiert]` +2.30, `vwz:[anonymisiert]`
  +2.19). Am echten Bestand **89,1 % im Mittel über fünf Splits** (bester Einzelsplit
  90,5 % — bewusst nicht als Kalibrierziel genommen), 137 ms über 3689 Beispiele.
  Determinismus über einen gesetzten Generator statt `Math.random`: zweimal „Training
  starten" muss dasselbe Modell ergeben.
- **Merkmalsextraktion** mit getrennten Namensräumen (`emp=` ganzer Empfänger, `emp:`
  seine Einzelwörter, `vwz:`, `gid:`, `vz:`), am echten Bestand kalibriert: angeklebte
  Nummern werden abgeschnitten statt das Wort wegzuwerfen (ohne das fielen `debitkarte`
  mit 1057 und `comdirect` mit 366 Belegen komplett aus dem Vokabular), Grenze bei drei
  Stellen, damit `o2` heil bleibt; maskierte Kartennummern (`xxxx`, 1060×) fliegen raus.
- **Vier Karten in den Einstellungen** entlang des tatsächlichen Trainingsablaufs:
  Trainingsdaten → Merkmale → Ausschlüsse → Erkennungsmodell. Merkmalsquellen sind
  einzeln abschaltbar, die Ausschlussliste ist pflegbar, und **„Wirkung messen"** sagt,
  was das Weglassen einer Quelle kosten würde (sechs Varianten über fünf Splits).
- **Verwechslungsmatrix** statt Schwächenliste: nicht nur wie oft eine Kategorie
  danebengeht, sondern wohin. Dünn gespeichert — bei 49 Kategorien wären es 2401 Zellen,
  von denen auf echten Daten 50 belegt sind.
- **„Was die Erkennung hier sieht"** im Buchungsdialog: die Merkmale DIESER Zahlung, je
  mit ihrer Trennschärfe über den ganzen Bestand, dazu der Modellvorschlag samt
  Beitragszerlegung. Ausschlüsse lassen sich dort pflegen, wo der Beleg liegt.
- **Festlegungen** („immer bei diesem Empfänger"): das dünne Overlay über der Erkennung,
  für Aussagen, die halten sollen. Empfängermuster → Kategorie, sonst nichts — keine
  Betragsspanne, kein Zeitraum. Sie entsteht nur auf ausdrückliche Zustimmung nach einer
  Korrektur; beim Annehmen ziehen die übrigen offenen Zeilen desselben Empfängers mit.
- **Rückwirkender Abgleich mit Vorschau.** Ohne ihn wirkte alles nur nach vorn: ein
  frisch trainiertes Modell ließe die 5280 vorhandenen Zahlungen unberührt. Rechnen und
  Schreiben sind getrennt — die Vorschau zeigt Übergänge statt Zeilen („52 × Sonstiges →
  Kinderbetreuung" mit Beispiel-Empfängern), einen eigenen Abschnitt für die Wechsel, die
  auch den Charakter ändern, und was warum übersprungen wurde. Geschrieben wird erst auf
  Bestätigung.
- **Kategorie-Herkunft an der Ist-Buchung** (Migration 20): `quelle` sagt, woher die
  BUCHUNG stammt, nicht woher ihre KATEGORIE stammt. Ohne diese Trennung kann kein
  automatischer Lauf unterscheiden, ob er seinen eigenen Treffer korrigiert oder eine
  Handentscheidung plattmacht.

**Vertrag ↔ Buchung, echt verknüpft** (Migration 19). Bis hierher zeigte ein Vertrag auf
KEINE Buchung; die Zugehörigkeit wurde jedes Mal neu aus dem Empfängernamen abgeleitet.
Das reicht für eine Pille und für nichts, was rechnet.

- **Erkennungsregel** je Vertrag (Merkmale, Betragsspanne, Zeitraum, Konto) — getrennt vom
  Vertrag wie die Zahlungsregel: der Vertrag beschreibt Konditionen, die Erkennung
  beschreibt Zuordnungspolitik. Die Standardspanne ist bewusst weit und unsymmetrisch
  (60 %…180 %): sie soll fremde Zahlungen an denselben Empfänger draußen halten, nicht die
  eigenen aussortieren.
- **Zuordnung mit Herkunft:** `automatisch` darf der Abgleich überschreiben, `manuell` nie.
  `vertrag_id NULL` ist keine fehlende Angabe, sondern die Aussage „gehört ausdrücklich zu
  keinem Vertrag" — ohne sie käme ein Fehlgriff bei jedem Lauf zurück.
- **Regel einsehen und nachsteuern**, mit **Live-Vorschau**: bei jeder Änderung steht
  darunter, welche Buchungen die Regel gerade trifft. Ohne sie wäre jede Anpassung ein
  Blindflug.
- **Typisierte Merkmale und Wildcards.** Jedes Merkmal trägt seine Art (`glaeubigerId` |
  `empfaenger`) und wird nur gegen das Feld seiner Art geprüft — vorher hing die
  Vorrangregel „ID schlägt Namen" an einer Vermutung. `*` steht für beliebigen Text; alles
  andere wörtlich (ein Punkt in „E.ON" ist ein Punkt).
- **Vertrag aus einer Buchung anlegen**, mit Vorbelegung. Und umgekehrt: eine Buchung
  zeigt, wenn ihr Empfänger schon ein Vertrag ist — wer dort nur „Vertrag daraus machen"
  liest, legt beim zweiten Blick auf dieselbe Miete einen zweiten Mietvertrag an.
- **Vertragsvorschläge begründen sich.** Je Prüfung der gemessene Wert UND die Schwelle,
  gegen die geprüft wurde — der Wert allein sagt nicht, ob er knapp war. Wer sieht, dass
  68 Zahlungen im 30-Tage-Takt an dieselbe Gläubiger-ID gingen, entscheidet anders als bei
  drei Zahlungen mit schwankendem Abstand.
- **Vierte Vertrags-Ansicht: nach Kategorie.** Beantwortet, was weder Liste noch Turnus
  beantworten — wofür gehen die festen Kosten drauf. Gruppiert nach HAUPTkategorie:
  „Strom", „Gas", „Wasser" als drei Gruppen mit je einem Vertrag sagen weniger als eine
  Gruppe „Wohnen". Dafür neu im Kern: `hauptkategorie()`, bis zur Wurzel.

### Geändert
- **Die Einstellungs-Karten starten eingeklappt.** Der Inhalt hängt erst beim Aufklappen
  im Baum — damit läuft auch sein Ladeeffekt erst dann. Die Kategorisierungs-Karten ziehen
  den gesamten Ledger; das zu tun, obwohl jemand nur eine Person umbenennen will, war
  Arbeit für nichts.
- **Verträge auf einer Fläche.** Der Ansichts-Umschalter sitzt in der Card wie eine
  Filterleiste; die gruppierenden Ansichten sprengten den Screen vorher in eine Card je
  Gruppe, derselbe Bestand sah je nach Umschalterstellung aus wie ein anderer Screen.
  Tabellen dort sind bewusst nicht mehr sortierbar — eine angeklickte Spalte überschrieb
  genau die Ordnung, die die gewählte Ansicht ausmacht; daneben steht jetzt, wonach sie
  ordnet.
- **Vertragsmaske:** Konditionen (Laufzeit, Fristen) zugeklappt, mit Zusammenfassung in der
  Kopfzeile — sonst müsste man aufklappen, nur um zu sehen, ob es etwas zu sehen gibt.
- **Der Vertrag trägt eine Kategorie** (Migration 23), nicht nur seine abgeleitete
  Zahlungsregel. Was eine Buchung trifft, ist die Vertragszuordnung, und die zeigt auf den
  Vertrag.
- **Stoppwörter liegen in der Datenbank** (Migration 22), nicht mehr im Code. Blieben sie
  dort, bräuchte es zusätzlich eine Liste der Ausnahmen von der Liste. Damit revidiert:
  die frühere Entscheidung „fest im Code, nur einsehbar". Sie war unter der Annahme
  richtig, dass sich nicht messen lässt, welches Merkmal taugt — es lässt sich messen, und
  die Messung gehört in die App.
- **Monatsverlauf:** Einnahmen und Ausgaben auf gemeinsamer Grundlinie, beide nach oben.
  Divergierende Balken zwangen zum Spiegeln im Kopf.
- **Buchungsmaske:** Kategorie und Aufteilung sind EIN Block, weil nur eines von beiden
  gilt.

### Behoben
- **Die Vertrags-Kategorie war auf dem echten Bestand nie angekommen.** Nach Migration 23
  stand sie bei allen 16 Verträgen auf NULL, obwohl jeder eine Zahlungsregel mit Kategorie
  hatte: die laufende App hatte Version 23 verbucht, als die Migration erst aus dem
  `ALTER TABLE` bestand — der Nachtrag kam Minuten später und war damit für immer erledigt,
  ohne je gelaufen zu sein. Die Vertragsstufe der Kategorisierungs-Kette war dort tot.
  **Migration 25** trägt es nach, in einer neuen Version statt in der alten; die Falle
  steht jetzt in CLAUDE.md.
- **Übersicht/Kategorien:** die Detailtabelle liegt neben der Zeile statt darin — vorher
  schloss jeder Klick in die Tabelle die Kategorie wieder (Bubbling), und die Einfärbung
  der offenen Zeile legte sich als Rahmen um die Tabelle.
- **Inventar:** „davon da" misst gegen die Wiederbeschaffung statt gegen das rechnerische
  Soll, damit beide Balken eines Gegenstands denselben Maßstab haben; dazu eine Trennlinie
  zwischen den Gegenständen — zwei Balken je Posten sahen sonst aus wie vier Balken eines
  Postens.
- Einer geteilten Buchung ließ sich wieder eine Kategorie geben — genau der Zustand, den
  `buchungSplitten` ausschließt.

### Schema
Migrationen 19–25: Vertragserkennung und -zuordnung (19), Kategorie-Herkunft an der
Ist-Buchung (20), Klassifikator-Modell (21), Merkmalsausschlüsse (22), Kategorie am Vertrag
(23) samt Nachtrag (25), Kategorie-Festlegungen (24).

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
