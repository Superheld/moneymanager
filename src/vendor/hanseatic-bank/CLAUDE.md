# `vendor/hanseatic-bank` — fremder Code im eigenen Baum

Liest Konten, Salden und Umsätze der Hanseatic Bank über dieselbe Schnittstelle, die
ihre Weboberfläche benutzt. **Nur lesend.** Herkunft ist ein eigenes Repository; dieser
Ordner ist eine Kopie, kein Fork mit Rückweg.

## Warum kopiert und nicht als Abhängigkeit

Das Herkunfts-Repository ist privat, und moneymanager ist öffentlich: eine Abhängigkeit
darauf würde `npm ci` in der CI zerreißen und jedem Fremden den Build nehmen — wegen
einer Funktion, die er ohnehin nicht benutzen kann. Die Alternativen wären eine
optionale Abhängigkeit oder eine gitignorierte Datei zur Laufzeit; beide kosten mehr
Umstand, als der Code hier gross ist.

Die Bibliothek ist bewusst **kein Produkt** — sie ist unfertig und für technikaffine
Leute brauchbar, nicht für jeden. Genau deshalb hängt sie hier hinter einem
Experimente-Schalter (`application/experimente.ts`) und nicht an der Oberfläche.

## Was hier ANDERS ist als im Herkunfts-Repository

Wer abgleicht, muss diese drei Punkte kennen — sonst überschreibt er sie beim nächsten
Mal wieder:

1. **Der Testrunner.** Dort `node:test` + `node:assert/strict`, hier Vitest. Unter Vitest
   laufen die Prüfungen zwar durch, aber es findet keine Suite und meldet die Datei als
   Fehler. Getauscht sind nur Importe und Assertions; die Fälle und ihre Werte sind
   Zeile für Zeile dieselben.
2. **Die Doku ist entschärft.** `docs/` trug Zahlen, die am echten Bestand gemessen
   waren — Reichweite der Historie, Zeilenzahlen einer Seite, Grösse eines Auszugs. Im
   privaten Herkunfts-Repository war das in Ordnung, hier nicht (siehe
   `../../../CLAUDE.md`, „Keine Zahlen aus dem Bestand in Prosa"). Zahlen, die die API
   beschreiben — Token-Laufzeiten, Abfragetakt, Formatlängen, Seitengrösse —, sind
   geblieben: sie tragen die Sache und altern nicht mit einem Konto.
3. **`src/cli/` fehlt.** Sie zieht `node:fs`, `node:os` und `process` und läuft im
   Webview nicht. Der Kern der Bibliothek ist frei davon — das ist der Grund, warum sie
   hier überhaupt funktioniert.

Ebenfalls nicht mitgekommen und niemals mitzunehmen: `captures/` (Mitschnitte mit
Passwörtern und echten Umsätzen), `.env`, `*.har`.

## Die Schichtgrenze

Dieser Ordner ist **Infrastruktur, kein Kern**. Er darf nichts aus `core/`,
`application/` oder `adapters/` importieren — er weiss nichts von diesem Projekt und
soll nichts davon wissen, sonst lässt er sich nicht mehr gegen seine Herkunft abgleichen.

Umgekehrt darf ihn **nur `adapters/` benutzen**, und dort genau eine Stelle: der
Adapter, der seine Datenformen in die Ports der Anwendung übersetzt. `core/`,
`application/` und die UI sehen ihn nie. Ausführbar geprüft in `src/architektur.test.ts`.

## Die Datenformen sind nicht unsere

Beim Übersetzen an der Adapter-Grenze zählt vor allem eins: **Beträge kommen als
Fliesskomma-Euro**, nicht als Integer Cent. Wer sie ungerechnet weiterreicht, bricht die
erste Regel dieses Projekts. Ebenso trägt `amount` das Vorzeichen bereits selbst — eine
zweite Ableitung über den Buchungsschlüssel wäre nicht nur überflüssig, sondern bei
jedem neuen Schlüssel der Bank stillschweigend falsch.

Was die Bank tatsächlich liefert, steht in `docs/bank-api.md`; was diese Bibliothek
daraus anbietet, in `docs/api.md`.

## Einrichtung

Die Anmeldung braucht neben Kennung und Passwort eine Client-Kennung, mit der sich die
Weboberfläche gegenüber der Bank ausweist. Sie ist **nicht** Teil dieses Codes und
gehört es auch nicht: jeder liest sie aus einem Mitschnitt der eigenen Anmeldung. Sie
ist Konfiguration, nie Konstante — dieselbe Regel wie bei der FinTS-Produkt-ID.
