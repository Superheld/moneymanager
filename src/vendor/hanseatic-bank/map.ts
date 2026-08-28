import type { Account, StatementMeta, Transaction, TransactionType } from './types.js'
import type { RawCreditAccount, RawPostboxMessage, RawTransaction } from './raw.js'

/**
 * Die einzige Stelle, die beide Welten kennt.
 *
 * Benennt die Bank ein Feld um, bricht genau diese Datei — die öffentlichen Typen
 * bleiben, wie sie sind.
 */

/** ISO-4217 numerisch → Kürzel. 978 ist alles, was bisher vorkam. */
const WÄHRUNGEN: Record<number, string> = {
  978: 'EUR', 840: 'USD', 826: 'GBP', 756: 'CHF', 752: 'SEK', 578: 'NOK', 208: 'DKK',
}

/** `dd.mm.yyyy` → `yyyy-mm-dd`. Alles andere kommt unverändert zurück. */
export function deutschesDatumZuIso (wert: string | undefined): string {
  if (!wert) return ''
  const treffer = wert.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  return treffer ? `${treffer[3]}-${treffer[2]}-${treffer[1]}` : wert
}

/**
 * Das Buchungsdatum einer Buchung als `yyyy-mm-dd`.
 *
 * Bevorzugt `transactionDateTime`, weil es schon ISO ist; `date` ist derselbe Tag in
 * deutscher Schreibweise und dient als Rückfall. **Nicht** `transactionDate` — das ist
 * das Umsatzdatum und fällt nicht monoton.
 */
export function buchungsdatum (roh: RawTransaction): string {
  if (roh.transactionDateTime && roh.transactionDateTime.length >= 10) {
    return roh.transactionDateTime.slice(0, 10)
  }
  return deutschesDatumZuIso(roh.date)
}

/**
 * Buchungsart aus dem Schlüssel der Bank.
 *
 * Beobachtet wurden genau drei Werte; alles andere wird `other`, statt zu raten. Die
 * Art ist nicht bloß Beiwerk: nur `card` trägt eine `transactionId`.
 */
export function buchungsart (schlüssel: string | undefined): TransactionType {
  switch (schlüssel?.trim().toUpperCase()) {
    case 'KARTEN-UMS.': return 'card'
    case 'LS-EINZUG': return 'directDebit'
    case 'UEBERWEISUNG': return 'transfer'
    default: return 'other'
  }
}

export function mapTransaction (roh: RawTransaction): Transaction {
  const betrag = typeof roh.amount === 'number' ? roh.amount : 0
  const händlerName = roh.merchantData?.name ?? roh.merchantData?.merchant_name ?? roh.merchantName

  // Leere Kennung heißt: es gibt keine. Ein leerer String als Kennung wäre schlimmer
  // als keine — er sieht aus wie ein Wert und ist bei jeder Buchung derselbe.
  const kennung = String(roh.transactionId ?? '').trim()

  const transaktion: Transaction = {
    bookingDate: buchungsdatum(roh),
    purchaseDate: deutschesDatumZuIso(roh.transactionDate) || buchungsdatum(roh),
    amount: betrag,
    currency: WÄHRUNGEN[roh.currencyCode ?? 978] ?? String(roh.currencyCode ?? ''),
    // Die Bank liefert das Vorzeichen selbst: Ausgaben negativ, Tilgung positiv.
    direction: betrag < 0 ? 'debit' : 'credit',
    description: roh.description?.trim() ?? '',
    booked: roh.booked !== false,
    type: buchungsart(roh.creditDebitKey),
  }

  if (kennung) transaktion.id = kennung
  if (roh.transactionTime) transaktion.purchaseTime = roh.transactionTime

  if (händlerName) {
    const händler: NonNullable<Transaction['merchant']> = { name: händlerName.trim() }
    const kategorie = roh.merchantData?.category
    const mcc = roh.merchantData?.mcc ?? roh.mcc
    const stadt = roh.merchantData?.city ?? roh.city
    const land = roh.merchantData?.country ?? roh.country
    if (kategorie) händler.category = kategorie
    if (mcc) händler.mcc = mcc
    if (stadt) händler.city = stadt
    if (land) händler.country = land
    transaktion.merchant = händler
  }

  return transaktion
}

export function mapAccount (roh: RawCreditAccount): Account {
  const konto: Account = {
    id: String(roh.accountNumber ?? ''),
    holder: roh.accountHolder ?? '',
    iban: roh.iban ?? '',
    productLabel: roh.productLabel ?? '',
    balance: typeof roh.saldo === 'number' ? roh.saldo : 0,
    currency: 'EUR',
  }

  if (roh.creditcard) {
    konto.card = {
      limit: roh.creditcard.limit ?? 0,
      available: roh.creditcard.otb ?? 0,
      nameOnCard: roh.creditcard.nameOnCard ?? '',
      validUntil: roh.creditcard.validUntil ?? '',
    }
  }

  return konto
}

export function mapStatement (roh: RawPostboxMessage): StatementMeta {
  return {
    id: roh.id ?? 0,
    type: roh.type ?? '',
    created: roh.created ?? '',
    read: roh.read ?? '',
    accountId: String(roh.accountId ?? ''),
  }
}
