/**
 * Die Formen, wie die Bank sie liefert — unverändert, mit ihren Schreibweisen.
 *
 * Nichts davon verlässt die Library: `map.ts` übersetzt in die Typen aus `types.ts`.
 * Alles ist optional, weil die Bank Felder je nach Buchungsart und Seite weglässt —
 * `transactionTime` fehlt auf Folgeseiten sogar als Schlüssel (docs/bank-api.md).
 */

export interface RawCreditAccount {
  customerNumber?: string
  accountHolder?: string
  accountNumber?: string
  iban?: string
  bic?: string
  status?: string
  saldo?: number
  openingDate?: string
  referenceDate?: string
  productLabel?: string
  conditionGroup?: string
  productType?: string
  productClass?: string
  creditcard?: {
    status?: string
    limit?: number
    repayment?: string
    contractNumber?: string
    tpan?: string
    validUntil?: string
    nameOnCard?: string
    otb?: number
    turnover?: string
  }
  referenceAccount?: { iban?: string, bic?: string, bankName?: string, bankShortName?: string }
  transferFee?: number
}

export interface RawInitCustomer {
  customer?: Record<string, unknown>
  accounts?: {
    creditAccounts?: RawCreditAccount[]
    overnightAccounts?: RawCreditAccount[]
    loanAccounts?: RawCreditAccount[]
    savingsAccounts?: RawCreditAccount[]
  }
  featureFlags?: unknown[]
  settings?: Record<string, unknown>
}

export interface RawTransaction {
  transactionId?: string | number
  /** Umsatzdatum, `dd.mm.yyyy`. */
  transactionDate?: string
  /** Uhrzeit des Umsatzes, `HH:MM` — fehlt auf Folgeseiten. */
  transactionTime?: string
  /** Buchungsdatum, `dd.mm.yyyy`. */
  date?: string
  /** Buchungsdatum als ISO-8601, Zeitanteil stets `00:00:00`. */
  transactionDateTime?: string
  accountingMonth?: string
  /** Vorzeichenbehaftet: Ausgaben negativ, Tilgung positiv. */
  amount?: number
  creditDebitKey?: string
  creditDebitKeyPhraseCompatible?: string
  booked?: boolean
  description?: string
  currencyCode?: number
  merchantName?: string
  merchantData?: {
    name?: string
    merchant_name?: string
    category?: string
    mcc?: string
    city?: string
    country?: string
  }
  location?: string
  city?: string
  postcode?: string
  country?: string
  mcc?: string
  recipientName?: string
  conversionRate?: number
  foreignAmount?: number
  posTransaction?: boolean
}

export interface RawTransactionPage {
  transactions?: RawTransaction[]
  /** true, wenn weitere Seiten ohne Bestätigung erreichbar sind. */
  more?: boolean
  /** true, wenn es mehr gibt, aber nur nach einer Bestätigung. */
  moreWithSCA?: boolean
}

export interface RawPostboxMessage {
  id?: number
  loginId?: string
  accountId?: string
  type?: string
  created?: string
  read?: string
  body?: { mimeType?: string, content?: string }
}

export interface RawPostboxStats {
  unread?: number
  older90Days?: Record<string, boolean>
}

export interface RawScaStatus {
  scaUniqueId?: string
  /** `open` → `accepted` → `complete`. `accepted` ist ein Zwischenstand. */
  status?: string
  scaType?: string
  startTime?: string
  initiator?: string
  language?: string
  resultData?: Record<string, string>
  /** 0 solange offen, 200 bei `complete`. */
  resultCode?: number
  case?: string
}

export interface RawTokenResponse {
  access_token?: string
  refresh_token?: string
  id_token?: string
  scope?: string
  token_type?: string
  expires_in?: number
}
