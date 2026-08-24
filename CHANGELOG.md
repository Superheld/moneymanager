# Changelog

Alle nennenswerten Änderungen an Moneymanager. Format angelehnt an
[Keep a Changelog](https://keepachangelog.com/de/1.0.0/); Versionierung [SemVer](https://semver.org/lang/de/).

## [0.21.0] — 2026-08-25

Die Runde, in der die Oberfläche aufhört, geliehen auszusehen: ein eigenes Zeichen im Dock,
eigene Bedienteile statt der Fenster des Betriebssystems, und Platz für den Inhalt, der
vorher an die Seitenleiste ging.

### Hinzugefügt

**Ein eigenes App-Icon.** Bis hierher startete die App mit dem mitgelieferten Tauri-Zeichen
— erkennbar als „irgendeine Tauri-App", nicht als diese. Das Motiv ist das, was die App
tut: drei Budgetrahmen, gleich hoch, verschieden weit gefüllt. Kein Balkendiagramm, bei dem
die Höhe alles sagt; hier sagt sie nichts ohne den Rahmen daneben, und genau das ist der
Unterschied zwischen „ausgegeben" und „ausgegeben von wieviel". Die SVG-Quelle liegt im
Repo, samt Rezept — sechzehn PNG ohne Vorlage wären eine Sackgasse.

**Auswahlfelder im Design der App.** Ein natives Auswahlfeld öffnet die Liste des
Betriebssystems: andere Schrift, andere Abstände, andere Farben, je Plattform anders. In
einer Oberfläche, in der alles andere aus denselben Tokens gebaut ist, ist das der sichtbare
Bruch. Dafür kommt mit Base UI die erste UI-Bibliothek ins Projekt — sie liefert
ausschliesslich die Mechanik, die man nicht nebenbei richtig schreibt (Tastaturbedienung
samt Tippsuche, ARIA zwischen Knopf und Liste, Fokusfalle), und kein Aussehen.

**Ein Datumsfeld, in das man auch tippen kann.** Der Kalender ist von Hand gebaut, weil die
Bibliothek keinen mitbringt — ein Grid mit Pfeiltasten ist die ungleich kleinere Aufgabe.
Es ist ausdrücklich eine EINGABE mit Kalenderknopf und kein blosser Knopf: wer ein Datum
kennt, tippt es schneller, als er es sucht. Gelesen wird tolerant (Punkte, Schrägstriche,
durchgetippte Ziffern), und ob der Tag oder der Monat vorn steht, entscheidet die Sprache
und keine Annahme.

### Geändert

**Das Fenster startet breiter, die Seitenleiste klappt zusammen.** 248 Pixel sind bei einem
breiten Fenster ein Viertel und bei einem schmalen ein Drittel; der Inhalt bekam den Rest,
und Text brach an Stellen um, an denen er nicht umbrechen musste. Wird es eng, zeigt die
Leiste nur noch ihre Icons — die es dafür überhaupt erst brauchte, denn zehn gleiche Punkte
untereinander sind keine Navigation.

**Der Prüfmarker im Auszug heisst „erledigt".** Er ist dort ein Knopf, und ein Knopf soll
seine Handlung nennen, nicht den Zustand, den er beendet. Am Kästchen im Detaildialog bleibt
es beim alten Wort — dessen Haken bedeutet das Gegenteil.

**Buchungen mit einem Buchungstag in der Zukunft sind gedämpft.** Manche Banken vergeben
für eine heute veranlasste Überweisung den Buchungstag von morgen und führen sie bereits im
Saldo. Solche Zeilen sind gebucht und keine Vorhersage, sie stehen also weiterhin oben —
sahen dort aber aus wie längst geschehen.

### Behoben

**Die Budgetzeile der Übersicht schiebt nichts mehr aus der Karte.** Sichtbar wurde es beim
aufbauenden Budget, weil dort zusätzlich die Aufrechnung steht; die Ursache lag daneben —
ein Flex-Kind schrumpft ohne `min-width: 0` nicht unter seinen Inhalt und drängt stattdessen
die rechte Spalte nach aussen. Jetzt weicht der Name zurück und sonst nichts.

**Der Aktualisierungsknopf überlebt die schmale Seitenleiste.** Beim Einklappen fällt die
Fusszeile weg, und der Knopf wäre stumm mitgegangen. Auskunft darf weichen, eine Handlung
nicht — ein Update, von dem niemand erfährt, ist keines.

### Abgesichert

**Der Rückfluss hat einen eigenen Prüfstand.** Eine Erstattung ist ein Aufwand mit positivem
Betrag: „Aufwand" sagt, wofür das Geld war, das Vorzeichen, wohin es floss. Der Fehler ist
dabei nie eine einzelne falsche Funktion, sondern immer derselbe Griff — jemand leitet das
Vorzeichen aus der Einordnung ab, statt das vorhandene zu nehmen —, und er wandert dorthin,
wo gerade kein Test steht. Jetzt laufen alle Rechenwege, die auf den Charakter verzweigen,
an einem Ort gegen denselben Fall.

## [0.20.0] — 2026-08-24

Die Runde, in der die App den Rechner wechselt: sie wird installiert statt gestartet, sie
holt sich ihre Nachfolgerin selbst — und die Entwicklung hört auf, mit echtem Geld zu
spielen.

### Hinzugefügt

**Selbstaktualisierung.** Beim Start prüft die App still nach. Liegt nichts bereit,
verändert sich nichts — kein Hinweis, kein Haken, kein Platzhalter; das ist der
überwiegende Fall, und in ihm soll die Oberfläche sich nicht bewegen. Liegt etwas bereit,
erscheint unten links in der Seitenleiste ein Knopf, neben Version und Stadium. Dort steht
schon, WELCHE Version läuft; „0.19.0" und „0.20.0 installieren" beantworten dieselbe Frage.
Ein Klick lädt, installiert und startet neu.

**Zwei Fehlerarten, zwei Antworten.** Ein Fehlschlag beim PRÜFEN ist kein Fehler: kein
Netz, Endpunkt weg, Antwort kaputt — in allen Fällen lautet die Antwort „nichts Neues".
Eine Updater-Fehlermeldung wäre Beunruhigung ohne Handlungsmöglichkeit für jemanden, der
gerade Ausgaben eintragen wollte. Beim EINSPIELEN dreht sich das um: dort hat jemand
geklickt und wartet, und ein stiller Fehlschlag hinterliesse einen Knopf, der nichts tut.

Die Prüfung ist der erste Netzzugriff, den die App **von sich aus** macht — bisher sprach
sie nur nach draussen, wenn jemand einen Bankabruf auslöste. Sie ist deshalb abschaltbar;
ohne Zutun ist sie an, denn ein Update, von dem niemand erfährt, ist keines.

**`npm run installieren`** baut die App und legt sie nach `/Applications`, samt dem
Handgriff, den man vergisst: das Quarantäne-Merkmal abräumen. Ohne ihn meldet macOS die
unsignierte App als „beschädigt", was sie nicht ist, und die Meldung zeigt in die falsche
Richtung.

**Ein Release-Workflow.** Ein Tag `v*` baut auf macOS, signiert und hängt Archiv, DMG und
Manifest an ein GitHub-Release — genau das Manifest, das der Updater anfragt. Typecheck
und Tests laufen davor: ein Release aus rotem Code wäre schlimmer als keines, denn es liegt
danach draussen und wird von installierten Apps eingespielt.

**Ein Spielstand für die Entwicklung** (`npm run seed`): vollständig migriert, mit
erfundenen Daten in jedem Bereich — Konten, Kategorien, Budgets samt Betragsreihe, mehrere
Monate Buchungen, Verträge, Inventar, ein Depotverlauf, Belege aus zwei Quellen in allen
vier Status, Zwillinge mit und ohne Freigabe, Zahlungsregeln. Sein Zufall ist gesät: derselbe
Aufruf erzeugt denselben Bestand, ein Screenshot von gestern zeigt dieselben Zahlen wie
einer von heute.

### Geändert

**Die Entwicklung läuft auf einer eigenen Datenbank.** Bisher zeigten `tauri dev` und ein
gebautes Bundle auf dieselbe Datei. Das ist die Grenze zwischen „kaputt" und „weg": im
Alpha-Stadium dürfen Migrationen ausdrücklich wegnehmen, und ein Versuch, der schiefgeht,
träfe sonst den einzigen Bestand, den es gibt. Getrennt wird am DATEINAMEN
(`moneymanager.db` gegen `moneymanager-dev.db`), entschieden an einer Stelle
(`adapters/persistence/datenbankdatei.ts`) — nicht über den Bundle-Identifier, denn der
bestimmt auch die Identität der installierten App: wer ihn anfasst, schickt sie in ein
neues, leeres Verzeichnis, und der echte Bestand sieht aus wie verschwunden.

**`scripts/bestandsmerkmale.mjs` ist jetzt versioniert.** Es war nie ignoriert, nur nie
committet — und lag damit ausschliesslich in einer Arbeitskopie. In jedem frischen Klon und
jedem Worktree fehlte es, und der `pre-push`-Wächter brach dort ab, statt zu prüfen. Der
Wert-Abgleich lief seit seiner Einführung an genau einer Stelle; ein Wächter, den nur eine
Maschine hat, schützt nur diese eine, und das Repo ist öffentlich.

**`vite-node` ist deklariert.** Es war nie eine Abhängigkeit, sondern wurde von npx
stillschweigend nachgeladen — was auch das schon dokumentierte
`scripts/migrationsprobe.mjs` betraf.

### Dokumentation

**Drei Abläufe** in `CLAUDE.md` — eine Änderung machen, eine Version ausliefern, wann der
Spielstand neu geschrieben wird — je mit dem Punkt, an dem man sonst das Falsche tut. Der
wichtigste ist kontraintuitiv: *nicht* reflexhaft nach jeder Migration neu seeden. Eine
Migration über einen bestehenden Spielstand laufen zu lassen ist die einzige Gelegenheit,
ihr beim Wandern zuzusehen; ein frischer Seed entsteht direkt im Zielschema und hat nie
migriert. Wer sofort neu seedet, tauscht den Test gegen sein Ergebnis.

Dazu die Fallen des Update-Wegs, alle gemessen und nicht vermutet: die Signatur-Variable
heisst `TAURI_SIGNING_PRIVATE_KEY` und nicht `…_PATH`; ein `http`-Endpunkt lässt die App
gar nicht erst starten (Tauri prüft das Schema beim Initialisieren des Plugins und panict);
`releases/latest/` überspringt Vorabversionen, weshalb „prerelease" bei einer Alpha den
Endpunkt tot macht.

## [0.19.0] — 2026-08-24

Die Runde, in der ein Budget eine Geschichte bekommt: was in einem bestimmten Monat galt,
was darin abfloss — und wie sich der Rahmen über die Zeit verändert hat.

### Hinzugefügt

**Der Verlauf je Budget.** Ein Klick auf eine Zeile der Budgetliste klappt daneben eine
Karte auf: zwölf Monate als Balken, je Monat hell, was verfügbar war, und massiv, was davon
abfloss. Ein Klick auf einen Balken — oder die Monatsauswahl darüber — zeigt darunter die
Buchungen genau dieses Monats. Die Karte liegt NEBEN der Liste, nicht darin; die Liste
steckt schon in einer.

Dahinter steht `core/budgets/budgetverlauf` mit `budgetFortschreibung`, `budgetMonatsstand`
und `verlaufsfenster`. Das ist keine zweite Rechnung neben `budgetStand`, sondern dessen
Zerlegung:

    verfuegbar − verbrauchtImMonat
      = (rahmenKumuliert − verbrauchtBisher) − (verbrauchtKumuliert − verbrauchtBisher)
      = rest

Der Rest bleibt also überall derselbe; was sich ändert, sind die beiden Zahlen daneben.
Genau das ist festgehalten — Monat für Monat, für beide Budgetarten, bei einem Start mitten
im Monat, bei einem Fenster, das erst mitten in der Historie beginnt, und über einen Wechsel
des Betrags hinweg.

**Monate vor der ersten Planung stehen trotzdem im Verlauf**, ohne Rahmen und ausdrücklich
als „kein Budget in diesem Monat". Was ausgegeben wurde, ist eine Tatsache; ohne Rahmen ist
es aber keine Überziehung und wird auch nicht als eine gezeichnet. Nur das aufbauende Budget
bleibt an seinem Start begrenzt — sein Verbrauch davor zählt auch für `budgetStand` nicht.

**`-- @wennSpalte x.y`** als Marker für Migrationen, eine Ebene unter `@wennTabelle`: das
Statement läuft nur, solange es die Spalte gibt. Ohne ihn scheitert der zweite Lauf einer
Migration, die eine später gedroppte Spalte liest, schon am Parser — SQLite prüft
Spaltennamen beim Parsen und nicht erst beim Ausführen.

### Geändert

**Der Betrag eines Budgets ist eine Reihe, kein Wert.** Bisher stand er als Spalte am
Budget, und wer ihn anhob, schrieb damit die Vergangenheit um: rückwirkend war jeder Monat
mit dem neuen Rahmen geplant, und wogegen damals gemessen wurde, war nicht mehr feststellbar.
Bei einem aufbauenden Budget rechnete es zusätzlich den ganzen Sockel neu, weil dessen
Rahmen Rate × Monate war.

`budget_betrag` hält jetzt je Budget die Beträge mit dem Monat, ab dem sie gelten. MONAT und
nicht Datum: ein Budget ist eine Monatsgrösse, ein Wechsel mitten im Monat müsste anteilig
gerechnet werden, und dafür gibt es keinen fachlichen Grund. Versioniert wird nur der
BETRAG — Art, Konto und Kategorie bleiben Eigenschaften des Budgets.

Der Kern fragt überall `betragImMonat` statt eines Feldes; vor der ersten Version ist der
Rahmen 0 und nicht der erste Betrag, denn da war nichts geplant. `budgetRahmen` summiert
beim Aufbauenden entsprechend über die Monate, statt zu multiplizieren.

Gespeichert wird ab dem laufenden Monat. Korrigieren und Rückdatieren gehen über die
Versionsliste im Dialog: jede Version einzeln änderbar und löschbar, nur die letzte nicht —
ein Budget ohne Betrag wäre eine Kategorie mit einem Etikett.

**Der Monat statt der Summe seit Start.** Ein aufbauendes Budget zeigte „Rest von Rahmen",
und der Rahmen war die Rate mal die Monate seit Start: der Betrag, der hineingegangen wäre,
hätte man nie etwas ausgegeben. Er wächst jeden Monat weiter und sagt über den laufenden
nichts. An seiner Stelle steht die Fortschreibung — Übertrag aus dem Vormonat, Rate dieses
Monats, Verbrauch dieses Monats. Das gilt in der Budgetliste („verfügbar", „verbraucht")
ebenso wie in der aufgeklappten Buchungsliste der Übersicht: zwei Zeitbegriffe in einer
Zeile wären genau der Widerspruch, an dem die Budgetrechnung hier schon einmal gescheitert
ist.

**Ein Wechsel des Rahmens ist im Verlauf zu sehen.** Der helle Balken springt am
Wechselmonat von selbst; dazu kommen eine Marke an der Stelle und der vorherige Betrag in
der Monatszeile, sonst liest sich die Stufe wie ein Rechenfehler.

**Die ganze Zeile öffnet den Verlauf**, nicht nur der Name. Die Spalte ist breiter als das
Wort, und ein Klick daneben ging ins Leere; der Name bleibt als sichtbarer Hinweis, dass es
die Geste gibt. Beim Aufklappen wird die Karte herangeholt — sie steht unter der ganzen
Liste, und mit Vorschlägen, Erklärtext und Kennzahlen darüber lag sie ausserhalb des
Sichtbaren.

**`BudgetPostenliste` und `BudgetFortschreibung` liegen in `bausteine/`**, weil sie jetzt
zwei Bereiche bedienen.

### Schema

- **neu `budget_betrag`** (`budget_id`, `ab_monat`, `betrag`) — die Reihe der Beträge je
  Budget, Fremdschlüssel mit CASCADE. Die Migration übernimmt den bisherigen Wert als erste
  Version, gültig ab dem Startmonat des Budgets.
- **entfällt `budget.betrag_pro_monat`** — aufgegangen in der Reihe.

## [0.18.0] — 2026-08-23

Die Runde, in der das Schema aufgeräumt wird — und in der die App anfängt, sich zu merken,
was mit einer Buchung geschehen ist.

### Geändert

**Der Beleg und was wir daraus gemacht haben, stehen getrennt.** `umsatz` trug dreierlei
in einer Zeile: die Rohdaten, wie die Quelle sie lieferte; die Zuordnung; und den Zustand
unserer Verarbeitung. Das erste darf sich nie ändern, das letzte ändert sich bei jeder
Durchsicht — in einer Tabelle trennt das nur Disziplin, und Disziplin hält keinen Randfall
aus. Es sind jetzt `umsatz_roh` und `umsatz_verarbeitung`.

Nicht die Kardinalität trennt hier: 1:1 gehörte nach Lehrbuch in eine Tabelle. Es ist der
Lebenszyklus. Die Probe darauf ist „auf den Stand der Quelle zurückgehen" — das wird ein
`DELETE` auf einer Tabelle, und die Rohzeile merkt nichts davon.

Nach oben bleibt es EIN `Umsatz`. Sichtbar wird die Trennung nur an den Schreibwegen, und
das ist der eigentliche Gewinn: `anlegen` schreibt beides, `speichern` nur den Stand,
`ergaenzen` als einzige noch Rohdaten — und dort nur Fehlendes. Vorher konnte eine blosse
Statusänderung unbemerkt Rohfelder mitziehen.

**Die Kontozuordnung gehört nicht zum Beleg.** Die Quelle liefert eine IBAN — das ist
Beleg. Welches unserer Konten gemeint ist, ist unsere Zuordnung, und der Verbuchen-Dialog
lässt sie ändern. Was der Mensch korrigieren darf, ist kein Beleg.

**Die Vertragszuordnung steht an der Buchung.** `vertrag_zuordnung` hielt eine N:1-Beziehung
in einer Tabelle mit `istbuchung_id` als Primärschlüssel, also 1:1 zur Buchung — nach
Kardinalität gehört das als Spalte dorthin, wie `kategorie_id` daneben. Der Anlass war
handfest: es standen Zuordnungen zu Buchungen da, die es nicht mehr gab.

Die subtile Stelle dabei: in der alten Tabelle trug die blosse EXISTENZ der Zeile die
Aussage „hier wurde entschieden". Als Spalte wäre `vertrag_id IS NULL` zweideutig — „noch
nie zugeordnet" gegen „gehört ausdrücklich zu keinem Vertrag". Das trägt jetzt
`vertrag_herkunft`; ohne die Unterscheidung käme ein von Hand korrigierter Fehlgriff der
Automatik beim nächsten Abgleich zurück.

**Das ganze Schema hat Fremdschlüssel.** Bis hierher war jede Verbindung zwischen zwei
Tabellen eine blosse Textspalte mit einer ID darin, und drei Sorten Widerspruch hatten sich
darüber angesammelt — verbuchte Umsätze ohne Buchung, Zuordnungen zu gelöschten Buchungen,
Verweise auf gelöschte Kategorien. Alle drei waren messbar, keine Theorie.

Die Löschregeln sind fachliche Entscheidungen und keine Formsache: CASCADE, wo das
Angehängte ohne sein Gegenstück gegenstandslos ist (Aufteilungen einer Buchung, Werte eines
Depots); SET NULL, wo der Verweis wegfällt, die Zeile aber richtig bleibt (eine gelöschte
Kategorie macht eine Zahlungsregel nicht falsch, nur uneingeordnet); RESTRICT, wo ein
Löschen ein Fehler wäre (ein Konto mit Buchungen darf nicht verschwinden).

### Hinzugefügt

**Änderungen an Buchungen stehen im Journal.** Der Beleg war geschützt, die BUCHUNG nie:
jede Änderung überschrieb still, jedes Löschen löschte wirklich, und was vorher dastand,
war danach nicht mehr feststellbar — auch nicht für den, der es selbst geändert hat. Das
ist der Kern dessen, was die GoBD Unveränderbarkeit nennen, und die einzige ihrer
Forderungen, an der diese App wirklich vorbeilief.

`buchung_journal` hält jedes Anlegen, Ändern und Löschen fest, mit dem GANZEN Zustand
vorher und nachher. Es trägt bewusst KEINEN Fremdschlüssel auf die Buchung: es muss die
Löschung überleben, sonst protokolliert es genau den Fall nicht, für den es da ist.

Wie weit die App den GoBD folgt und was bewusst offen bleibt — Storno statt Löschen, wer
etwas geändert hat, Fälschungssicherheit —, steht jetzt in der `CLAUDE.md`.

**Mehrere Statements laufen atomar.** `tauri-plugin-sql` führt jedes Statement über den
Verbindungs-Pool aus und bekommt dabei irgendeine Verbindung; ein `BEGIN` landete damit auf
der einen, die Schreibvorgänge auf anderen. Über das Plugin war eine Transaktion also nicht
möglich — auch zur Laufzeit nicht, nicht nur in Migrationen. Ein eigener Command hält jetzt
eine Verbindung fest.

Sichtbar wird das an einer Stelle sofort: das Ledger schrieb die Buchung, löschte dann alle
Aufteilungen und legte sie neu an. Brach es dazwischen ab, stand die Buchung ohne ihre Teile
da, und Σ Teile ≠ Betrag — eine Invariante, die der Kern voraussetzt.

**Ein zweiter Abrufweg neben FinTS.** Für ein Institut, das kein FinTS anbietet, liegt eine
eingebettete Bibliothek bei, hinter einem Experimente-Schalter.

**Die Bank liefert drei Angaben mehr.** Der Fork von `lib-fints` liest jetzt die IBAN des
Gegenkontos auch aus MT940 (Unterfeld `?38`), den SEPA-Verwendungszweckcode und den
Empfänger hinter einem Zahlungsdienstleister.

Die IBAN ist der greifbarste Gewinn: bisher trug `remoteAccountNumber` je nach Format die
IBAN ODER die nationale Kontonummer, und über MT940 kam deshalb nie eine Gegen-IBAN an.
Der Zweckcode (`SALA`, `RENT`) ist eine Einordnung, die die Bank schon vorgenommen hat —
anders als die Umsatzart kein Vokabular, das je Institut anders aussieht. Und der
Endempfänger steht NEBEN der Gegenpartei: dort bleibt der Dienstleister, und der ist bei
jedem Händler derselbe.

**Ein Werkzeug, das Migrationen gegen echte Daten fährt.** `npm test` prüft sie gegen
sql.js — und das hat Fremdschlüssel standardmässig AUS, während sie in der App AN sind.
Eine Migration kann deshalb grün sein und in der App scheitern oder still Daten löschen.
Genau das ist beim Umbau passiert; gefunden hat es eine Probe gegen eine Lesekopie.

### Behoben

**Die Verwaltung war stumm.** Von den Tabellen der App waren zwei klickbar, und in der
ganzen Verwaltung ging nichts — obwohl genau dort die Wege liegen, die man gehen will.
Jetzt führt der Bezeichner weiter: unter der Kontentabelle klappen die eingelesenen Zeilen
auf, unter einem Bankzugang seine Konten und darunter seine Importe.

Der Link sitzt im Bezeichner und nicht auf der Zeile. `DataTable` kann die ganze Zeile
klickbar machen, und das sieht man ihr nicht an — der Cursor wechselt, sonst nichts. Wer
eine Tabelle vor sich hat, probiert nicht jede Zeile durch.

**Die Importliste eines Bankzugangs war leer, obwohl abgerufen wurde.** Die Spalte, die den
Zugang am Lauf festhält, kam erst später dazu; alle Abrufe davor haben sie leer und fielen
damit aus der Liste. Das ist die schlechteste Art zu irren, weil sie aussieht wie eine
Auskunft. Nachgetragen wird über die Zeilen des Laufs und, für die Läufe ohne Zeilen, über
den Dateinamen — beide Wege prüfen auf Eindeutigkeit.

**Eine Erstattung wurde beim Einsortieren zur Ausgabe.** Sie kam als Zufluss herein, wurde
in die Kategorie gelegt, in der die Ausgabe stattgefunden hatte — dort gehört sie hin, damit
sie das Budget entlastet —, und belastete es danach ein zweites Mal. Die Ursache: das
Vorzeichen wurde beim Bearbeiten aus dem CHARAKTER neu gebildet, und die Kategorie gibt
„Aufwand" vor.

Das Betragsfeld ist bei Online-Konten gesperrt. Es hat also niemand etwas eingegeben, das
sich hätte ändern dürfen. Die Regel lautet jetzt: bei einer von Hand erfassten Buchung folgt
das Vorzeichen dem Charakter, bei einer importierten kommt die Richtung vom Beleg. Die Bank
hat gebucht, wohin das Geld floss — das ist eine Tatsache, und eine Einordnung dreht keine
Tatsache um.

### Entfernt

- **Das Register „Herkunft"** in der Verwaltung. Es stellte dieselbe Frage ein zweites Mal,
  seit die Kontentabelle selbst aufklappt.
- **Der gespeicherte Dublettenverdacht.** Er wurde beim Import geschrieben und von keiner
  Anzeige gelesen — sämtliche Dublettenanzeigen rechnen ihn beim Hinsehen, und das aus
  gutem Grund: ein angeschriebener Verdacht gilt für den Stand von damals.
- **`umsatz_roh.format`.** Eine Zeile gehört zu genau einem Lauf, und der Lauf trägt das
  Format bereits.

## [0.17.0] — 2026-08-21

Die Runde, in der der Bankabruf erwachsen wird — und in der die App zum ersten Mal etwas
kennt, das kein Zahlungskonto ist.

### Geändert

**FinTS läuft gegen einen Fork von `lib-fints`.** Die bisherige Leitentscheidung lautete
„kein Patch, kein Fork"; sie gilt so nicht mehr. `package.json` zeigt auf
`Superheld/lib-fints#workshop`, und die vier Änderungen dort sind upstream als Pull Request
angeboten — es geht also nicht darum, die Bibliothek zu umgehen, sondern darum, nicht auf
sie warten zu müssen. Sobald sie in einem npm-Stand sind, geht die Abhängigkeit zurück auf
die Version; der Code hier muss sich dafür nicht ändern.

Zwei der vier Änderungen wirken sofort:

- **Konten werden über das Konto adressiert, nicht über die Kontonummer.** Die
  Bibliothek nahm bei einer geteilten Nummer still das erste passende Konto — bei einem
  Institut, das Girokonto und Depot unter derselben Nummer führt, beantwortete ein Abruf
  damit die Frage für das falsche Konto. Dagegen stand hier eine Sperre, die dem zweiten
  Konto den Abruf ganz verwehrte. Die Sperre ist ersatzlos weg.
- **Die Kontoverbindung folgt den HISPAS-Parametern der Bank.** Damit geht CAMT bei
  Instituten durch, die es vorher mit `3010 Kontonummer ist ungültig` ablehnten; der
  Rückfall auf MT940 wird vom Regelfall zur Ausnahme.

**Ein Depot ist kein Konto.** Was die Bank als Depot meldet, liegt in eigenen Tabellen
(`depot`, `depotwert`, `depotposition`) und nicht im Kontenbestand. Der Grund ist keine
Ordnungsliebe: ein Zahlungskonto hat einen Anfangsbestand und Buchungen, aus denen sich
sein Stand ergibt — ändert er sich, ist etwas geflossen. Ein Depotwert ändert sich täglich,
ohne dass irgendetwas passiert wäre. Er ist eine Beobachtung zu einem Stichtag, und aus
Beobachtungen lässt sich weder eine Zahlung ableiten noch ein Budget belasten.

**Konten haben jetzt eine Klasse neben ihrem Typ.** Der Typ sagt, WAS ein Konto ist (Giro,
Tagesgeld, Depot), die Klasse, WOFÜR es da ist (verfügbar, Rücklage, Vorsorge). Daran hängt
genau eine Rechnung: nur „verfügbar" zählt zu den liquiden Mitteln. Beides deckt sich
nicht — dasselbe Tagesgeldkonto kann Alltagsreserve oder zweckgebundene Rücklage sein, ohne
dass sich sein Typ ändert. Die drei Klassen sind ein Anfang, kein fertiges Modell; was
Rücklage und Vorsorge außer dem Namen trennen soll, ist offen.

### Hinzugefügt

**Das Bankfähigkeitsprofil.** Jede Bank meldet in jedem Dialog mit, was sie kann: wie weit
sie Umsätze vorhält, welche Formate sie kennt, welche Vorgänge sie je Konto freigibt, welche
TAN-Verfahren es gibt. Davon wurde bisher ein einziger Wert gelesen und der Rest mit der
Sitzung verworfen. Jetzt steht das Profil am Zugang und ist ohne Anmeldung einsehbar — die
Frage „warum holt der Abruf nur 30 Tage" kostet damit nicht mehr die PIN.

Drei Dinge hängen daran: der **Erstabruf** holt, was die Bank vorhält, statt fester 30 Tage;
ein zu großer Zeitraum wird **gedeckelt und gemeldet**, statt still weniger zu liefern; und
das **TAN-Verfahren ist wählbar**, wo eine Bank mehrere anbietet.

**Depots, vollständig.** Der Abruf holt jede Depotaufstellung mit, die die Bank freigibt.
Die Übersicht zeigt den Stand mit Stichtag und die Positionen, die Analyse den Wertverlauf
über den gewählten Zeitraum, und im Kontobereich bekommt ein Depot den Bestand statt einer
Auszugsliste, die dort dauerhaft leer stünde. Ausdrücklich eine reine Wertbetrachtung und
keine Rendite: Zukäufe und Entnahmen stecken mit drin und sind aus den Beständen allein
nicht herauszurechnen.

**Ein freier Abrufzeitraum.** Die festen Stufen decken die üblichen Fälle ab, aber nicht
den, um den es beim Ersetzen eines Dateibestands geht — dessen Zeitraum ist eine beliebige
Zahl. Daneben steht, wie weit die gewählte Bank überhaupt zurückreicht.

**Der `lib-fints`-Skill liegt im Repo** (`.claude/skills/lib-fints/`) statt nur im
Benutzerverzeichnis. Er beschreibt beide Stände der Bibliothek, weil zwei der dort
genannten Fallen nur für den npm-Release gelten.

### Behoben

**TAN mit Enter bestätigen.** Beim Abtippen liegt die Hand auf der Tastatur; zur Maus zu
greifen war genau dort der unnötigste Weg.

**Das getragene Umsatzformat wird gelesen, nicht nur gemerkt.** Wo der Rückfall auf MT940
dauerhaft nötig ist, kostete jeder Abruf eine ergebnislose Bankrunde. Das gemerkte Format
entscheidet jetzt die Reihenfolge der beiden Versuche — und nur die: der zweite Versuch
bleibt in beiden Richtungen, damit ein Institut, das CAMT nachrüstet, von selbst wieder
darauf kommt.

## [0.16.0] — 2026-08-20

Eine Aufräumrunde ohne neue Funktion: das Repo ist so sortiert, dass man beim Draufschauen
sieht, worum es geht, und die Regeln stehen dort, wo man sie beim Schreiben liest. Nach
außen ändert sich nichts — die App kann danach genau dasselbe wie vorher.

### Geändert

**Alle drei Schichten nach Fachbereichen sortiert.** Vorher lagen `adapters/ui/` mit 39
Dateien, `application/` mit 37 und `core/` mit 24 flach nebeneinander; die Zugehörigkeit
stand nur im Dateinamen-Präfix, was ein handgemachter Ersatz für den Ordner ist, der fehlt.
Jetzt bleibt die Schicht oben — die Architektur ist damit am Verzeichnisnamen ablesbar,
ohne dass man dafür Dokumentation gelesen haben muss —, und darunter kommt der Bereich, mit
denselben Namen über Kern, Anwendung und Oberfläche. Die Zuordnung ist gemessen, nicht
geschätzt: was zwei oder mehr Bereiche benutzen, ist ein Baustein; was einer benutzt, gehört
in dessen Ordner. `core/` bekam dabei einen anderen Schnitt als die äußeren Schichten, weil
es nach Abstraktion geschichtet war und nicht nach Fachlichkeit — die Primitive (Geld,
Datum, Währung, Zahlungsregel, Muster, Fehler, Region) liegen in `basis/`.

**Die Regeln stehen je Schicht.** Eine `CLAUDE.md` in einem Unterverzeichnis lädt erst, wenn
dort gearbeitet wird. Aus einer Datei mit 342 Zeilen sind sechs geworden: Kern, Anwendung,
Persistenz, Oberfläche und geteilte Bausteine tragen ihre eigenen; oben bleibt die
Orientierung und das, was überall gilt. Jede Regel steht an genau einer Stelle.

**`ds/` ist in `bausteine/` aufgegangen.** Das Design-System ist eine Vorlage, keine Vorgabe
— die Trennung in „kopiert, nicht anfassen" und „eigenes" kostete ein Verzeichnis und
erzeugte eine Doktrin, die so nicht gilt. Was bleibt, sind die zwei Fallen, die man kennen
muss: `DataTable` ist hier die App-Fassung, und der `Input` des Systems kann kein `onChange`.

**`src/test/` heißt `src/testwerkzeug/`.** Dort lagen nie Tests, sondern Harness, Setup und
Fixture-Bau; alle Testdateien liegen neben ihrem Code.

**Die README richtet sich an Besucher** statt an Werkzeuge: die Idee der App, die
Entscheidungen dahinter und was bewusst fehlt. Architektur und Arbeitsregeln stehen in den
`CLAUDE.md`-Dateien, `ARCHITEKTUR.md` ist darin aufgegangen. Maschinenspezifische Rezepte
(Pfade, `sqlite3`-Aufrufe, Cache-Verzeichnisse) liegen in `CLAUDE.local.md` außerhalb des
Repos.

### Hinzugefügt

**Ein Wächter über die Doku-Verweise** (`src/doku.test.ts`): jeder Pfad, den eine
versionierte Markdown-Datei nennt, muss selbst versioniert sein. Nicht „existiert im
Arbeitsbaum" — genau das war die Täuschung, an der schon zweimal ein Verweis zerbrochen ist:
für den, der das Verzeichnis lokal hat, stimmt der Satz, für einen frischen Klon führt er
ins Leere.

**Tests für Bedienpfade, die nie ausgeführt wurden:** dass „Gegenstand bearbeiten" keinen
zweiten anlegt, dass „ersetzt" den Rücklagen-Zyklus neu startet, dass eine Aufteilung den
Betrag der Buchung genau treffen muss, und dass der Saldo-Verlauf auch bei einer einzigen
Stützstelle oder konstantem Wert etwas Sinnvolles zeichnet statt durch null zu teilen.

### Behoben

- **Ein veralteter Kommentar im Testharness** behauptete, die Screens sprächen direkt mit
  den SQLite-Repositories — die Regel, die in 0.15.0 abgeschafft wurde.
- **Drei tote Verweise in Code-Kommentaren** auf Dateien, die es nicht mehr gibt.

## [0.15.0] — 2026-08-20

Eine Bankzeile geht jetzt ohne Zwischenstopp ins Konto. Damit fällt die Warteliste weg,
in der man sie vorher abnicken musste — und mit ihr die Stelle, an der eine Dublette
hängen blieb. Die Frage „steht das schon drin?" ist deshalb dorthin gewandert, wo beide
Zeilen nebeneinander stehen: in den Kontoauszug. Dazu kommt die Gegenfrage, die vorher
niemand beantworten konnte: *fehlt* etwas, und seit wann.

Innen liegt die größere Änderung. Die Oberfläche kennt seit dieser Runde nur noch die
Anwendungsschicht, und ein Test hält das fest.

### Hinzugefügt

**Kontostands-Anker.** Was an einem Stichtag wirklich auf dem Konto lag — von der Bank
gemeldet oder von Hand gezählt (Kassensturz, auch fürs Bargeld). Ein Anker ist eine
**Beobachtung, kein Rechenergebnis**: er wird nie ungültig und nie neu berechnet, auch
nicht, wenn später eine Buchung davor eingefügt wird. Was sich ändert, ist die Differenz,
und genau die will man sehen. Anker werden aufgehoben statt überschrieben — erst mehrere
sagen, in welchem ZEITRAUM eine Lücke entstand. `abweichungsfenster` rechnet Anker gegen
Anker und kommt dabei ohne den Anfangsbestand aus: der ist selbst nur geschätzt (er
überbrückt die Zeit vor dem ersten Import), und ein falscher verschiebt jede Abweichung um
denselben Betrag, ohne die Differenz zwischen zwei Ankern anzutasten. Aus „irgendwo in
Tausenden Buchungen mehrerer Jahre fehlt etwas" wird damit ein Zeitraum von wenigen Wochen.

**Anfangsbestand abgleichen** — einmalig, mit Vorschau und auf Zuruf. Die Differenz
wandert dorthin, wo sie hingehört, solange der Anfangsbestand nur die fehlende
Vorgeschichte überbrückt. Ausdrücklich **nicht** still bei jeder Anzeige: danach wäre jede
neue Abweichung unsichtbar, und das ist der Detektor, den man gerade scharfgestellt hat.

**Dubletten im Kontoauszug.** Beide Zeilen tragen die Markierung — es gibt kein Original.
Gründe im Klartext, ein Sprung zum Gegenstück, ein Filter „könnten doppelt sein", und
„kein Duplikat" für den Fall, dass der Finder danebenlag. Festgehalten wird das PAAR, denn
dass A nicht dasselbe ist wie B, sagt nichts über A und C. Geprüft wird beim Hinsehen, nicht
einmalig beim Import: ein Verdacht vom Importtag gälte für den Stand von damals. Gewertet
wird nur über Lauf-Grenzen hinweg — am echten Bestand lag die Mehrheit aller Paare im
selben Lauf und war durchweg echte Mehrfachzahlung.

**Massenbearbeitung im Register.** Kategorie oder Bezeichnung für dreißig Zeilen auf
einmal, Löschen mit zweiter Frage. Die Kästchenspalte erscheint erst, wenn man sie
einschaltet — eine dauerhafte macht aus einer Leseansicht ein Formular.

**Budgets: zwei Arten statt dreier, in EINEM Aggregat.** Vorher drei Arten in zwei
Tabellen (`budget` mit Periode, `topf` als Puffer und als Spartopf). Alle drei beantworten
dieselbe Frage — was lege ich monatlich für X zurück? — und unterscheiden sich nur darin,
ob der Rest zum Monatsersten verfällt. Übrig bleibt `art` = monatlich | aufbauend und
genau eine Zahl. Neu ist die Verschachtelung (Freizeit monatlich, darin Urlaub aufbauend;
das Enkelbudget hängt am nächsten Dach) und die Konto-Bindung für aufbauende Budgets.

**Übersicht und Analyse getrennt.** Die Übersicht beantwortet „wie stehe ich gerade da?" —
drei Monatskarten, darunter die Budgets dieses Monats mit ihrem Rest, umschaltbar auf
vergangene Monate. Alles, was einen ZEITRAUM auswertet, steht jetzt unter Analyse. Die
Monatskarten zeigen Einzelposten statt Summen, Budgets lassen sich aufklappen, und jede
Spalte sagt getrennt, was geplant und was tatsächlich übrig ist.

**Ein ausführbarer Architektur-Test** (`src/architektur.test.ts`, läuft in der CI): `core`
importiert nichts nach außen, `application` kennt nur `core`, und die UI fasst weder
`core/` noch `adapters/persistence/` an. Seine Ausnahmeliste ist leer, und ein eigener
Test schlägt fehl, sobald ein Eintrag darin nichts mehr verletzt — damit kann sie nicht
verrotten.

### Geändert

- **Die Oberfläche kennt nur noch die Anwendungsschicht.** Die Regel galt lange nur fürs
  Schreiben: 22 Schreibzugriffe liefen über Use-Cases, aber 144 LESEzugriffe gingen direkt
  ans Repository. Leseregeln hatten damit keine Heimat — „welche Buchung zählt gegen ein
  Budget" war an drei Stellen erfunden und an der vierten vergessen. Alle 27 Screens sind
  migriert; Vokabular reicht `application/index.ts` durch, alles, was AUSWÄHLT oder
  RECHNET, liegt hinter einem Use-Case, und die Verdrahtung steht in `adapters/dienste.ts`
  statt in hundert Repository-Importen quer durch die Screens.
- **Der Bankabruf bucht direkt.** Was die Bank meldet, IST passiert — daran gab es nichts
  zu bestätigen, und der Schritt bestand in der Praxis nur aus Klicken. Seit dieser Runde
  gilt das auch für Verdachtsfälle: sie stehen im Auszug, mit allem Zusammenhang.
- **Die Import-Inbox ist die einzige Vorstufe** und gehört dem Dateiimport. Eine Datei ist
  kein Kontoauszug: sie kann alt sein, überlappen oder aus einer anderen App stammen. Sie
  zeigt jetzt den Dublettenverdacht an der Zeile, lässt den vollen Buchungsdialog zu jedem
  Entwurf öffnen und hat einen Weggelegt-Bereich mit Rückweg.
- **Löschen hängt an der HERKUNFT, nicht am Konto.** Vorher war alles auf einem Konto mit
  Bankverbindung tabu, auch das, was per Datei dorthin kam — die Bank kennt diese Zeilen
  gar nicht und holt sie nicht zurück.
- **Nicht jeder Vertrag ist ein Abo.** Arbeitsvertrag, Mietvertrag, Kindergeld:
  wiederkehrende Zahlungen mit Fristen, aber niemand sucht dort die nächste Gelegenheit
  auszusteigen. Neue `art` am Vertrag; die Kündigungswarnung gilt nur noch Abos.
- **Ein Ton für Geld, Icons für Zeilenaktionen.** Plus grün, Minus `--warn-deep`, Null
  neutral — an einer Stelle (`geldFarbe.ts`) statt in jedem Screen. Zeilenaktionen sind
  Icons, deren Text in `title`/`aria-label` wandert, statt zu verschwinden.
- **Die Kontotabelle ist entschlackt**, Suche greift auch über Beträge, das Jahr steht im
  Register, und der Kontokopf sagt, woraus der Stand entsteht.
- **CLAUDE.md hält nur noch Systemdesign** — was wir bauen, wo es liegt, nach welchen
  Regeln. Vorfälle und Datenstände stehen außerhalb des Repos.

### Behoben

- **Vertragsraten zählten gegen ihr Budget.** Auf der Übersicht stand dasselbe Budget
  oben ohne Verbrauch und darunter weit über seinem Rahmen — beides aus denselben Daten.
  Die Regel steckte nicht in der Funktion, sondern in der Liste, die der Aufrufer übergab. `budgetVerbrauch`/`budgetBuchungen`/`budgetStand` nehmen jetzt eine
  `BudgetSicht` mit Pflichtfeld `vertragsBuchungen`; der Compiler hat alle Aufrufer
  gefunden.
- **Verwaiste Umsätze.** Wer eine Buchung über die Sammelbearbeitung entfernte, ließ ihren
  Umsatz auf „verbucht" stehen, mit einer Buchungs-ID, die ins Leere zeigte — am echten
  Bestand ein paar Dutzend Zeilen, die dadurch weiter als Dublette angemahnt wurden. Use-Case repariert,
  Bestand über Migration 33 aufgeräumt.
- **Der Dublettenfilter blieb hängen**, wenn der letzte Verdacht erledigt war: der Knopf
  verschwand, der Filter nicht, und die Tabelle stand leer da. Der Erfolg sah aus wie ein
  Datenverlust.
- **Der Buchungsdialog rechnete Dubletten anders als der Auszug** — gegen einen anderen
  Bestand, ohne zu prüfen, ob es das Gegenstück noch gibt. Beide Rechenwege liegen jetzt
  in `application/dubletten/dublettensicht.ts`, mit der Begründung, warum es genau zwei Fragen gibt.
- **Der Abruf hängte frisch gebuchte Zeilen nicht an ihre Verträge** — bis jemand zufällig
  einen Verträge-Screen öffnete, zählte jede Vertragsrate gegen ihr Budget.

### Entfernt

- **Die Warteliste am Konto** samt Spalte „Neu" und dem Block „Neu von der Bank".
- **`bank_saldo` an der Kontozuordnung** — der gemeldete Stand ist jetzt ein Anker
  (Migrationen 35/36, in getrennten Versionen, weil die eine liest, was die andere abräumt).
- **`core/bankAbweichung`** — sie verglich den gemeldeten Stand gegen ALLE Buchungen;
  mit einer Anker-Historie wäre das ein systematischer Fehler.
- **Töpfe, Szenarien und die Deckungsrechnung** — aufgegangen in den Budgets bzw. im
  Monatsausblick.

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
Mandatsreferenz, Zweck-Präfix und Gegenpartei. Am echten Bestand gemessen: die grosse Mehrheit
identisch, eine Handvoll zur Bestätigung vorgelegt, einzelne wirklich neu; ein Reimport
derselben Datei erkennt jede Zeile wieder, in wenigen Millisekunden. Wird eine Zeile wiedererkannt, entsteht keine zweite —
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
  Näherung in „woran lag es" (NORDHOFF → Lebensmittel: `emp=nordhoff` +2.30, `vwz:nordhoff`
  +2.19). Am echten Bestand **89,1 % im Mittel über fünf Splits** (bester Einzelsplit
  90,5 % — bewusst nicht als Kalibrierziel genommen), 137 ms über 3689 Beispiele.
  Determinismus über einen gesetzten Generator statt `Math.random`: zweimal „Training
  starten" muss dasselbe Modell ergeben.
- **Merkmalsextraktion** mit getrennten Namensräumen (`emp=` ganzer Empfänger, `emp:`
  seine Einzelwörter, `vwz:`, `gid:`, `vz:`), am echten Bestand kalibriert: angeklebte
  Nummern werden abgeschnitten statt das Wort wegzuwerfen (ohne das fielen `debitkarte`
  und der Bankname komplett aus dem Vokabular), Grenze bei drei
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
  andere wörtlich (ein Punkt in „Petrossen" ist ein Punkt).
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
  wird auf deren Kindern — im gesamten Bestand traf keine einzige Ist-Buchung ihre
  Budget-Kategorie direkt. `budgetVerbrauch` zählt jetzt den Unterbaum; die Kategorienliste ist Pflichtparameter,
  damit man sie nicht vergessen kann.
- **Doppelzählung beim Import.** Finanzguru liefert gesplittete Buchungen zweimal — als
  Original UND zerlegt in Teilbuchung/Restbetrag. In der echten Datei kam auf jedes
  Original gut ein Teil; ohne Fix wäre deren Summe doppelt in den Saldo gelaufen.
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
