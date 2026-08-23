# Öffentliche API der Library

Was **wir** anbieten. Was die Bank tut — und was an ihr ungeklärt blieb — steht in
[bank-api.md](bank-api.md).

## Leitgedanken

**Das Handy klingelt nie von selbst.** Kein Aufruf löst unaufgefordert eine
Bestätigung aus. Was ohne Bestätigung geht, geht sofort; was nicht, wirft — bis
`elevate()` gelaufen ist. Der Aufrufer sieht damit in seinem eigenen Code, an welcher
Stelle eine Bestätigung fällt, statt es an der Reaktion des Telefons zu merken.

**Echte Daten, keine Maskierung.** Diese Library trägt Salden und Umsätze in die
aufrufende Anwendung. Das ist ihr Zweck.

**Nur lesen.** Die Bank kann über dieselbe Schnittstelle Geld überweisen und Verträge
ändern (siehe [bank-api.md](bank-api.md)). Wir tun das nicht.

**Typen sind bereinigt.** Was herauskommt, ist nicht das rohe JSON der Bank, sondern
eine aufgeräumte Form. Die Zuordnung passiert in einer Schicht, damit eine Änderung der
Bank an einer Stelle auffängt.

## HanseaticClient

```typescript
class HanseaticClient {
  constructor(config: { clientBasic: string; store?: StateStore })

  // --- Anmeldung ---
  login(creds: { loginId: string; password: string },
        opts?: { onChallenge?: () => void }): Promise<void>
  logout(): void
  get isLoggedIn(): boolean

  // --- Lesen ---
  getAccounts(): Promise<Account[]>

  getTransactions(accountId: string, range?: { from?: Date; to?: Date }):
    Promise<TransactionPage>

  getStatements(): Promise<{ statements: StatementMeta[]; hasMoreBehindSca: boolean }>
  getStatement(id: number): Promise<{ mimeType: string; bytes: Uint8Array }>

  // --- Bestätigung ---
  elevate(opts: { onConfirm: () => void }): Promise<void>
  get isElevated(): boolean

  // --- Sync-Fassade (siehe unten) ---
  syncBalances(): Promise<Account[]>
  syncSince(accountId: string, since: Date): Promise<TransactionPage>
  syncAll(accountId: string): Promise<TransactionPage>
}
```

### login

Führt den vierstufigen Ablauf aus. Liegt im Speicher ein Gerätetoken, läuft er stumm
durch. Sonst wird `onChallenge` **einmal** aufgerufen, damit der Aufrufer den Nutzer auf
die Secure-App hinweisen kann; danach wird im 5-Sekunden-Takt abgefragt. Das dabei
gewonnene Gerätetoken wird über den `StateStore` abgelegt, sodass der nächste Login ohne
Handy auskommt.

Ein gemerktes Gerät kann ungültig werden — dann verlangt die Bank trotz Gerätetoken
wieder eine Bestätigung. Das ist kein Fehler, sondern der normale Ablauf: `onChallenge`
feuert dann eben doch.

### logout

Verwirft das Zugangstoken im Speicher. Mehr ist nicht möglich — die Bank kennt keine
serverseitige Abmeldung. Das Gerätetoken bleibt erhalten; es zu löschen ist Sache des
Aufrufers über den `StateStore`.

### getTransactions

Der einzige Weg zu Umsätzen. Es gibt bewusst **keine** getrennten Methoden für
„die neuesten", „ein Zeitraum" und „alle": es ist derselbe Vorgang mit einem anderen
Beginn — oder ohne.

```typescript
getTransactions(id, { from: seit })            // ab einem Tag
getTransactions(id, { from: a, to: b })        // ein Zeitraum
getTransactions(id)                            // alles, was die Bank hergibt
```

**Ohne Angabe wird bis ans Ende der Historie geblättert.** Das braucht praktisch immer
eine Freischaltung — ohne sie sind nur die jüngsten Buchungen erreichbar, und der Aufruf
wirft `not_elevated`. `reachedFrom` ist dann `true`, sobald die Bank nichts mehr hat:
Die Frage war „alles", und alles ist da.

