# Der Spielstand

Gilt für `npm run seed` und `src/testwerkzeug/seedDaten.ts`. Was überall gilt, steht in der `CLAUDE.md` des Projekts.

## Welche Daten wofür da sind

Es gibt vier Sorten erfundener Daten, und sie beantworten verschiedene Fragen. Wer einen
Fall ergänzen will, entscheidet zuerst, in welche er gehört.

| Daten | wo | wofür | wer sie benutzt |
|---|---|---|---|
| **Daten je Test** | im Test selbst, gegen eine frische sql.js-Datenbank (`harness.tsx`) | genau eine Regel prüfen, mit so wenig Daten wie nötig | `npm test` |
| **Der Spielstand** | `seedDaten.ts`, geschrieben von `npm run seed` | die App ansehen und durchspielen: jeder Bereich hat etwas zu zeigen | `npm run tauri dev`, `npm run vorschau`, `src/seed.test.ts` |
| **Bestände der Umstellungsprobe** | `src/umstellungsprobe.test.ts` (Bestand A und B) mit `src/umstellungsprobe.erwartet.json` | sichern, dass ein Umbau keinen vergangenen Monat ändert | `npm test` |
| **Alter Spielstand für eine Migrationsprobe** | wird je Probe aus einer älteren Fassung erzeugt, liegt nicht im Repo | prüfen, dass neue Migrationen einen Bestand im alten Aufbau richtig umbauen (`scripts/migrationsprobe.mjs`, fährt `migrate()` über `migrationsprobe.ts`) | von Hand, vor einer Version mit Migrationen; dass die Probe migriert wie die App, sichert `migrationsprobe.test.ts` mit einem eigenen kleinen Bestand |

Zwei Regeln dazu:

- **Ein Test stützt sich nicht auf den Spielstand**, ausser `seed.test.ts` und der
  Umstellungsprobe. Der Spielstand wächst mit jedem Fall, der zum Ansehen dazukommt; ein
  Test, der an seinen Zahlen hängt, bricht dann ohne Grund.
- **Die Erwartungsdatei der Umstellungsprobe wird nie neu geschrieben**, auch nicht, wenn
  der Spielstand wächst. Neue Fälle im Spielstand bekommen eigene Ids und werden in
  `alterSpielstand()` wieder herausgenommen (Kopf von `ruecklagenFaelle` in
  `seedDaten.ts`). Beschreibt ein Fall eine Spalte, die eine spätere Migration nur
  anlegt (Migration 82: Kauf und Nutzungsdauer), trägt diese Migration sich in
  `NUR_SCHEMA_DANACH` ein — sonst liesse sich der Spielstand nicht in das ältere Schema
  einspielen. Eine Migration, die Daten umbaut, gehört dort nicht hin.

## Was der Spielstand zeigt

Die verbindliche Liste sind die Zusicherungen in `src/seed.test.ts`: jeder Fall, den der
Spielstand zeigen soll, hat dort einen Test, damit er nicht still verschwindet. Grob
gegliedert:

| Block in `seed.test.ts` | zeigt |
|---|---|
| „Spielstand" | jeden Bereich gefüllt: Konten jeder Klasse, Budgets, Verträge, Rücklagen, Belege aus mehreren Quellen, Dubletten, offene Buchungen, genug Material für ein Training |
| „Umbuchungsvertrag" | eine Sparregel mit gebuchten Beinen auf beiden Konten, ein stillgelegtes Konto mit Buchungen |
| „Vermoegen und Vorsorge" | Nettovermögen mit Verlauf, eine Schuld mit sinkender Restschuld, ein Vorsorgeziel mit Sparrate, Depots (Tabelle unten) |
| „Ruecklagen zum Durchspielen" | die Fälle des Rücklagen-Umbaus, Tabelle unten |

Die Rücklagen zum Durchspielen (Abschnitt `ruecklagenFaelle` in `seedDaten.ts`):

