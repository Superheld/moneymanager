---
name: lib-fints
description: >
  Arbeiten mit der npm-Bibliothek lib-fints (FinTS 3.0 PIN/TAN, deutsches
  Online-Banking) — Klassen, Methoden, Ablauf, Datenformen und die Fallen, die
  Stunden kosten. Unbedingt verwenden, sobald es um FinTS, HBCI, Bankabruf,
  Kontoumsätze per Bankprotokoll, MT940, CAMT, HKKAZ/HKCAZ/HKSAL, photoTAN,
  decoupled TAN, DK-Produktregistrierung oder das Paket `lib-fints` geht — auch
  wenn die Bibliothek nicht namentlich genannt wird und jemand nur „Bankdaten
  direkt abrufen" oder „Umsätze von der Bank holen" sagt. Ebenso heranziehen beim
  Debuggen unverständlicher Bank-Rückmeldungen (Codes wie 3010, 3076, 3920) oder
  wenn ein Abruf leere Ergebnisse liefert.
---

# lib-fints

TypeScript-Client für FinTS 3.0 mit PIN/TAN. Geprüft gegen **Version 1.5.0** und gegen
den Fork **`Superheld/lib-fints#workshop`**.

Diese Referenz existiert, weil die Bibliothek zwar sauber typisiert, aber an drei
Stellen still überraschend ist: der Verbindungsaufbau braucht **zwei** Anläufe, die
gelieferten Daten passen **nicht** zu den üblichen Geld- und Datumskonventionen, und
mehrere typisierte Felder werden **nie** befüllt. Wer das nicht weiß, baut korrekt
aussehenden Code, der falsche Zahlen produziert.

## Welcher Stand liegt vor?

Zwei Stellen dieser Referenz beschreiben Fallen, die im Fork **behoben** sind. Welcher
Stand installiert ist, entscheidet also, ob man dagegen anbauen muss — und das steht in
`package.json`:

```
"lib-fints": "^1.5.0"                                        → npm-Stand, Fallen gelten
"lib-fints": "git+https://…/Superheld/lib-fints.git#workshop" → Fork, siehe unten
```

Schneller Test im Zweifel: `grep AccountRef node_modules/lib-fints/dist/types/bankAccount.d.ts`
— gibt es den Typ, ist es der Fork.

Was der Fork gegenüber 1.5.0 ändert, alles als Pull Request upstream angeboten:

1. **Konten werden über das Konto adressiert** (`AccountRef = string | BankAccount`), nicht
   über die Kontonummer allein. `getBankAccount` wirft bei einer mehrdeutigen Nummer,
   statt eines auszuwählen. Siehe *Konten adressieren*.
2. **Die Kontoverbindung folgt `HISPAS.nationalAccountAllowed`**, statt IBAN, BIC und die
   nationalen Felder immer zugleich zu füllen. Siehe *Umsätze holen*.
3. **`HIWPDS` wird gelesen** — damit ist erstmals erkennbar, welche Depot-Argumente eine
   Bank annimmt. Siehe *Depot*.
4. **Die Interaction-Klassen sind exportiert** (`BalanceInteraction`,
   `StatementInteractionCAMT/MT940`, `PortfolioInteraction`, `CustomerOrderInteraction`
   …). `startCustomerOrderInteraction` war public, der Parametertyp aber nicht
   importierbar — man musste über `dist/` gehen. Das ist die Naht, an der man eine
   Bankeigenheit umgeht, ohne die Bibliothek zu ändern.

## Zuerst das README der Bibliothek lesen

`node_modules/lib-fints/README.md` — 309 Zeilen, gut gepflegt, und es deckt den
gesamten Gebrauch ab: Ablauf samt der doppelten Synchronisation, TAN-Fortsetzung,
decoupled, TAN-Medien, Persistieren der Bankinformationen, Debugging, eine Tabelle
aller Geschäftsvorfälle mit ihren Segmenten, die `canGet…`-Methoden, den typisierten
Parameterzugriff, die Grenzen. Dazu die `.d.ts`-Dateien unter `dist/types/` mit
JSDoc an den wichtigen Methoden.

