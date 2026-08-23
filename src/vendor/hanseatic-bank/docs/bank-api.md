# Die API der Hanseatic Bank

Was die Bank tut — nicht, was wir anbieten (das steht in [api.md](api.md)).

**Alles hier ist gemessen**, nicht abgeleitet: mitgeschnitten aus echten Sitzungen über
das Chrome DevTools Protocol und anschließend aus der Library heraus nachgeprüft. Es
gibt keine Dokumentation der Bank, keine öffentliche Spezifikation und keine Zusicherung,
dass irgendetwas davon morgen noch gilt. Wo etwas **nicht** gemessen ist, steht das
ausdrücklich dabei — siehe „Was nicht gemessen ist" am Ende.

Hanseatic Bank bietet **kein FinTS/HBCI** an (telefonisch bestätigt: weder verfügbar
noch geplant). Diese private Schnittstelle ist der einzige strukturierte Zugang.

Basis-URL: `https://connecthb.hanseaticbank.de`
Die Weboberfläche, aus der die Zugangsdaten stammen: `https://meine.hanseaticbank.de`

Alle Aufrufe brauchen CORS-Preflight (`OPTIONS`), wenn sie aus einem Browser kommen —
für einen Node-Client ist das ohne Belang.

## Zwei OAuth-Clients

Der Token-Endpoint unterscheidet zwei Clients. Sie zu verwechseln ist der teuerste
Fehler in dieser API, weil die Fehlermeldung nicht darauf hinweist.

**Page-Client** — steht im Klartext im HTML von `meine.hanseaticbank.de` als
`NORTHLAYER_CLIENT_KEY` und `NORTHLAYER_CLIENT_SECRET`. Zugelassen ausschließlich für
`client_credentials`. Zur Laufzeit auslesbar, damit er nicht fest verdrahtet werden muss.

**Login-Client** — ein getrenntes Basic-Credential, zugelassen für den Grant
`hbSCACustomPassword`. **Nicht** im Klartext auf der Seite; in einem JS-Chunk
verschleiert. Über zwei Aufzeichnungen zu verschiedenen Zeitpunkten identisch, rotiert
also nicht.

Der Login-Client ist ein bewusst nicht-öffentliches Geheimnis der Bank und gehört
deshalb **nicht** in dieses Repo. Er ist Konfiguration; das mitgelieferte Werkzeug hebt
ihn aus dem eigenen Mitschnitt des Nutzers.

## Anmeldung

### Schritt 1 — Passwort-Grant

```http
POST /token
Authorization: Basic <login-client>
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
devicetoken: <64 hex>          ← nur wenn ein gemerktes Gerät vorliegt

grant_type=hbSCACustomPassword&loginId=<10 Ziffern>&password=<…>
```

Zwei mögliche Antworten:

- `{ id_token }` — starke Authentifizierung nötig. Weiter mit Schritt 2.
- `{ access_token, refresh_token, scope, token_type, expires_in }` — das Gerätetoken
  wurde akzeptiert, fertig. `expires_in` ist `3600`, `scope` ist `default`.

`id_token` ist ein JWT. Aus dem Payload werden gebraucht: **`sub`** (die 10-stellige
Kundennummer) und **`sca_id`**.

Ein zuvor gemerktes Gerät kann seine Gültigkeit verlieren — dann kommt trotz
mitgesendetem `devicetoken` wieder ein `id_token`. Das ist beobachtet, die Ursache ist
unbekannt.

### Schritt 2 — Bootstrap-Token für den Login-Broker

```http
POST /token
Content-Type: application/x-www-form-urlencoded; charset=UTF-8

grant_type=client_credentials&client_id=<page-key>&client_secret=<page-secret>
```

→ `{ access_token, scope, token_type, expires_in }` — `expires_in` ist hier **1783**,
nicht 3600. Dieses Token taugt nur für den Statusabruf in Schritt 3.

### Schritt 3 — Login-Broker abfragen

```http
GET /openScaBroker/1.0/customer/{sub}/status/{sca_id}
Authorization: Bearer <bootstrap-token>
```

→ `{ scaUniqueId, status, scaType, startTime, initiator, language, resultData,
     resultCode, case }`

`status` ist `open`, bis der Nutzer in der Secure-App bestätigt, dann `complete`.
`scaType` ist `APP`. `resultCode` ist `0` solange offen und `200` bei `complete`.

