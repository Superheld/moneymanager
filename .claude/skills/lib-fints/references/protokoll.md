# FinTS auf der Leitung — was man zum Debuggen wissen muss

Gebraucht, wenn `lib-fints` etwas liefert, das nicht zu erklären ist: leere Ergebnisse
trotz `success: true`, eine Ablehnung ohne erkennbaren Grund, Felder, die anders belegt
sind als der Typ nahelegt. Dann hilft nur der Blick auf die tatsächlichen Nachrichten.

## Transport

PIN/TAN läuft als HTTPS-POST an den FinTS-Endpunkt des Instituts. Der Rumpf ist die
**base64-kodierte** Nachricht, darin Text in **Latin-1** (ISO-8859-1). Content-Type
`text/plain`. Antwort ebenso.

Aus einer Browser-Umgebung scheitert das an CORS — Bankserver senden keine
entsprechenden Header. In Desktop-Anwendungen muss der Aufruf durch den nativen Teil.

## Nachrichtenaufbau

```
'   beendet ein Segment
+   trennt Datenelemente
:   trennt Gruppen innerhalb eines Datenelements
?   maskiert das folgende Zeichen (auch ?' beendet KEIN Segment)
@<länge>@<bytes>   Binärblock; Trennzeichen darin haben keine Bedeutung
```

Eine dekodierte Nachricht zeigt zunächst nur vier Segmente:

```
HNHBK   Nachrichtenkopf
HNVSK   Verschlüsselungskopf
HNVSD   „verschlüsselte Daten" — bei PIN/TAN UNVERSCHLÜSSELT, ein Binärblock
HNHBS   Nachrichtenabschluss
```

**Die Nutzdaten stecken im Binärblock von `HNVSD`.** Ohne Auspacken sieht man keinen
einzigen Geschäftsvorfall — der häufigste Grund, warum ein selbstgebauter Mitschnitt
nutzlos aussieht. Der Name führt in die Irre: die Vertraulichkeit liefert TLS, das
Segment ist Klartext. `scripts/fints-segmente.mjs` erledigt das.

## Segmente, die häufig interessieren

Anfragen beginnen mit `HK`, Antworten mit `HI`. Ein `…S` am Ende einer Antwort
bezeichnet die Parameter, die die Bank für diesen Vorfall bekanntgibt.

| Segment | Inhalt |
|---|---|
| `HKIDN` / `HKVVB` | Identifikation, Verarbeitungsvorbereitung (hier steht die Produkt-ID) |
| `HIUPD` | ein Konto des Nutzers — Kontoverbindung, IBAN, Produktname, erlaubte Vorfälle |
| `HIRMG` / `HIRMS` | Rückmeldungen zur Nachricht bzw. zum einzelnen Segment |
| `HKSAL` / `HISAL` | Saldo |
| `HKKAZ` / `HIKAZS` | Umsätze MT940 nebst Parametern |
| `HKCAZ` / `HICAZS` | Umsätze CAMT; die Parameter nennen die akzeptierten camt-Formate |
| `HKWPD` / `HIWPD` | Depotaufstellung (MT535) |
| `HKTAN` / `HITAN` | TAN-Verfahren; `HITAN` trägt die Herausforderung samt Bild |
| `HKEND` | Dialogende |

## Die Kontoverbindung — Ursache vieler 3010-Ablehnungen

Es gibt sie in zwei Formen, und welche ein Segment verlangt, hängt von seiner Version ab:

```
national      Kontonummer : Unterkontomerkmal : Länderkennzeichen : BLZ
international IBAN : BIC : Kontonummer : Unterkontomerkmal : Länderkennzeichen : BLZ
```

In der internationalen Form sind alle Elemente optional, gemeint ist aber **entweder**
IBAN und BIC **oder** die nationalen Angaben. `lib-fints` füllt beides zugleich:

```
HKSAL:3:5+1234567800:Girokonto:280:99999901+N                        ← läuft
HKCAZ:3:1+DE85…:TESTDEFFXXX:1234567800:Girokonto:280:99999901+…      ← 3010
```

(Erfundene Werte mit einer nicht vergebenen Bankleitzahl. Die Struktur ist echt, die
Zahlen sind es nicht — ein Mitschnitt trägt den vollständigen Kontobestand.)

`HKKAZ` nutzt bis Segmentversion 6 die nationale Form und ist deshalb der verlässliche
Weg, wenn ein Institut die internationale ablehnt. Daran erkennt man den Fall: der
Saldo desselben Kontos funktioniert, nur der Umsatzabruf nicht.

## Rückmeldecodes

`HIRMG` bezieht sich auf die Nachricht, `HIRMS` auf ein einzelnes Segment; die
Segmentbezugsnummer steht im Kopf. `lib-fints` reicht beide als `bankAnswers` durch.

| Code | Bedeutung |
|---|---|
| `0010` | Auftrag entgegengenommen |
| `0020` | Auftrag ausgeführt / Dialog initialisiert |
| `3010` | Kontonummer ungültig — meist die Kontoverbindung |
| `3050` | BPD/UPD veraltet, aktuelle Fassung liegt bei (harmlos, sehr häufig) |
| `3060` | es folgen Warnungen |
| `3076` | starke Kundenauthentifizierung nicht notwendig (PSD2-Ausnahme) |
| `3905` | Anfrage bitte erneut senden |
| `3920` | verfügbare TAN-Verfahren; die IDs stehen in den Parametern |
| `9010`, `9050`, `9800` … | Fehler; ab `9000` gilt der Auftrag als gescheitert |

`success` in der Antwort ist nichts weiter als „höchster Code < 9000". Ein leeres
Ergebnis mit `success: true` ist deshalb möglich und normal — die Begründung steht in
`bankAnswers`, sonst nirgends.

## Bild-TAN

Bei photoTAN und chipTAN-QR trägt `HITAN` die Bildmatrix im Feld `challengeHhdUc`, in
einer eigenen kleinen Struktur: zwei Zeichen Längenangabe des MIME-Typs, der MIME-Typ,
zwei Bytes Bildlänge (Big Endian), dann die Bilddaten. `lib-fints` zerlegt das und
liefert `tanPhoto: { mimeType, image }` — das Bild muss die Anwendung nur noch anzeigen.

## Zugangsdaten der Institute

Die FinTS-URL je Bankleitzahl steht in der Bankenliste der Deutschen Kreditwirtschaft,
die registrierte Hersteller per Mail bekommen (Latin-1, CRLF, semikolongetrennt, eine
Zeile je Institut **und Ort** — dieselbe BLZ steht mehrfach drin). Maßgeblich ist die
Spalte `PIN/TAN-Zugang URL`; ist sie leer, bietet das Institut keinen PIN/TAN-Zugang.
Die Liste wird nicht öffentlich publiziert und gehört nicht in ein Repository.

Das Verhalten bestimmt übrigens meist das Rechenzentrum, nicht das einzelne Institut —
Atruvia (Genossenschaftsbanken) und Finanz Informatik (Sparkassen) decken zusammen
einen großen Teil ab. Wer dort Eigenheiten kennt, kennt sie für viele Banken zugleich.

## Wenn ein Verhalten unklar bleibt

`phpFinTS` (nemiah, MIT) ist die reifste offene Implementierung und hat zu den meisten
Instituts-Eigenheiten bereits einen Issue. Ebenso als Nachschlagewerk brauchbar:
`python-fints`, HBCI4Java (Basis von Hibiscus), `libfintx` (C#). Nicht zum Einbinden —
zum Vergleichen, was andere an derselben Stelle senden.
