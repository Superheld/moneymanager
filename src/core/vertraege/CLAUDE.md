# Verträge — Zuordnung und Erkennung

Gilt für die Zuordnung von Buchungen zu Verträgen und für die Erkennungsregeln. Was überall gilt, steht in der Wurzel-`CLAUDE.md`.

## Zuordnungen stehen an der Buchung

`kategorie_id` und `vertrag_id` sind **Spalten von `ist_buchung`**, nicht eigene Tabellen.
Beide Beziehungen sind N:1 (viele Buchungen, eine Kategorie bzw. ein Vertrag), und dafür
ist eine Fremdschlüsselspalte die Form. Der Lebenszyklus-Grund des Belegs (`src/application/import/CLAUDE.md`) greift hier nicht:
keine der beiden ist ein Beleg, und beide ändern sich gleich oft.

Zu jeder gehört eine **Herkunft** (`kategorie_herkunft`, `vertrag_herkunft`), und die
leistet mehr, als ihr Name sagt. Sie unterscheidet nicht nur Automatik von Handarbeit,
sondern trägt beim Vertrag auch, was vorher die blosse Existenz einer Zeile trug:

| `vertrag_id` | `vertrag_herkunft` | heisst |
|---|---|---|
| leer | leer | noch nie entschieden — die Automatik darf ran |
| leer | gesetzt | **gehört ausdrücklich zu keinem Vertrag** — Hand, bleibt |
| gesetzt | — | zugeordnet |

Die mittlere Zeile ist der Grund, warum es die Spalte gibt: ohne sie käme ein von Hand
korrigierter Fehlgriff der Automatik beim nächsten Abgleich zurück. Wer `vertrag_id`
zurücksetzt, muss `vertrag_herkunft` mit zurücksetzen — sonst bleibt die Buchung für die
Automatik gesperrt.

## Aus denselben drei Zuständen wird die Regel abgeleitet

Seit 2026-09-05 liest die Erkennung die Tabelle oben auch RÜCKWÄRTS: aus den zugeordneten
Zahlungen entstehen Vorschläge für die Merkmalsliste (`core/vertraege/merkmalsableitung.ts`,
sichtbar im Erkennungsabschnitt des Vertragsdialogs). Das ist dieselbe Messung wie die
Vorschau, nur andersherum — Kandidaten bilden und durch `merkmalsTreffer` schicken.

**Beleg ist ausschliesslich `herkunft = 'manuell'`.** Eine Buchung, die die Regel selbst
zugeordnet hat, ist ihr Ergebnis; sie als Beleg zu nehmen ist ein Kreis, und der driftet
langsam: die Regel greift einmal zu weit, der Fehlgriff wird Beleg, das Muster wird
breiter. Die Trennung steht im Schema und geht nur verloren, wenn jemand „alle Buchungen
des Vertrags" schreibt — die naheliegende Formulierung.

Die dritte Zeile der Tabelle ist dabei mehr wert als sie aussieht: ein Nein von Hand ist
die einzige Stelle im Bestand, an der „gehört nicht dazu" WIRKLICH dasteht. Überall sonst
heisst „kein Vertrag" entweder das oder „ist noch niemandem aufgefallen", und man sieht der
Zeile nicht an, welches. Ein Vorschlag, der ein solches Nein trifft, ist für mindestens
einen Fall nachweislich falsch und wird deshalb nicht angeboten.

**Bewertet wird mit DREI Zahlen und keiner Punktzahl** — deckt Belege ab, widerspricht
einem Nein, trifft sonst noch etwas. Eine Verrechnung daraus wäre geraten und sähe als Zahl
aus wie eine Messung; was die drei gegeneinander wiegen, hängt am Fall.

**Eine Umschichtung zählt nirgends mit.** `passtZu` lässt sie aus, ihr Empfängerfeld trägt
je nach Bank die eigene IBAN, den eigenen Namen oder nichts. Zuordnen darf man sie (ein
Umbuchungsvertrag ist genau das), als Beleg wäre sie ein Nenner, den kein Kandidat je
erreicht. Durchgesetzt an einer Stelle: `belegspuren`.