**Takt: 5 Sekunden** (erste Abfrage ~1 s nach dem `id_token`). So macht es die
Weboberfläche; in zwei Messungen war binnen weniger Sekunden bestätigt.

Bei `complete` steht in `resultData.DEVICETOKEN` ein 64-stelliges Gerätetoken. Es zu
speichern ist der einzige Weg, den nächsten Login ohne Handy zu bekommen.

### Schritt 4 — Das eigentliche Zugangstoken

```http
POST /token
Authorization: Basic <login-client>
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
devicetoken: <DEVICETOKEN aus Schritt 3>

grant_type=hbSCACustomPassword&loginId=<…>&password=<…>
```

→ `{ access_token, refresh_token, scope, token_type, expires_in: 3600 }`

Dieses `access_token` trägt **alles** Weitere: Kundendaten, Umsätze, Postfach,
Freischaltung. Es gibt kein zweites Token zu verwalten.

*Nicht gemessen:* die Verwendung des `refresh_token`. Der Aufruf ist in keiner
Aufzeichnung aufgetaucht.

## Bestätigung (SCA)

`scaBroker/1.0` ist ein **allgemeiner** Bestätigungsdienst, kein Endpoint für einen
einzelnen Zweck. Verschiedene Vorgänge werden verschieden eingereicht, der Status wird
für alle gleich abgefragt.

### Historie und Postfach freischalten

```http
POST /scaBroker/1.0/session
Authorization: Bearer <access_token>
Content-Type: application/json

{ "initiator": "ton-sca-fe", "lang": "de", "session": "Bearer <access_token>" }
```

Das Feld `session` ist wörtlich die Zeichenkette `"Bearer "` plus das Zugangstoken —
im JSON-Rumpf, zusätzlich zum gleichlautenden Header.

### Status abfragen (für alle Vorgänge)

```http
GET /scaBroker/1.0/status/{scaUniqueId}
Authorization: Bearer <access_token>
```

Der Status durchläuft:

```
open  →  accepted  →  complete
```

`accepted` ist ein echter Zwischenzustand, nicht das Ende. Abbruchkriterium ist
`status === "complete"` (bzw. `resultCode === 200`) — **nicht** „nicht mehr `open`".
Takt: 5 Sekunden.

Die Freischaltung wirkt serverseitig am Zugangstoken und gilt für Umsätze **und**
Postfach gleichzeitig. Das Token selbst ändert sich dabei nicht; die vorher schon
möglichen Aufrufe liefern danach einfach mehr.

## Kundendaten und Konten — ohne SCA

```http
POST /customerinfo/1.0/initCustomer
Authorization: Bearer <access_token>
Content-Type: application/json

{ "initiator": "MHB", "language": "de" }
```

`initiator` muss `MHB` sein; `WEB` wird mit 422 abgewiesen.

```jsonc
{
  "customer": { "title", "firstname", "lastname", "street", "houseNumber", "zipcode",
                "city", "birthName", "phone", "mobile", "email", "sex", "birthday",
                "isHanseaticBankEmployee", "isCompanyRelated" },
  "accounts": {
    "creditAccounts": [{
      "customerNumber", "accountHolder", "accountNumber", "iban", "bic", "status",
      "saldo": 0.0, "openingDate", "referenceDate", "productLabel", "conditionGroup",
      "productType", "productClass",
      "creditcard": { "status", "limit": 0.0, "repayment", "contractNumber", "tpan",
                      "validUntil", "nameOnCard", "otb": 0.0, "turnover" },
      "referenceAccount": { "iban", "bic", "bankName", "bankShortName" },
      "transferFee": 0.0
    }],
    "overnightAccounts": [], "loanAccounts": [], "savingsAccounts": []
  },
  "featureFlags": [],
  "settings": { "primaryCreditcard", "initialAppLogin", "needsAddressConfirmation" }
}
```

`accountNumber` (10-stellig) ist die Kennung, mit der Umsätze adressiert werden.
`saldo` ist der Saldo; bei Karten sind `limit` und `otb` (verfügbarer Rahmen) relevant.

*Nur `creditAccounts` wurde je gefüllt beobachtet* — der Testzugang hat ausschließlich
ein Kreditkartenkonto. Für Tagesgeld-, Kredit- und Sparkonten ist nichts gemessen; ob
`transactionsEnriched` auch für sie gilt, ist unbekannt.

