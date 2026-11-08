---
name: exporte
description: "Die beiden Exporte des Moneymanager (Konfiguration und Bestand) und der Konfigurationsimport: was drin steht, was man weitergeben darf, wohin die Datei geschrieben wird, wie der Bestand als Importquelle zurückkommt. Laden bei Arbeit an export.ts, konfiguration.ts, konfigurationsimport.ts, bestandsexport.ts, bestandsAdapter.ts, export.rs oder den Exportkarten."
---

# Exporte

Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Zwei Exporte, zwei Zusicherungen (Experiment)

Seit 2026-08-30, beide hinter `experiment.export`, beide im selben Register
**Einstellungen → Export** — untereinander, damit man den Unterschied sieht:

| Datei | enthält | darf man weitergeben |
|---|---|---|
| `konfiguration-<kennung>-<tag>.json` | wie der Haushalt ORDNET: Kategorien mit Baum und Charakter | **ja** |
| `bestand-<kennung>-<tag>.json` | was in ihm PASSIERT ist: Buchungen samt Bankzeile, Konten, Verträge, Personen | **nein — das ist der Kontoauszug** |

**Die Trennung IST die Zusicherung, und sie hält nur, solange es zwei Dateien sind.** Eine
Ordnung lässt sich teilen, ein Kontoauszug nicht. Beide Seiten stehen als ausführbare
Zusicherung da und nicht nur als Kommentar: `konfiguration.test.ts` prüft, dass in der
einen kein Feld eine Buchung beschreibt, `bestandsexport.test.ts` prüft, dass in der
anderen genau das drinsteht. **Die beiden Tests zusammen sind die Grenze** — einer allein
wäre eine halbe Aussage, und wer die Exporte je zusammenlegen will, macht beide zugleich rot.

Der naheliegende Weg war ein Häkchen „Buchungen mitnehmen" an der vorhandenen Karte. Er
ist verworfen, und der Grund ist nicht Prinzipienreiterei: er erzeugte zwei Dateien, die
gleich heissen und gleich aussehen, und im Dateimanager — oder im Anhang einer Mail —
wüsste niemand mehr, welche er vor sich hat. **Der Dateiname ist die einzige Stelle, an
der man einer Exportdatei ihre Zusicherung von aussen ansieht.**

Vier Entscheidungen, die man kennen muss:

- **Ein eigenes Kommando, kein `<a download>`.** Im WKWebView landet ein Blob-Download je
  nach Fassung nirgends oder wortlos im Papierkorb-Verzeichnis des Webviews. Ein Export,
  von dem man nicht weiss, wo er liegt, ist keiner. Dieselbe Überlegung wie beim
  Datenbankzugang.
- **Das Ziel bestimmt NICHT der Aufrufer.** Seit 2026-09-22 der DOWNLOAD-Ordner (vorher
  `<App-Datenverzeichnis>/export/`), und der Name muss ein einfacher Dateiname sein —
  derselbe Filter wie bei der Datenbankdatei. Ein Webview, der irgendwohin schreiben darf,
  ist einer, der überall hinschreiben kann; das gilt unverändert, nur das Verzeichnis ist
  ein anderes. Der Ort davor war sicher und unauffindbar, und damit an der Aufgabe vorbei:
  eine Exportdatei ist dazu da, WEITERGEGEBEN zu werden — an ein Tabellenprogramm, an den
  nächsten Rechner, in den Anhang einer Mail. Ist kein Download-Ordner zu finden, bleibt
  der alte Pfad als Rückfall.
- **Der Pfad wird trotzdem angezeigt.** „Im Download-Ordner" ist eine Auskunft; der volle
  Name ist die, mit der man die Datei auch findet, wenn dort dreihundert andere liegen.
- **Der Dateiname trägt den Bestand** (`konfiguration-moneymanager-dev-<tag>.json`). Echter
  Bestand und Spielstand liegen in zwei Dateien, aber im SELBEN Datenverzeichnis — der
  Identifier trennt sie nicht. Ohne die Kennung überschriebe ein Export aus der
  installierten App den des Spielstands wortlos, und von aussen sähen beide gleich aus.