Ist das Paket nicht installiert, kostet `npm i lib-fints` in einem beliebigen
Verzeichnis ein paar Sekunden — billiger und verlässlicher, als eine abgetippte
API-Referenz zu pflegen. Genau deshalb steht hier keine.

**Dieser Skill ist das, was dort NICHT steht.** Das README erklärt, wie man die
Bibliothek bedient; es sagt nichts darüber, welche Form die Daten haben, die
zurückkommen, welche typisierten Felder leer bleiben und woran man Bank-Eigenheiten
erkennt. Nachgeprüft: `amount`, `remoteIdentifier`, `mandateReference`, `bookingText`,
`subAccountId`, `accountType`, `HNVSD` und sämtliche Rückmeldecodes kommen im README
kein einziges Mal vor. Das Folgende stammt aus einem echten Zugang, nicht aus der Doku.

Dazu:
- `references/protokoll.md` — Nachrichtenaufbau, Rückmeldecodes, Debugging
- `scripts/fints-segmente.mjs` — dekodiert mitgeschnittene Nachrichten lesbar

Zur Lizenz: **LGPL-2.1-or-later**, so sagen es `package.json`, die beiliegende LICENSE
und seit dem 2026-08-17 auch das README. Im npm-Stand 1.5.0 steht dort noch
fälschlich „LGPL 3.0" — praktisch folgenlos, weil „or later" die 3.0 einschließt, aber
wer zitiert, nimmt die `package.json`.

**Getestet ist die Bibliothek laut README nur mit DKB, ING-DiBa und Renault Bank
Direkt.** Bei jeder anderen Bank ist mit Eigenheiten zu rechnen, und der Autor bittet
ausdrücklich um Rückmeldung — ein Fund gehört also dorthin gemeldet, nicht umgangen.

## Was die Bibliothek kann und was nicht

**Kann:** Kontostand, Umsätze (MT940 und CAMT), Depotaufstellung, Kreditkartenumsätze,
elektronische Kontoauszüge. PIN/TAN inklusive decoupled-Verfahren.

**Kann nicht:** Überweisungen, Lastschriften, überhaupt Aufträge. Für eine
auswertende Anwendung ist das kein Mangel, sondern der passende Zuschnitt.

Laufzeit: ESM, Node ≥ 18, eine einzige Abhängigkeit (`fast-xml-parser`). Kein
`node:crypto`, kein `node:http`. `Buffer` wird an drei Stellen benutzt (latin1↔base64)
— im Browser also ein Polyfill nötig, und dort scheitert es ohnehin an CORS: Bankserver
senden keine `Access-Control-Allow-Origin`-Header. Für Desktop-Anwendungen (Tauri,
Electron) muss der Verkehr deshalb durch den nativen Teil laufen.

## Voraussetzung: die Produktregistrierung

Ohne registrierte Produkt-ID der Deutschen Kreditwirtschaft verweigern Banken den
Dialog. Die Registrierung ist kostenlos, dauert 10–15 Werktage — und danach nochmal
Wochen, bis die Nummer beim einzelnen Institut angekommen ist. Eine Ablehnung kurz nach
der Registrierung ist also oft kein Fehler im Code.

Zwei Längenregeln, die als Ausnahme durchschlagen:

```ts
FinTSConfig.forFirstTimeUse(
  productId,      // exakt 25 Zeichen, allein im Feld Produktbezeichnung
  productVersion, // MAXIMAL 5 Zeichen — "0.13.0" wirft beim ersten Senden
  url, bankId, userId, pin, customerId?, countryCode?
)
```

Die Produkt-ID gehört nie in einen öffentlichen Quelltext: sie ist zwar kein Geheimnis
(sie geht im Klartext an die Bank und steckt in jedem ausgelieferten Binary), aber die
Registrierungsbedingungen untersagen die Weitergabe an Dritte, und ein Fork ist ein
anderes Produkt. Konfiguration statt Konstante.