## Ein Merkmal kann MUSS sein, und die Regel hat ein Fälligkeitsfenster

Die Merkmale einer `Vertragserkennung` waren bis 2026-09-13 ausnahmslos ODER-verknüpft:
ein Treffer genügte. Das hat einen guten Grund — derselbe Anbieter steht mal als
„Vibora GmbH", mal als „VIBORA KD" im Auszug, und beide Schreibweisen sollen greifen.

**Zwei Verträge beim selben Einzieher waren damit nicht zu trennen.** Zwei Kfz-Policen
derselben Versicherung tragen dieselbe Gläubiger-ID und denselben Namen; unterschieden
sind sie nur an der Policennummer im Verwendungszweck. Die Merkmalsart dafür gibt es seit
jeher — sie half trotzdem nicht: als weiteres ODER-Merkmal eingetragen verengte sie die
Regel nicht, sie **erweiterte** sie. Beide Verträge trafen beide Zahlungen, und
`besser` entschied das Gleichstandsduell alphabetisch nach Vertrags-Id. Deterministisch,
und deterministisch falsch.

Zwei Mittel stehen jetzt daneben, und sie beantworten verschiedene Fragen:

- **`pflicht` am einzelnen Merkmal.** Alle Pflichtmerkmale müssen treffen, von den übrigen
  genügt eines. Das UND sitzt damit am Merkmal und nicht an der Regel: ein globaler
  Schalter „alles muss treffen" hätte die Schreibweisenliste erschlagen, für die es das
  ODER überhaupt gibt. Ohne Flag verhält sich jede bestehende Regel unverändert — es steht
  im JSON von `vertrag_erkennung.schluessel` und brauchte deshalb **keine Migration**.
- **Das Fälligkeitsfenster** (`monat_von`/`monat_bis`, `tag_von`/`tag_bis`, Migration 72).
  Es ist ausdrücklich etwas anderes als `gueltig_ab`/`gueltig_bis`: die beiden sind feste
  Kalenderdaten und sagen, wie lange es den Vertrag GAB, das Fenster wiederholt sich jedes
  Jahr bzw. jeden Monat. Es trennt dieselben zwei Policen über den Termin — nötig, weil
  manche Institute im Verwendungszweck gar nichts Unterscheidendes liefern.

Drei Dinge darin, die man kennen muss:

- **Zwei Paare und nicht eines.** Eine Jahrespolice wird im Monat fällig, ein Abo am Tag im
  Monat. Ein einziges Feld hätte die zweite Form nicht ausdrücken können, und ein Format,
  das sich selbst auslegt („03-01" ist ein Datum, „01" ein Tag), wäre beim Lesen nicht mehr
  zu entscheiden.
- **Beide Paare wickeln um**, `von` größer als `bis` meint über die Grenze hinweg. Ohne das
  wäre jeder Vertrag mit Fälligkeit um den Jahreswechsel nicht abbildbar.
- **Ein halbes Fenster gilt nicht.** „ab März" ohne Ende ist bei einer Größe, die im Kreis
  läuft, nicht zu deuten — es hiesse entweder „März bis Dezember" oder „März bis Februar",
  und beides wäre eine Vermutung. Fehlt eine Grenze, greift das Fenster gar nicht.

Die Vorrangregel in `besser` hat dafür eine neue erste Stufe bekommen: **mehr erfüllte
Pflichtmerkmale gewinnt.** Beide Regeln passen an dieser Stelle ja bereits, ihre Pflichten
sind also alle erfüllt — wer mehr davon gestellt hat, hat mehr verlangt und mehr bekommen.
Eine alte, breite Regel verliert damit gegen eine neu verengte, ohne dass die Vertrags-Id
mitredet.

**Seit 2026-09-13 belegt ein übernommener Vorschlag das Fenster vor.** Die Lupe am
Vorschlag misst Termine und Beträge und zeigte sie an; die Regel, die daraus entstand,
kannte nur Name und Median-Betrag — man las sieben gemessene Werte und bekam zwei davon.
Übersetzt wird in `core/vertraege/regelvorlage.ts`, und drei Entscheidungen darin sind
keine Rechenschritte:

- **Der Tag gilt für jeden Takt, der Monat nur für den JÄHRLICHEN.** Ein Fenster ist EIN
  zusammenhängender Zeitraum; die vier Termine eines quartalsweisen Vertrags liegen über
  das Jahr verstreut, und das engste Fenster, das sie alle fasst, umspannte zehn Monate.
  Es stünde da und schränkte nichts ein.
- **Gerechnet wird auf dem KREIS, nicht auf der Geraden.** Wer am Monatsletzten abbucht,
  trägt Tage aus beiden Hälften; als Spanne von Kleinstem zu Größtem wäre das „1 bis 31".
  Gefunden wird das Fenster über die größte Lücke. Was samt Puffer mehr als die Hälfte des
  Kreises fasst, entsteht gar nicht erst.
- **Die Betragsspanne wird GEWEITET, nie verengt.** Die abgeleitete Spanne (0,6× bis 1,8×)
  hält fremde Zahlungen an denselben Empfänger draußen, und das bleibt ihre Aufgabe. Was
  die Messung beiträgt, ist der umgekehrte Fall: die Nachzahlung, die über 1,8× lag und
  bisher aus der eigenen Regel fiel. Eine zu enge Spanne ist der teurere der beiden
  Fehler — was sie wegschneidet, fehlt still, während eine zu weite Spanne eine fremde
  Zahlung in die Trefferliste des Dialogs holt, wo man sie sieht.

**Der Erkennungsabschnitt steht seither auch beim ANLEGEN.** Vorher erschien er erst beim
Bearbeiten, mit der Begründung, ein Vertrag ohne Id habe keinen Ort für eine Regel. Das
stimmt fürs Speichern und nicht fürs Anzeigen — die Vorschau fragt nur, welche Zahlungen
die Merkmale treffen. Wer einen Vertrag von Hand erfasste, bekam bis dahin eine Regel
zugeschrieben, ohne sie je zu sehen, und kam erst nach Speichern und erneutem Öffnen an
sie heran. Die Vorbelegung (`erkennungsentwurf`) folgt dabei den Stammdaten, **solange
niemand den Abschnitt angefasst hat**: dasselbe Muster wie bei der Richtung im
Buchungsdialog — die Ableitung gilt bis zur ersten eigenen Wahl, danach nie wieder.

**Der gemeinsame Verwendungszweck steht in der Lupe, wird aber KEIN Merkmal.** Womit alle
Zahlungen einer Gruppe beginnen, ist die Angabe, an der zwei Verträge beim selben
Einzieher auseinandergehen — als automatisches Merkmal wäre es trotzdem falsch: ohne
`pflicht` erweitert es die Regel (genau der Fehler, den das Flag behebt), mit `pflicht`
bricht sie, sobald eine Quelle den Zweck einmal nicht liefert. Angezeigt wird er deshalb
als Auskunft, eingetragen wird er von Hand. Dass eine Zahlung ohne Zweck die Auskunft
ganz entfallen lässt, ist selbst die Aussage: auf dieses Feld ist bei diesem Vertrag kein
Verlass.

**Und die Vorschau zeigt seither den Verwendungszweck.** Sie tat es nicht, solange man
Regeln nur auf Empfänger und Gläubiger-ID baute; seit man sie auf den Zweck baut, ist
seine Abwesenheit der Fehler: man stellt eine Regel auf ein Feld, das die Maske, in der man
das tut, nirgends anzeigt. Dieselbe Lücke steht noch im Kontoauszug — er **durchsucht** den
Zweck (`KontenScreen`), zeigt ihn aber nicht.

## Die Kategorie des Vertrags rückwirkend auf seine Zahlungen

Seit 2026-09-13 gibt es im Vertragsdialog einen Haken dafür
(`application/vertraege/vertragskategorie.ts`). Der Anlass: die Erkennung ordnet einem
frisch erfassten Vertrag seine Zahlungen von Jahren zurück zu, und die behalten die
Kategorie, die sie damals bekamen — die Zuordnung sagt „gehört zu diesem Vertrag", die
Kategorie daneben widerspricht ihr.