Gelesen wird von der neuesten Buchung rückwärts, Seite für Seite, bis das
**Buchungsdatum** unter `from` fällt. Der Schnitt geht auf das Buchungsdatum, weil
allein dieses monoton fällt — mit dem Umsatzdatum wäre das Abbruchkriterium löchrig
(siehe [bank-api.md](bank-api.md)).

Reicht `from` weiter zurück, als ohne Bestätigung erreichbar ist, wirft die Methode
`HanseaticError` mit `not_elevated`, **bevor** Daten zurückkommen. Der Aufrufer ruft
dann `elevate()` und danach dieselbe Methode erneut. Es gibt keine halbe Antwort.

```typescript
interface TransactionPage {
  transactions: Transaction[]
  /** Buchungsdatum der ältesten tatsächlich erreichten Buchung, ISO. */
  oldestReached: string
  /** false, wenn die API nicht so weit zurückreicht wie `from` verlangt. */
  reachedFrom: boolean
}
```

`reachedFrom` ist genau dann `true`, wenn eine Buchung **vor** `from` gesehen wurde —
erst das beweist, dass der Zeitraum lückenlos abgedeckt ist. Endet die Historie vorher,
bleibt es `false`, auch wenn alles Verfügbare geliefert wurde. „Alles, was zu haben war"
ist nicht dasselbe wie „der Zeitraum ist abgedeckt", und nur der zweite Fall darf als
vollständig gelten.

`reachedFrom: false` ist damit die ehrliche Kante: Die Umsatzhistorie der Bank endete im
gemessenen Fall nach gut einem Jahr. Wer weiter zurück will, bekommt das gesagt, statt stillschweigend
weniger zu erhalten. Ältere Vorgänge gibt es nur als Kontoauszug — und die sind keine
Umsatzquelle, weil sie der Buchungslage einen Monat hinterherhinken.

### getStatements / getStatement

Die neuesten Auszüge sind **ohne** Bestätigung abrufbar und auch herunterladbar; die
vollständige Liste (mehrere Jahre zurück) verlangt `elevate()`. Deshalb wirft `getStatements`
nicht, sondern liefert, was zugänglich ist, und meldet über `hasMoreBehindSca`, dass
mehr dahinterliegt.

Der Unterschied zu `getTransactions` ist beabsichtigt: Dort ist ein Zeitraum das Ziel,
und ein unvollständiger Zeitraum wäre eine falsche Antwort. Hier ist die Liste selbst
das Ziel, und eine kurze Liste ist eine richtige Antwort auf einen nicht
freigeschalteten Zustand.

`getStatement` liefert die entpackten Bytes des PDF. Die Library liest den Inhalt
nicht aus.

### elevate

Reicht die Freischaltung beim Bestätigungsdienst ein und fragt den Status ab, bis er
`complete` erreicht. `onConfirm` feuert einmal, sobald das Handy klingelt.

Eine Freischaltung öffnet Umsätze **und** Postfach gleichzeitig; sie hängt am
Zugangstoken und gilt, bis dieses abläuft.

Wichtig für die Umsetzung: Abgebrochen wird bei `complete`, nicht bei „nicht mehr
`open`" — dazwischen liegt `accepted`.

## Sync-Fassade

Zwei Namen für Vorgänge, die es oben schon gibt:

```typescript
syncBalances()                  // ruft getAccounts()
syncSince(accountId, since)     // ruft getTransactions(accountId, { from: since })
syncAll(accountId)              // ruft getTransactions(accountId)
```

Sie existieren, weil eine Finanzverwaltung in „sync" denkt und nicht in „get". Es sind
**Aliase, keine zweite Ebene** — sie halten keinen eigenen Zustand, treffen keine
eigenen Entscheidungen und verhalten sich in allem wie der Aufruf, den sie weiterreichen,
Fehler eingeschlossen. Wer lieber `getAccounts()` schreibt, verliert nichts.

Wächst hier irgendwann Logik hinein — Wiederholungsversuche, Zusammenführen, Merken
eines Standes —, dann ist das eine bewusste Entscheidung und gehört begründet. Solange
das nicht passiert, bleibt es bei der Weiterleitung.