## Der Ablauf — und warum zweimal synchronisiert wird

Das ist die häufigste Ursache für „es kommen keine Konten":

```ts
const config = FinTSConfig.forFirstTimeUse(produktId, "1.0", url, blz, benutzer, pin);
const client = new FinTSClient(config);

// 1. Lauf: liefert die Bankparameter (BPD) — darin die verfügbaren TAN-Verfahren.
//    Die Nutzerdaten (UPD) mit der KONTENLISTE bleiben hier meist leer.
await client.synchronize();

// 2. Verfahren wählen. Vorher ging das nicht: man erfährt erst aus der Antwort
//    des ersten Laufs, welche Verfahren es überhaupt gibt.
const verfahren = client.selectTanMethod(config.availableTanMethods[0].id);
// Ob ein Medium gewählt werden MUSS, sagt die Bank über tanMediaRequirement —
// nicht die Länge von activeTanMedia. Danach richten.
if (verfahren.tanMediaRequirement === TanMediaRequirement.Required) {
  client.selectTanMedia(verfahren.activeTanMedia[0]);
}

// 3. NOCHMAL synchronisieren — jetzt kommen die Konten.
let sync = await client.synchronize();
sync = await tanBehandeln(sync, (ref, tan) => client.synchronizeWithTan(ref, tan));

const konten = config.bankingInformation.upd?.bankAccounts ?? [];
```

Das Henne-Ei ist der Grund: ein Dialog muss das TAN-Verfahren nennen, aber die Liste
der Verfahren kommt erst aus einem Dialog. Wer den zweiten Lauf weglässt, bekommt eine
erfolgreiche Antwort mit leerer Kontenliste — kein Fehler, keine Warnung.

**Folgesitzungen** überspringen das: `config.bankingInformation` nach dem Lauf
persistieren und beim nächsten Start mit `FinTSConfig.fromBankingInformation(...)`
wieder hineinreichen. Das spart Runden und Rückfragen.

Dabei gilt aber: **die Bankinformationen ändern sich nicht nur beim Synchronisieren.**
BPD und UPD sind versioniert und werden bei *jedem* Auftrag mitgeschickt; hat sich
etwas geändert, schickt die Bank die neue Fassung zurück. Deshalb trägt jede Antwort
`bankingInformationUpdated` — steht das auf `true`, muss `config.bankingInformation`
neu persistiert werden. Wer nur nach dem Synchronisieren speichert, arbeitet
irgendwann mit veralteten Kontodaten.

## TAN-Behandlung

Jede Antwort kann `requiresTan: true` tragen. Dann enthält sie **keine** Nutzdaten,
sondern eine Herausforderung, die mit der passenden `*WithTan(tanReference, tan)`
-Methode fortgesetzt wird. Zu jeder Abrufmethode gibt es genau eine solche.

```ts
async function tanBehandeln(antwort, weiter, verfahren) {
  if (!antwort.requiresTan) return antwort;

  // Bild-TAN (photoTAN, chipTAN-QR): die Matrix kommt INLINE mit, als
  // { mimeType, image: Uint8Array }. Ohne Anzeige gibt es nichts abzuscannen —
  // das Verfahren ist dann schlicht unbenutzbar.
  if (antwort.tanPhoto) zeigeBild(antwort.tanPhoto.image, antwort.tanPhoto.mimeType);

  if (verfahren?.isDecoupled) {
    // Freigabe geschieht auf einem anderen Gerät. Wiederholt nachfragen, bis
    // requiresTan false wird; die Wartezeiten gibt die Bank selbst vor.
    const p = verfahren.decoupled ?? {};
    await warte(p.waitingSecondsBeforeFirstStatusRequest ?? 5);
    for (let i = 0; i < (p.maxStatusRequests ?? 20); i++) {
      const stand = await weiter(antwort.tanReference, undefined); // ohne TAN!
      if (!stand.requiresTan) return stand;
      await warte(p.waitingSecondsBetweenStatusRequests ?? 5);
    }
    throw new Error("Freigabe kam nicht rechtzeitig");
  }

  return weiter(antwort.tanReference, await frageNutzer(antwort.tanChallenge));
}
```