Daneben existiert `GET /customerinfo/1.0/customerData?skipCache=…` → `{ customer,
accounts }`, inhaltlich gleich, ohne Rumpf. Die Weboberfläche ruft es nach jeder
Änderung zum Aktualisieren auf. Ob es `initCustomer` ersetzen kann, ist nicht gemessen.

## Umsätze

```http
GET /transaction/1.0/transactionsEnriched/{accountNumber}?page=1&withReservations=true&withEnrichments=true
Authorization: Bearer <access_token>
```

```jsonc
{
  "transactions": [{
    "transactionId", "transactionDate", "transactionTime", "date", "transactionDateTime",
    "accountingMonth", "amount": 0.0, "creditDebitKey", "creditDebitKeyPhraseCompatible",
    "booked": true, "description", "currencyCode": 978, "merchantName",
    "merchantData": { "id", "name", "website", "img", "categoryImg", "category",
                      "categories", "streetName", "houseNumber", "city", "postalCode",
                      "latitude", "longitude", "mcc", "merchant_name", "country",
                      "requestId", "requestTimestamp" },
    "location", "city", "postcode", "country", "mcc",
    "recipientBic", "recipientIban", "recipientName", "creditorID", "mandateReference",
    "conversionRate", "foreignAmount", "posTransaction": false
  }],
  "more": false,
  "moreWithSCA": true
}
```

`page` zählt ab 1. `currencyCode` 978 ist EUR. Gesehene `creditDebitKey`-Werte:
`KARTEN-UMS.`, `LS-EINZUG`, `UEBERWEISUNG`.

**`amount` trägt das Vorzeichen selbst.** Kartenumsätze und abgehende Überweisungen
sind negativ, der Lastschrifteinzug zur Tilgung ist positiv. Eine Übersetzung über
`creditDebitKey` ist unnötig — und wäre die schlechtere Wahl, weil sie bei jedem neuen
Schlüsselwert der Bank stillschweigend falsch läge.

**`transactionId` gibt es nur bei Kartenumsätzen.** Bei `LS-EINZUG` und `UEBERWEISUNG`
ist das Feld ein leerer String; ebenso fehlt dort `transactionTime`, und
`posTransaction` ist nur bei Kartenumsätzen gesetzt (`true`). Wer Buchungen anhand der
Kennung abgleicht, braucht für die übrigen Arten einen anderen Weg.

**`more` gegen `moreWithSCA`** ist die zentrale Unterscheidung: Ohne Freischaltung kam
Seite 1 verkürzt und mit `more: false, moreWithSCA: true` — „es gibt mehr, aber nur
mit Bestätigung". Nach der Freischaltung lieferte dieselbe Seite 1 die volle Seite (25 Einträge)
mit `more: true`, und `page=2` funktionierte.

### Die Datumsfelder

| Feld | Bedeutung |
|---|---|
| `transactionDate` + `transactionTime` | Umsatzdatum und -uhrzeit — wann gekauft wurde |
| `date` | **Buchungsdatum** — wann es aufs Konto lief |
| `transactionDateTime` | dasselbe Buchungsdatum als ISO-8601, Zeit stets `00:00:00` |
| `accountingMonth` | Abrechnungsmonat, fällt oft in den Folgemonat |

`date` ist immer ≥ `transactionDate`, im Maximum um einige Tage. **Die Liste ist nach `date`
absteigend sortiert**; `transactionDate` fällt nicht monoton. Wer rückwärts blättert und
bei einem Datum abbrechen will, muss auf `date`/`transactionDateTime` prüfen.

Felder sind nicht durchgängig vorhanden: `transactionTime` fehlte auf Seite 2 als
Schlüssel vollständig.

### Wie weit die Historie reicht

Mit Freischaltung blättert `page` weiter, bis `more: false` kommt. Im gemessenen Fall
endete die Historie nach **gut einem Jahr**. Ob die Bank dort abschneidet oder ob es
schlicht nichts Älteres gab, lässt sich an einem einzelnen Konto nicht unterscheiden.

Ältere Vorgänge existieren nur als Kontoauszug im Postfach — und die taugen nicht als
Umsatzquelle, weil sie der Buchungslage einen Monat hinterherhinken.

Es gibt **keine Detailansicht** einer Buchung — die Oberfläche zeigt beim Aufklappen nur
Felder, die die Liste bereits enthält.

## Postfach und Kontoauszüge

```http
GET /postbox/1.0/messages/stats     → { unread: 0, older90Days: { "<accountNumber>": bool, other: bool } }
GET /postbox/1.0/messages           → [ { id, loginId, accountId, type, created, read } ]
GET /postbox/1.0/messages/{id}      → { id, loginId, accountId, type, created, read,
                                        body: { mimeType: "application/octet-stream",
                                                content: "<base64>" } }
```

