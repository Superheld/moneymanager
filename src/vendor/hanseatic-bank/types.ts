/** Ein Konto samt Saldo. Bei Karten hängt die Karte mit dran. */
export interface Account {
  /** accountNumber der Bank — die Kennung für alle weiteren Aufrufe. */
  id: string
  holder: string
  iban: string
  productLabel: string
  balance: number
  currency: string
  card?: {
    limit: number
    /** noch verfügbarer Rahmen (otb) */
    available: number
    nameOnCard: string
    validUntil: string
  }
}

/**
 * Eine Buchung.
 *
 * Umsatz- und Buchungsdatum liegen bis zu sechs Tage auseinander und fallen damit über
 * Monatsgrenzen — deshalb kommen beide heraus. Der Zeitraumfilter greift auf
 * `bookingDate`, weil allein dieses Datum monoton fällt.
 */
export type TransactionType =
  | 'card'         // Kartenumsatz (KARTEN-UMS.) — trägt als einziger eine Kennung
  | 'directDebit'  // Lastschrifteinzug (LS-EINZUG), z. B. die monatliche Abrechnung
  | 'transfer'     // Überweisung (UEBERWEISUNG)
  | 'other'        // von der Bank so nicht beobachtet

export interface Transaction {
  /**
   * Kennung der Bank — **nur bei Kartenumsätzen vorhanden**.
   *
   * Lastschriften und Überweisungen kommen mit leerem Feld (gemessen). Wer darauf
   * dedupliziert, muss diesen Fall abfangen: für Buchungen ohne Kennung bleibt nur
   * eine Kombination aus `bookingDate`, `amount` und `description`.
   */
  id?: string
  /** Art der Buchung — erklärt unter anderem, ob eine Kennung zu erwarten ist. */
  type: TransactionType
  /** Buchungsdatum, ISO-8601. */
  bookingDate: string
  /** Umsatzdatum, ISO-8601 (nur Datum). */
  purchaseDate: string
  /** Uhrzeit des Umsatzes, `HH:MM`, sofern die Bank sie mitliefert. */
  purchaseTime?: string
  /** Vorzeichenbehaftet: Ausgaben negativ, Eingänge positiv. */
  amount: number
  currency: string
  direction: 'debit' | 'credit'
  description: string
  /** false bei Vormerkungen, die noch kippen können. */
  booked: boolean
  merchant?: {
    name: string
    category?: string
    mcc?: string
    city?: string
    country?: string
  }
}

export interface TransactionPage {
  transactions: Transaction[]
  /** Buchungsdatum der ältesten erreichten Buchung, ISO — leer, wenn nichts kam. */
  oldestReached: string
  /**
   * false, wenn die Historie der Bank nicht so weit zurückreicht wie `from` verlangt.
   * Dann ist die Antwort vollständig für das, was es gibt — aber nicht für den Zeitraum.
   */
  reachedFrom: boolean
}

export interface StatementMeta {
  id: number
  type: string
  created: string
  read: string
  accountId: string
}

export interface StatementList {
  statements: StatementMeta[]
  /** true, wenn hinter einer Bestätigung mehr liegt. */
  hasMoreBehindSca: boolean
}

export interface Credentials {
  /** 10-stellige Anmeldekennung. */
  loginId: string
  password: string
}