**Lesen braucht oft gar keine TAN.** Antwortet die Bank mit Code `3076 Starke
Kundenauthentifizierung nicht notwendig`, greift die PSD2-Ausnahme für
Kontoinformationen: Saldo und die letzten 90 Tage ohne erneute Authentifizierung,
solange innerhalb der letzten 180 Tage einmal stark authentifiziert wurde. Der
TAN-Pfad wird trotzdem gebraucht — die Ausnahme verfällt, und ein Abruf über einen
längeren Zeitraum fällt nicht darunter. Also: **TAN als Ausnahme behandeln, nicht als
Normalfall**, aber nie weglassen.

## Erst fragen, dann abrufen

Was eine Bank anbietet, ist bankspezifisch. Die Bibliothek beantwortet das je Konto,
und darauf sollte sich der Ablauf stützen, statt Verhalten anzunehmen:

```ts
client.canGetAccountBalance(kontonummer)
client.canGetAccountStatements(kontonummer)
client.canGetPortfolio(kontonummer)
client.canGetCreditCardStatements(kontonummer)
client.canGetElectronicStatements(kontonummer)

config.isTransactionSupported("HKCAZ")            // kennt die Bank den Vorfall?
config.getMaxSupportedTransactionVersion("HKCAZ") // WIRFT, wenn lib-fints ihn
                                                  // nicht implementiert (z. B. HKCCS)
```

**Die Segmentkürzel sind nicht durchweg zu erraten.** Wer sie selbst abfragt, muss sie
richtig treffen, sonst prüft man einen Vorfall, den es nicht gibt, und liest das
Ergebnis als „Bank kann das nicht":

| Was | Segment |
|---|---|
| Synchronisation | `HKIDN`, `HKVVB`, `HKSYN`, `HKTAB` |
| Saldo | `HKSAL` |
| Umsätze | `HKKAZ` (MT940), `HKCAZ` (CAMT) |
| Depot | `HKWPD` |
| **Kreditkartenumsätze** | **`DKKKU`** — ein D-Segment, nicht `HKKAU` |
| Elektronischer Kontoauszug | `HKEKA` |
| SEPA-Konteninformation | `HKSPA` |

Sicherer als eigene Kürzel sind ohnehin die `canGet…`-Methoden: sie kennen das
richtige Segment bereits.

Bankgrenzen wie Speicherzeitraum oder zulässige Formate liefert
`config.getTransactionParameters<T>(transId)` — etwa der Zeitraum, über den die Bank
Umsätze überhaupt vorhält. Der ist institutsabhängig und gehört ausgelesen statt
angenommen.

Die letzte Zeile ist eine echte Falle: `getMaxSupportedTransactionVersion` wirft für
Geschäftsvorfälle ohne eigene Segmentdefinition, statt `undefined` zu liefern. In
`try`/`catch` einpacken und „Bank bietet es nicht" von „Bibliothek kann es nicht"
unterscheiden — nur das Zweite ist ein Grund, upstream zu schauen.

### Die Parametersegmente sind die Fundgrube

`getTransactionParameters<T>(transId)` wird meist nur für den Speicherzeitraum benutzt.
Tatsächlich sagt die Bank dort für jeden Vorfall, was sie kann — und das kostet keine
zusätzliche Runde, es steht ohnehin in den BPD. Die Kurzform (`transId` ist die **HK**-Id,
das Parametersegment heißt **HI…S**):