- **Eltern stehen vor ihren Kindern.** Wer die Liste von oben nach unten einliest, findet
  jede Elternkategorie bereits angelegt vor. Nach Namen sortiert müsste ein Importeur
  zweimal laufen.

**Den Import der ORDNUNG gibt es seit 2026-09-22** (`application/konfigurationsimport.ts`,
Karte `ui/einstellungen/KonfigurationImportCard.tsx`). Er stand lange als die schwierigere
Hälfte da — eingelesene Kategorien treffen auf vorhandene, IDs kollidieren, Bäume müssen
zusammengeführt werden —, und die Antwort besteht aus drei Entscheidungen:

- **Verglichen wird über den NAMEN**, nicht über die Id und nicht über den Pfad. Die Id
  einer fremden Datei sagt über diesen Bestand nichts. Der Pfad wäre genauer und ist
  trotzdem falsch: läge „Miete" hier unter „Fixkosten" und dort unter „Wohnen", entstünde
  eine ZWEITE Kategorie desselben Namens — und der Name ist die Angabe, über die sonst
  alles aufgelöst wird, von `standardkategorienAnlegen` bis zum Kategorievorschlag des
  Imports. Zwei gleichnamige Kategorien sind kein doppelter Eintrag, sondern eine
  mehrdeutige Auflösung.
- **Es wird nur ANGELEGT, nie geändert.** Was es unter dem Namen schon gibt, bleibt wie es
  ist — auch bei abweichendem Charakter. Eine Ordnung gehört dem, der sie eingerichtet
  hat; ein Import, der sie stillschweigend umschreibt, nimmt sie ihm weg. Abweichungen
  werden gezeigt.
- **Der Plan steht vor der Tat.** Erst ansehen, was passieren würde, dann ein zweiter
  Klick. Dieselbe Form wie beim Dateiimport — was eine fremde Datei mit dem Bestand macht,
  soll man vorher wissen.

Die Fassungen bleiben **getrennt**: sonst stiege die eine, weil sich an der anderen etwas
geändert hat, und `fassung` sagte nichts mehr. Eine NEUERE Fassung weist der Import ab,
statt sie zu raten — was ein Feld dort bedeutet, weiss diese App nicht.

### Was im Bestandsexport steht — und warum vollständig

Er ist gebaut, um den Bestand einmal herauszuholen, anzusehen, aufzuräumen und
**pseudonymisiert** weiterzuverwenden: als Vorlage für den Spielstand
(`testwerkzeug/seedDaten.ts`) und für das mitgelieferte Kategorisierungsmodell.

Bei einem Export, dessen Zweck Analyse ist, kostet ein weggelassenes Feld einen ganzen
Zyklus — man merkt es erst beim Auswerten. Deshalb kommt jedes Feld mit, das eine AUSSAGE
über die Zahlung trägt, `zweckCode` und `endempfaenger` eingeschlossen; draussen bleibt
nur, was reiner technischer Schlüssel ist (`rohHash`, `nativeId`). Der Beleg steht **am
Buchungssatz**, nicht in einem eigenen Abschnitt: für beide Zwecke ist genau die
Verbindung das Interessante, und zwei Listen mit einer ID dazwischen zwängen jeden Leser,
den Join nachzubauen, den `application/zahlungsspuren` längst kennt.

**Konten allein reichten nicht** — das war die erste Annahme, und sie ist an zwei Stellen
zu kurz: ein Konto zeigt über `inhaberIds` auf Personen, eine Buchung zusätzlich über
`vertrag_id` auf einen Vertrag. Deshalb sind es vier Abschnitte und nicht zwei.
`bestandsexport.test.ts` hält das fest, indem es jeden Verweis einer Buchung in der Datei
wiederfindet.