`older90Days` ist nach Kontonummer **als Objektschlüssel** aufgebaut.

Ohne Freischaltung erscheinen nur die jüngsten Nachrichten,
und diese lassen sich auch **öffnen und herunterladen**, ohne Bestätigung. Nach der
Freischaltung erscheint ein Vielfaches, mehrere Jahre zurück und damit weiter, als die
Umsatz-API reicht. `stats` zählt unabhängig von der Freischaltung und meldet deshalb
mehr, als die ungefreischaltete Liste enthält.

Das Dokument steckt base64-kodiert in `body.content` (einige hundert Kilobyte) — kein separater
Binärdownload.

## Abmeldung

**Im Leerlauf passiert nichts.** Über mehrere Minuten mit offener, unbenutzter Sitzung
ging kein einziger Aufruf an die Bank — kein Keepalive, kein vorsorgliches Erneuern,
kein Polling. Es ist also nichts am Leben zu halten; das Zugangstoken lebt seine 3600
Sekunden unabhängig davon, ob jemand es benutzt.

**Eine Abmeldung gibt es nicht.** Die Aufzeichnung eines Abmeldevorgangs enthält keinen `/revoke`,
keinen `/logout`, kein `DELETE` und keinen Aufruf an einen Auth-Host. Die Oberfläche
verwirft das Token lokal und wechselt zur Anmeldeseite. Das Token läuft nach 3600 s
von selbst ab.

## Schreibende Endpoints

Dokumentiert, damit das Wissen nicht verloren geht — **von dieser Library nicht
benutzt**. Sie stehen hier, weil das Wissen sonst verloren ginge.

```http
POST /repayment/1.0/{accountNumber}              { newPaymentRate }  → 202 { requestId }
GET  /repayment/1.0/{accountNumber}/{requestId}  → { requestId, status, newPaymentRate }
POST /scaBroker/1.0/fundstransfer                { iban, amount, lang, initiator }
PUT  /pairingSecureApp/1.0/activateCreditCards   → { activated: true }
```

Die Ratenänderung läuft **ohne** Bestätigung, die Überweisung mit. `activateCreditCards`
feuert die Weboberfläche nach jedem Login ungefragt zweimal ab; seine Wirkung ist
unbekannt, und die Library löst ihn nicht aus.

## Weitere gesehene Endpoints

Ohne Bedeutung für diese Library, der Vollständigkeit halber:

- `GET /CTCManagerService/1.0/transactionsControls?tpan&accountNr&contractId` —
  Kartenlimits (`global`, `ecommerce`, `atm`, `autopay`, `crossborder`,
  `fundstransfer`, `contactless`, `maxLimits`, `isCreditCardLockAllowed`)
- `GET /customermobilenumberservice/1.0/get`
- `GET /customerportal/1.0/sales/widerruf/products`
- `GET /scaBroker/1.0/transaktpairing/pairingTimestamp`

## Was nicht gemessen ist

Diese Punkte sind offen. Sie stehen hier, damit niemand sie für geklärt hält.

- **Erneuerung des Zugangstokens.** Ein `refresh_token` wird ausgegeben, der zugehörige
  Aufruf ist nie beobachtet worden. Eine Messung verlangt eine Sitzung, die länger als
  eine Stunde offen bleibt und danach noch etwas abruft.
- **Lebensdauer des Gerätetokens.** Ein zuvor gemerktes Gerät verlangte in einem Fall
  wieder eine Bestätigung. Ob das an Ablauf, gelöschtem Browserspeicher oder etwas
  anderem lag, ist unklar. Ein Client muss damit rechnen, dass Schritt 1 trotz
  mitgesendetem `devicetoken` ein `id_token` zurückgibt.
- **Andere Kontoarten.** Gemessen wurde ausschließlich an einem Kreditkartenkonto. Für
  Tagesgeld-, Kredit- und Sparkonten kamen stets leere Listen; ob `transactionsEnriched`
  für sie überhaupt zuständig ist, ist unbekannt.
- **Ob die Historie an dieser Grenze abschneidet** oder das Konto schlicht nicht älter ist.
- **Ob `customerData` den Aufruf `initCustomer` ersetzen kann.** Die Weboberfläche ruft
  beides auf, `initCustomer` zuerst.