| Vorfall | Parameter | Felder |
|---|---|---|
| `HKKAZ` | `HIKAZS` | `maxDays`, `entryCountAllowed`, `allAccountsAllowed` |
| `HKCAZ` | `HICAZS` | dieselben plus `supportedCamtFormats` |
| `HKWPD` | `HIWPDS` | `entryCountAllowed`, `currencySelectable`, `priceQualitySelectable` |
| `HKEKA` | `HIEKAS` | `indexAllowed`, `receiptRequired`, `maxEntryCountAllowed`, `supportedFormats` |
| `HKSPA` | `HISPAS` | `nationalAccountAllowed`, `individualAccountRetrievalAllowed`, … |
| — | `HITANS` | die TAN-Verfahren mit Namen, Längen, Medienpflicht, decoupled-Zeiten |

Zwei Punkte, die sich lohnen:

- **`maxDays` kann je Format abweichen.** `HICAZS` und `HIKAZS` nennen eigene Werte; wer
  nur einen liest, deckelt womöglich auf den kürzeren.
- **Ein fehlendes Feld heißt „nicht gesagt", nicht „nein".** Banken senden ältere
  Segmentversionen, in denen Felder schlicht fehlen. Wer daraus eine Null macht, schaltet
  den Abruf ab; wer daraus ein `true` macht, sendet auf gut Glück.

### Was das Paket nicht exportiert

Die `exports`-Map lässt nur den Wurzelimport zu, tiefe Importe auf
`lib-fints/dist/types/segments/…` sind gesperrt. Nicht aus der Wurzel exportiert sind:

- die **Parametertypen** (`HIKAZSParameter`, `HICAZSParameter`, `HIWPDSParameter`, …) —
  man deklariert sie selbst, als Typargument von `getTransactionParameters<T>`;
- **`TanMediaRequirement`** aus `codes.ts`, obwohl das README genau diesen Vergleich
  vorführt. `Required` ist `2`; der Vergleich läuft praktisch über die Zahl.

Eine eigene Deklaration ist hier ehrlicher als ein Import, den das Paket nicht anbietet —
und sie bricht nicht, wenn dort umbenannt wird.

## Konten adressieren

Eine Kontonummer ist nicht überall eindeutig: FinTS identifiziert ein Konto über Nummer
**und** Unterkontomerkmal, und Banken nutzen das. Manche legen im Unterkontomerkmal
keinen Ziffernschlüssel ab, sondern den Produktnamen. Girokonto und Depot können so
dieselbe `accountNumber` mit verschiedener `subAccountId` tragen.

**In 1.5.0 verschwinden dabei Daten lautlos.** Alle Abrufmethoden nehmen nur die
Kontonummer, und `FinTSConfig.getBankAccount(nr)` liefert per `find` **das erste
passende** Konto. Der Abruf schlägt nicht fehl — er beantwortet die Frage für das
falsche Konto. Erkennbar nur daran, dass zwei Konten denselben Saldo zeigen. Wer auf
1.5.0 baut, muss den Fall selbst abfangen:

```ts
const doppelt = konten.filter((k, _, alle) =>
  alle.filter((a) => a.accountNumber === k.accountNumber).length > 1);
// Über die API nicht sicher erreichbar. Überspringen und ausweisen ist richtig;
// stillschweigend abrufen ist falsch.
```

**Im Fork ist das behoben.** `AccountRef = string | BankAccount` — man übergibt das
Konto selbst, und eine mehrdeutige Nummer lässt `getBankAccount` **werfen** statt raten:

```ts
const konto = config.bankingInformation.upd?.bankAccounts.find(
  (a) => a.accountNumber === nr && a.subAccountId === unterkonto);
await client.getAccountBalance(konto);      // eindeutig
await client.getAccountStatements(konto, von, bis);
client.canGetPortfolio(konto);              // auch die canGet…-Methoden
```

Zwei Dinge dazu, die man leicht übersieht:

- **Das übergebene Konto wird gegen die aktuelle UPD aufgelöst**, nicht geglaubt. Wer ein
  Konto aus einer früheren Sitzung hält, bekommt trotzdem den frischen Eintrag mit den
  aktuellen `allowedTransactions`. Ein Schlüssel, den die frische UPD nicht mehr kennt,
  wirft — und das ist die richtige Auskunft, nicht ein Fehler.