**`syncDelta()` gibt es nicht.** Ein Abgleich „alles seit dem zuletzt gesehenen Umsatz"
setzt voraus, dass dieser Umsatz auf Seite 1 wieder auftaucht. Das ist nicht
verlässlich: Ohne Bestätigung liefert Seite 1 nur einen Ausschnitt, und eine Vormerkung
kann zwischenzeitlich zu einer gebuchten Umsatzzeile mit anderer Kennung geworden sein.
Ein Abgleich, der den Anker verfehlt, reißt stillschweigend ein Loch in die Historie.
Ein Datum als Grenze hat dieses Problem nicht.

## Einbetten in fremde Software

Die Bibliothek liest **keine** Umgebungsvariablen und schreibt **keine** Dateien. Alles,
was sie braucht, kommt über Parameter herein; alles, was sie behalten muss, geht über
den `StateStore` hinaus. Damit bestimmt die einbettende Anwendung, wo Zugangsdaten
liegen und wie sie gespeichert werden — die Bibliothek trifft dazu keine Annahme.

Die `.env`-Datei aus dem README gehört zur mitgelieferten Kommandozeile, nicht zur
Bibliothek.

```typescript
import { HanseaticClient, HanseaticError, type StateStore } from 'hanseatic-bank'

// Persistenz nach eigenem Geschmack — Datenbank, Schlüsselbund, Konfigurationsdatei.
class MeinStore implements StateStore {
  async getDeviceToken (loginId: string) {
    return await db.get(`hanseatic:device:${loginId}`) ?? null
  }
  async setDeviceToken (loginId: string, token: string) {
    await db.set(`hanseatic:device:${loginId}`, token)
  }
}

const client = new HanseaticClient({
  clientBasic: konfig.clientBasic,
  store: new MeinStore(),
})

await client.login(
  { loginId: konfig.loginId, password: konfig.password },
  { onChallenge: () => ui.zeige('Bitte in der Secure-App bestätigen …') },
)
```

Eine Instanz je Abgleichlauf ist der Normalfall. Anmelden kostet mit gemerktem Gerät
etwa eine Sekunde und einen Aufruf; einen Client über Stunden offen zu halten bringt
nichts, weil das Zugangstoken ohnehin nach einer Stunde abläuft.

### Zwei Dinge, die die einbettende Anwendung tragen muss

**Das Gerätetoken muss dauerhaft gespeichert werden.** Ohne eigenen `StateStore` greift
der Standard `MemoryStore`, und der vergisst alles beim Prozessende — dann verlangt die
Bank bei **jedem** Lauf eine Bestätigung im Handy. Für einen automatischen Abgleich ist
das der Unterschied zwischen „läuft" und „läuft nicht". Das Gerätetoken ersetzt die
Bestätigung und gehört entsprechend behandelt: wie ein Passwort.

**Die Client-Kennung muss der Nutzer einmal einrichten.** Sie ist nicht Teil des Pakets
(Begründung im README). Die einbettende Anwendung braucht dafür einen Einrichtungsschritt
— entweder ruft sie `hanseatic extract-client <datei.har>` auf, oder sie führt den
Nutzer selbst durch die einmalige Anmeldung im Browser. Ohne diesen Schritt ist die
Bibliothek nicht benutzbar, und das sollte in der Einrichtung stehen, nicht als
Fehlermeldung beim ersten Abgleich auftauchen.

### Fehler, die behandelt werden wollen

```typescript
try {
  await client.getTransactions(id, { from: seit })
} catch (fehler) {
  if (!(fehler instanceof HanseaticError)) throw fehler
  switch (fehler.code) {
    case 'not_elevated':  /* elevate() anbieten, dann erneut */ break
    case 'token_expired': /* neu anmelden */ break
    case 'sca_timeout':   /* Nutzer hat nicht bestätigt */ break
    case 'grant_rejected':/* Zugangsdaten oder Client-Kennung stimmen nicht */ break
    case 'account_locked':/* Bank verweigert den Zugriff */ break
  }
}
```

## Referenzimplementierung