**Es passiert nicht von selbst, und das ist die eigentliche Entscheidung.** Eine
Vertragszuordnung ist eine Aussage über die ZUGEHÖRIGKEIT; daraus automatisch die Kategorie
umzuschreiben machte aus `zuordnungenAbgleichen` — das bei jedem Öffnen des Bereichs läuft
— eine Massenänderung an gebuchten Daten. Wer eine Zahlung bewusst anders einsortiert hat,
verlöre das beim nächsten Hinsehen.

Drei Dinge, die daran hängen:

- **Mit Haken überschreibt es AUCH Handarbeit.** Das ist kein Versehen, sondern der Anlass:
  „ich habe das damals falsch einsortiert, der Vertrag weiß es besser". Ein Schutz der
  Handarbeit wäre hier ein Schutz gegen die Handlung, die gerade ausgelöst wurde. Der Haken
  ist bei jedem Öffnen wieder aus.
- **Eine GETEILTE Buchung bleibt stehen.** Bei einer Aufteilung stehen die Kategorien in
  den Teilen; die Kopfkategorie umzuschreiben ließe die Teile stehen und erzeugte einen
  Widerspruch, den die Budgetrechnung je nach Weg verschieden auflöst.
- **Geschrieben wird über `buchungenSammelbearbeiten`**, nicht über eine eigene Schleife:
  dort steht schon, was zu einer Kategorieänderung gehört — Herkunft auf `manuell` (sonst
  holt die Kategorie-Automatik den alten Wert zurück), Charakter folgt der Kategorie,
  Umbuchungs-Bein bleibt unberührt. Damit kommt auch der Journaleintrag mit, den
  `ledger.speichern` schreibt.

## Ein Umbuchungsvertrag wird am WEG erkannt, nicht am Empfänger

Ein gewöhnlicher Vertrag hängt an einem Namen: `vertrag_erkennung` normalisiert die
Gegenpartei und vergleicht mit Unschärfe. Bei einer Verschiebung zwischen zwei eigenen
Konten gibt es diesen Schlüssel nicht — dort steht je nach Bank die eigene IBAN, der
eigene Name oder gar nichts, und aus dem Verwendungszweck etwas zu raten hiesse, sich auf
einen Text zu verlassen, den niemand füllen muss.

Deshalb trägt die **Zahlungsregel** ein `gegenkonto_id`, und `umbuchungErkennung` prüft
strukturell: gleicher Weg (Konto → Gegenkonto), Charakter `Umschichtung`, abgehendes Bein.
Das ist eine harte Übereinstimmung und keine Ähnlichkeit.

Drei Entscheidungen darin, die man kennen muss:

- **Der Betrag entscheidet NICHT über die Passung**, sondern nur darüber, WELCHE Regel es
  ist, wenn mehrere denselben Weg beschreiben. Wer seine Sparrate erhöht und die Regel
  nicht nachzieht, soll eine erkannte Umbuchung mit Abweichung sehen — mit einer
  Betragsschwelle wäre sie stattdessen gar nicht erkannt, und die Zeile stünde als „offen"
  da, während daneben eine unerklärte Umschichtung liegt.
- **Nur das abgehende Bein** bekommt die Zuordnung. Beide zuzuordnen hübe die Ist-Summe
  des Vertrags auf: einmal −200, einmal +200, obwohl 200 geflossen sind.
- **`gegenkonto_id` steht an der REGEL, nicht am Vertrag.** Die Regel beschreibt die
  Zahlung, der Vertrag die Vereinbarung darüber — derselbe Grund, aus dem `konto_id` dort
  steht. Sinnvoll ist es nur mit `charakter = 'Umschichtung'`; erzwungen wird das an der
  Anwendungsgrenze, weil SQLite eine Bedingung über zwei Spalten nur mit einem CHECK
  ausdrücken kann und ein CHECK an einer bestehenden Tabelle einen Umbau kostet.

Die Vertragsart `umbuchung` hängt daran und trägt eine Folge: **keine
Kündigungswarnung.** Eine Abmachung mit sich selbst kündigt man, indem man sie löscht.