- **`matchBankAccount()`** ist die Variante ohne Ausnahme, für Fälle, in denen die *Bank*
  ihre eigenen Konten auflistet (HISPA). Dort wäre ein Wurf falsch: er kippte den ganzen
  Dialog, bevor er zu seinem Auftrag kommt.

Zwei weitere Eigenheiten der Kontenliste, in beiden Ständen: `accountType` liefern manche
Banken durchgehend als `Miscellaneous` — die brauchbare Bezeichnung steht in `product`.
Und Konten ohne IBAN (typisch Depots) gibt es, die IBAN taugt also nicht als Schlüssel.

## Umsätze holen

```ts
let a = await client.getAccountStatements(nr, von, bis, /* preferCamt */ true);
a = await tanBehandeln(a, (ref, tan) => client.getAccountStatementsWithTan(ref, tan));
const buchungen = a.statements.flatMap((s) => s.transactions);
```

**Wenn CAMT abgelehnt wird, auf MT940 zurückfallen.** Antwortet die Bank mit `3010
Kontonummer ist ungültig`, obwohl der Saldo desselben Kontos funktioniert, liegt es an
der Kontoverbindung: `HKCAZ` (CAMT) nutzt die internationale Variante, in der lib-fints
1.5.0 IBAN, BIC *und* die nationalen Felder zugleich füllt — die Spezifikation meint das
eine oder das andere, und manche Banken lehnen die Doppelbelegung ab. `HKKAZ` (MT940)
verwendet bis Segmentversion 6 die nationale Variante und läuft dann. Also
`preferCamt: false` erneut versuchen, statt ein leeres Ergebnis zu melden.

**Im Fork fragt die Bibliothek stattdessen die Bank.** `HISPAS.nationalAccountAllowed`
sagt, ob die nationalen Felder in der internationalen Kontoverbindung erlaubt sind; bei
`false` werden sie weggelassen. Gemessen an einem Institut, gleiche Sitzung, gleiches
Konto, gleicher Zeitraum:

```
IBAN + BIC + Nummer + Unterkonto + BLZ  →  3010 „Kontonummer ist ungültig", 0 Umsätze
IBAN + BIC                              →  0020 „Auftrag ausgeführt",      19 Umsätze
```

Der Rückfall bleibt trotzdem sinnvoll: nicht jede Bank erklärt ihre Ablehnung über
HISPAS. Nur die Prüfung, wann er greift, muss stimmen — siehe die Warnung zu `success`
unter *Rückmeldungen der Bank lesen*.

## Depot

`getPortfolio(konto, currency?, priceQuality?, maxEntries?)` liefert die Depotaufstellung
(MT535). Drei Dinge, die man dabei wissen muss:

**Die drei optionalen Argumente sind bankabhängig — und in 1.5.0 nicht erfragbar.** Der
Fork liest `HIWPDS` mit genau den drei Flags, die dazu passen:

```ts
const p = config.getTransactionParameters<{
  entryCountAllowed?: boolean;      // maxEntries
  currencySelectable?: boolean;     // currency
  priceQualitySelectable?: boolean; // priceQuality ('1' Echtzeit, '2' verzögert)
}>("HKWPD");
```

Sie sind dort **optional** deklariert, obwohl die aktuelle Spezifikation sie als Pflicht
führt: dieser Text beschreibt Version 6, und Banken antworten noch mit Version 5, deren
Feldliste nicht mehr publiziert ist. Ein Segment, das nicht dekodiert, ist schlimmer als
eines, das zu nichts dekodiert.

**Die Antwort heißt `portfolioStatement` — Einzahl und optional.** Fehlt sie, steht in
`rawMT535Data` die Rohnachricht: der Parser ist nicht durchgekommen. Das ist ein Befund
und kein leeres Depot, und die beiden auseinanderzuhalten ist der Unterschied zwischen
„nichts im Depot" und „wir konnten es nicht lesen".

**Die Datenform:**