Das Herkunfts-Repository enthaelt hier zwei vollstaendige Aufrufer: ein Beispiel fuer
einen Abgleichlauf ohne Menschen davor, und die Kommandozeile. **Beide sind in diesem
eingebetteten Stand nicht
enthalten** — die Kommandozeile zieht `node:fs` und laeuft im Webview nicht, und ohne sie
haengt auch das Beispiel in der Luft. Wer sie lesen will, findet sie dort; siehe die
`CLAUDE.md` neben diesem Ordner.

## Typen

```typescript
interface Account {
  id: string              // accountNumber, die Kennung für alles Weitere
  holder: string
  iban: string
  productLabel: string
  balance: number
  currency: string
  card?: { limit: number; available: number; nameOnCard: string; validUntil: string }
}

type TransactionType = 'card' | 'directDebit' | 'transfer' | 'other'

interface Transaction {
  /** Kennung der Bank — nur bei Kartenumsätzen vorhanden, siehe unten. */
  id?: string
  /** Art der Buchung. */
  type: TransactionType
  /** Buchungsdatum, ISO. Hierauf greift der Zeitraumfilter. */
  bookingDate: string
  /** Umsatzdatum, ISO — einige Tage vor dem Buchungsdatum. */
  purchaseDate: string
  /** Uhrzeit des Umsatzes, sofern die Bank sie mitliefert. */
  purchaseTime?: string
  amount: number          // vorzeichenbehaftet
  currency: string
  direction: 'debit' | 'credit'
  description: string
  booked: boolean
  merchant?: { name: string; category?: string; mcc?: string
               city?: string; country?: string }
}

interface StatementMeta {
  id: number
  type: string
  created: string
  read: string
  accountId: string
}

interface StateStore {
  getDeviceToken(loginId: string): Promise<string | null>
  setDeviceToken(loginId: string, token: string): Promise<void>
}

class HanseaticError extends Error {
  code: 'not_logged_in' | 'not_elevated' | 'sca_timeout' | 'account_locked'
      | 'token_expired' | 'grant_rejected' | 'http'
}
```

**Die Kennung fehlt bei Nicht-Kartenumsätzen.** Gemessen: Nur `KARTEN-UMS.` trägt eine
`transactionId`; Lastschriften und Überweisungen kommen mit leerem Feld. Deshalb ist
`id` optional — ein leerer String wäre schlimmer als nichts, weil er wie ein Wert
aussieht und bei jeder solchen Buchung derselbe ist.

Für die aufrufende Anwendung heißt das: Wer über die Kennung dedupliziert, braucht einen
zweiten Weg für Buchungen ohne sie. Tragfähig ist die Kombination aus `bookingDate`,
`amount` und `description` — die Bank bietet nichts Stabileres an. `type` sagt vorher,
welcher Fall vorliegt.

**Beide Daten**, nicht eins: Die Differenz zwischen Umsatz und Buchung reicht über mehrere
Tage und fällt damit über Monatsgrenzen. Eine Finanzverwaltung ordnet meist nach Umsatzdatum
zu, gleicht aber nach Buchungsdatum ab — sie braucht beides.

Felder außerhalb des Kerns sind optional, weil die Bank sie nicht durchgängig liefert:
`transactionTime` fehlte auf Seite 2 als Schlüssel vollständig.

## Was die Library nicht tut

**Kein Speicher außer dem Gerätetoken.** Der `StateStore` hält genau das, was sonst
niemand halten kann. Ein Cursor für den nächsten Abgleich gehört nicht dazu: Der
Aufrufer sagt mit `from` ohnehin, ab wann er lesen will, und er weiß besser als wir,
was er schon importiert hat. Doppelte erkennen, planen, dauerhaft speichern — Sache der
aufrufenden Anwendung.

**Kein Erneuern des Tokens.** Ein `refresh_token` kommt zurück, aber sein Gebrauch ist
nie beobachtet worden. Auf 401 kommt `token_expired`, und der Aufrufer meldet sich neu
an. Etwas Ungemessenes zu implementieren wäre geraten, nicht gewusst.

**Kein Schreiben.** Keine Überweisung, keine Ratenänderung, kein
`activateCreditCards` — auch nicht das, was die Weboberfläche von sich aus tut.

**Kein Auslesen von PDF.** Auszüge kommen als Bytes heraus.