**Der Bestand kommt seit 2026-09-22 auch wieder HEREIN**, und zwar nicht über einen
eigenen Weg, sondern als QUELLE des Imports (`adapters/import/bestandsAdapter.ts`). Das ist
die ganze Entscheidung dahinter: der Import hat bereits alles, was ein Wiedereinlesen
braucht — Kontozuordnung, Dublettenprüfung, Inbox, Verbuchen. Ein zweiter Weg daneben
(„Bestand wiederherstellen") hätte jede dieser Fragen ein zweites Mal beantworten müssen,
und zwei Antworten auf „steht das schon drin?" sind eine zu viel.

Drei Dinge, die daraus folgen und die beim ersten Einlesen überraschen:

- **Die Zeilen landen in der INBOX, nicht im Ledger.** Sie werden durchgesehen und verbucht
  wie eine Bankdatei. Genau das ist die Zusicherung: nichts erscheint im Konto, ohne dass
  jemand hingesehen hat.
- **Die Aufteilung einer Buchung und die Paarung einer Umbuchung kommen NICHT mit.** Die
  Inbox kennt eine Zahlung, nicht ihre Teile, und eine `transferId` entsteht beim Umbuchen.
  Beides wird gezählt und als Warnung gemeldet — was verlorengeht, muss dastehen.
- **Die Kategorie kommt als NAME herein** (`ExportBuchung.kategorie`, deshalb Fassung 5)
  und geht als `kategorieVorschlag` weiter, denselben Weg wie Finanzgurus Vokabular. Die Id
  daneben bleibt ungenutzt: sie gilt nur in dem Bestand, aus dem die Datei stammt. Ohne das
  Feld kam jede Zeile kategorielos an, obwohl die Einsortierung in der Datei stand.

`bestandsAdapter.test.ts` liest am Ende das, was `bestandExportieren` WIRKLICH schreibt —
nicht ein ausgedachtes JSON. Wer den Export ändert, ohne den Adapter mitzuziehen, sieht es
dort und nicht an dem Tag, an dem er die Datei braucht.

Was NICHT drin ist, damit niemand danach sucht: unverbuchte Zeilen (Inbox, verworfen) —
exportiert werden Buchungen, und eine Inbox-Zeile ist noch keine. Ebenso Budgets,
Rücklagen, Depots und das Journal: sie hängen nicht an einer Buchung.

**Die Datei liegt im KLARTEXT, der Bestand daneben nicht.** Seit 2026-08-27 ist die
Datenbank verschlüsselt und ihre Sicherungen sind es mit; ein Bestandsexport legt eine
unverschlüsselte Vollkopie desselben Inhalts daneben und hebt den Schutz für diesen Ordner
faktisch auf, solange sie liegt. Das ist dieselbe Lücke wie bei den von Hand angelegten
Sicherungen, die die Überführung nie zu sehen bekommt — und sie entsteht aus demselben
Grund: jemand tut etwas Sorgfältiges und denkt danach nicht mehr an die Kopie. Deshalb
sagt die Karte es dazu, und deshalb steht es hier: **die Datei gehört nach Gebrauch
gelöscht**, nicht aufgehoben. Ein Export je Tag und Bestand überschreibt sich zwar selbst,
aber nur, solange am selben Tag exportiert wird.

**Der gefährliche Teil liegt hinter dem Export, nicht in ihm.** Beide Verwendungswege enden
im ÖFFENTLICHEN Repo, und diese Datei ist der kürzeste Weg von der echten Datenbank
dorthin. Die Pseudonymisierung passiert danach und ausserhalb — und **kein Wächter im Repo
würde einen Empfängernamen finden**, der es doch hineinschafft: der Muster-Guard kennt
Formen, keine Werte (siehe „Was er nicht kann" in `scripts/CLAUDE.md`). Was aus dieser Datei ins Repo wandert,
ist Handarbeit mit Vier-Augen-Anspruch, und was sich benennen lässt, gehört vorher in
`.privacy-terms`.
