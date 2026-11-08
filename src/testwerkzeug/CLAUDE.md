# Der Spielstand

Gilt für `npm run seed` und `src/testwerkzeug/seedDaten.ts`. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

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