| Name im Spielstand | zeigt |
|---|---|
| „Anschaffungen" und „Sofa" an derselben Kategorie | Karte „Wartet auf Zuordnung", dazu eine zugeordnete Buchung und eine mit „keine Rücklage" |
| „Sommerreise" | abschließen, es bleibt etwas übrig |
| „Kamera" | abschließen im Minus |
| „Geschenke" | früher abgeschlossen und neu begonnen, „frei geworden" in Geschichte und Verlauf |
| „Familienfest" | beendet, steht nur noch in der Geschichte |
| „Instandhaltung" / „Beitraege" | läuft weiter, im Minus bzw. gut gefüllt |
| „Kuechenmaschine" | Altbestand ohne Kategorie, noch mit „ausgebucht" und verknüpfter Buchung |
| Konto „Tagesgeld 2" | reicht nicht für alle Rücklagen darauf, wird anteilig verteilt |
| Kategorien „Finanzen" / „Familie & Kinder" | Vorschlag im Bereich Rücklagen bzw. Budgets |
| Budget „Gesundheit" mit Rücklage „Behandlungen" darunter | ein Budget, das ohne die Rücklage auf seiner Unterkategorie zählt |
| „Fernseher" (an „Haushalt") | trägt eine Ausgabe unter „Freizeit & Hobby", die ihr ausdrücklich zugeordnet ist — das Budget dort zählt sie nicht; dazu Kauf und Nutzungsdauer lange vor ihrem Beginn: Wertverlust neben dem Stand, „fehlt", zweite Linie im Verlauf |

Die Depots im Bereich Vermögen (Abschnitt `depotFaelle` in `seedDaten.ts`, seit Migration 83):

| Name im Spielstand | zeigt |
|---|---|
| „Wertpapierdepot" mit „Konto Depotbank" | ein Depot, das zum Vorsorgeziel zählt, mit seinem Verrechnungskonto (Klasse Investment) darunter — in Vermögen und in der Liste der Vorsorge |
| „Zweitdepot" | ein Depot, das nicht zur Vorsorge zählt und kein Verrechnungskonto hat |

Den Fall „Verrechnungskonto zählt nicht mit" zeigt der Spielstand nicht; er entsteht, wenn
man dem „Konto Depotbank" eine andere Klasse gibt.

Wer einen Fall ergänzt, trägt ihn in `seedDaten.ts` ein, sichert ihn in `seed.test.ts` zu
und schreibt ihn in diese Tabelle.

## Wann der Spielstand neu geschrieben wird

`npm run seed` überschreibt ihn vollständig. Das ist billig und folgenlos — er ist
**Wegwerfware**, im Gegensatz zum echten Bestand.

**Der frische Spielstand ist unverschlüsselt, und sein Zugang wird mit abgeräumt.** Der
Seed schreibt über sql.js, kennt also kein SQLCipher; verschlüsselt wird die Datei erst,
wenn die App sie beim nächsten Start vorfindet und durch die Einrichtung führt. Die
Passphrase ist dabei frei wählbar (es ist der Spielstand), der Wiederherstellungscode
wird gewürfelt und einmal angezeigt.

Damit das überhaupt passiert, löscht das Skript die Schlüsselhülle `<name>.schluessel.json`
mit — und die Sicherungen dieses Spielstands, die mit dem alten Datenschlüssel geschrieben
sind und danach niemand mehr aufbekäme. **Ohne dieses Abräumen wäre der frische Spielstand
nicht zu öffnen:** `zugang_stand` meldet „eingerichtet", sobald eine Hülle daliegt, die App
verlangt dann eine Passphrase, packt den ALTEN Schlüssel aus und setzt ihn per `PRAGMA key`
auf eine Klartext-Datei. Die Meldung lautet „file is not a database" und sieht nach
kaputtem Bestand aus statt nach falschem Schlüssel.

Neu schreiben, wenn:

- ein **neuer Fall** dazugehört, den er noch nicht enthält (dann erst
  `src/testwerkzeug/seedDaten.ts` ergänzen, mit einer Zusicherung in `src/seed.test.ts`);
- man ihn **kaputtgespielt** hat und einen sauberen Stand will;
- `src/seed.test.ts` **rot** ist — dann passt er nicht mehr zum Schema, und das Ergänzen
  ist die eigentliche Arbeit, nicht das Neuschreiben.

**Der Punkt, an dem man sonst das Falsche tut — und er ist der wichtigste hier:** *nicht*
reflexhaft nach jeder Migration neu seeden. Eine Migration über einen **bestehenden**
Spielstand laufen zu lassen ist die einzige Gelegenheit, sie überhaupt beim Wandern
zuzusehen; ein frisch geschriebener Seed entsteht direkt im Zielschema und hat nie
migriert. Wer sofort neu seedet, tauscht den Test gegen sein Ergebnis. Also: erst die App
starten und die Migration über den alten Spielstand fahren lassen, **dann** neu seeden,
wenn man einen sauberen Stand braucht.