```ts
interface StatementOfHoldings { totalValue?: number; currency?: string; holdings: Holding[] }
interface Holding {
  isin?; wkn?; name?;
  amount?: number;   // STÜCKZAHL, keine Summe — Fondsanteile sind gebrochen
  price?: number;    // Kursnotierung, oft vier Nachkommastellen
  value?: number;    // Wert in Euro als Fließkomma, wie `amount` bei Buchungen
  currency?; date?: Date;          // date: lokale Mitternacht, siehe unten
  acquisitionDate?: Date; acquisitionPrice?: number;
}
```

Wer intern mit Integer Cent rechnet: **`value` ist Geld, `amount` und `price` sind es
nicht.** Eine Stückzahl auf Cent zu runden ergibt keinen Sinn, ein Kurs mit vier
Nachkommastellen verliert dabei still an Genauigkeit. Der EINSTANDSWERT existiert nicht —
die Bank liefert nur den Einstands-*Kurs*; wer ihn will, multipliziert `amount × acquisitionPrice`
und rundet einmal, an genau einer Stelle.

Und: `StatementOfHoldings` trägt **kein Datum**. Der Stichtag steht an den Positionen
(`Holding.date`); fehlt er dort, bleibt nur der Abruftag.

## Die Datenformen — hier entstehen falsche Zahlen

Das ist der Abschnitt, der beim Übersetzen in ein eigenes Modell zählt.

**`amount` ist Euro als Fließkomma, nicht Cent.** Werte wie `-102.55`, `300`, `-8.37`.
Wer intern mit Integer-Cent rechnet, muss umrechnen — und `betrag * 100` erzeugt dabei
die üblichen Fließkomma-Reste. Über eine gerundete Umrechnung gehen und das Ergebnis
prüfen.

**Datumsfelder sind `Date`-Objekte auf lokaler Mitternacht.** In Mitteleuropa heißt
das `…T22:00:00.000Z` oder `T23:00:00.000Z`. Ein naives
`datum.toISOString().slice(0, 10)` liefert deshalb **den Vortag** — bei jeder Buchung,
lautlos, und verschiebt damit auch jede Monatsgrenze. Über die lokalen Bestandteile
gehen:

```ts
const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
```

**Mehrere typisierte Felder werden nie befüllt.** `remoteIdentifier` (Gläubiger-ID),
`mandateReference`, `e2eReference` und `bookingText` stehen im Typ `Transaction`,
bleiben aber leer. Die Angaben sind trotzdem da — sie stecken im Freitext von
`purpose`, in der Schreibweise des jeweiligen Instituts. Statt der genormten
Schlüssel `CRED+`/`MREF+`/`SVWZ+` liefern deutsche Institute oft Klartext-Etiketten
ohne Trennzeichen:

```
LASTSCHRIFT / BELASTUNGKESSELMANN - EINZUG 400271
END-TO-END-REF.:4002713CORE / MANDATSREF.:118304GLÄUBIGER-ID:DE98ZZZ09999999901Ref. 7A1B4
```

(Die Werte sind erfunden — Form und Verkettung sind echt. Ein Mitschnitt gehört
maskiert, bevor er irgendwo landet; siehe *Transport und Mitschnitt*.)

Herausparsen ist möglich, aber **institutsspezifisch**. Das gehört hinter eine eigene
Naht und muss optionale Anreicherung bleiben: greift das Muster nicht, fehlen
Zusatzfelder — der Import darf trotzdem durchlaufen. Ebenso klebt der Buchungstext
(MT940-Feld `:86:` Subfeld `?00`) vorn am Verwendungszweck.

Verlässlich gefüllt sind dagegen `valueDate`, `entryDate`, `amount`, `purpose`,
`transactionCode`, `customerReference`. `remoteName` fehlt gelegentlich,
`remoteAccountNumber` und `remoteBankId` sind oft leer — die Gegenpartei-IBAN ist
also keine sichere Größe.

Als Übersicht, wo die Typen etwas anderes versprechen, als ankommt:

```ts
interface Transaction {
  valueDate: Date;          // lokale Mitternacht → als UTC verschoben
  entryDate: Date;          // dito
  amount: number;           // EURO als Fließkomma, nicht Cent
  purpose?: string;         // enthält faktisch alles Textliche, unstrukturiert
  remoteName?: string;      // meist da
  remoteAccountNumber?: string;  // selten
  remoteBankId?: string;         // selten
  // typisiert, aber in der Praxis LEER — Inhalt steckt in `purpose`:
  bookingText?; remoteIdentifier?; mandateReference?; e2eReference?;
  primeNotesNr?; client?; textKeyExtension?; additionalInformation?;
}

type BankAccount = {
  accountNumber: string;    // NICHT zwingend eindeutig
  subAccountId?: string;    // erst zusammen mit der Nummer eindeutig
  iban?: string;            // fehlt z. B. bei Depots
  accountType: AccountType; // oft durchgehend "Miscellaneous"
  product?: string;         // die brauchbare Bezeichnung
};

type AccountBalance = { balance: number; /* … */ };  // das Feld heißt `balance`
interface StatementOfHoldings { totalValue?: number; currency?: string; /* … */ }
// totalValue ist eine Zahl mit getrenntem currency, kein Money-Objekt
```

## Rückmeldungen der Bank lesen

Jede Antwort trägt `bankAnswers: { code, text, params }[]`. Die auszuwerten ist kein
Luxus: `success` allein verschweigt, warum ein Ergebnis leer ist.

**`success` ist nicht „hat geklappt".** Die Bibliothek setzt es auf
`getHighestReturnCode() < 9000` (`interactions/customerInteraction.ts`). Eine Ablehnung
mit `3010 Kontonummer ist ungültig` liegt darunter — die Antwort ist also `success: true`
**mit leerer Ergebnisliste**. Wer den Rückfall auf MT940 an `!success` hängt, löst ihn
nie aus. Verlässlich ist nur das leere Ergebnis; der Code taugt danach für die Meldung,
nicht für die Entscheidung. `code` ist übrigens eine **Zahl**, kein String.

| Code | Bedeutung |
|---|---|
| `0010`, `0020` | angenommen / ausgeführt |
| `3010` | Kontonummer ungültig — meist die Kontoverbindung, siehe oben |
| `3050` | BPD/UPD veraltet, aktuelle Fassung liegt bei (harmlos) |
| `3060` | Sammelhinweis, dass Warnungen folgen |
| `3076` | starke Authentifizierung nicht nötig (PSD2-Ausnahme) |
| `3905` | Anfrage erneut senden |
| `3920` | Liste der verfügbaren TAN-Verfahren |
| `≥ 9000` | Fehler |

## Transport und Mitschnitt

`lib-fints` benutzt ausschließlich das **globale `fetch`** und bietet keinen eigenen
Injektionspunkt (`Dialog.getHttpClient()` konstruiert den `HttpClient` fest). Das ist
zugleich die einzige Naht:

```ts
const echtes = globalThis.fetch;
globalThis.fetch = async (url, init) => { /* mitschneiden oder umleiten */ };
```

Damit lässt sich der Verkehr aufzeichnen und in einer Desktop-Umgebung durch den
nativen HTTP-Weg leiten, ohne die Bibliothek zu verändern. Für einfaches Zusehen
reicht ihr eigener Schalter: `config.debugEnabled = true` bzw. `debug`/`debugRaw` am
`HttpClient`.

**Mitschnitte enthalten den kompletten Kontobestand** — Nummern, Namen, Beträge,
Verwendungszwecke — und die PIN im Klartext. Vor dem Schreiben maskieren, außerhalb
von Projektverzeichnissen ablegen, nach der Fehlersuche löschen. Roh sieht man
ohnehin nur vier Hüllsegmente: die Nutzdaten stecken im Binärblock des Segments
`HNVSD`, das trotz seines Namens unverschlüsselt ist. `scripts/fints-segmente.mjs`
packt das aus.
