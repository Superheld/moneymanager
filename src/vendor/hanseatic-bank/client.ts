import * as api from './api.js'
import { HanseaticError } from './errors.js'
import { elevate, type ElevateOptions } from './sca.js'
import { login, type LoginOptions, type Session } from './auth.js'
import { mapAccount, mapStatement, mapTransaction } from './map.js'
import { MemoryStore, type StateStore } from './store.js'
import type {
  Account, Credentials, StatementList, StatementMeta, Transaction, TransactionPage,
} from './types.js'

/** Notbremse gegen eine Blätter-Schleife, falls die Bank `more` nie zurücknimmt. */
const MAX_SEITEN = 200

export interface ClientConfig {
  /**
   * Der Login-Client als Basic-Wert (`base64(key:secret)`).
   * Kommt aus der Konfiguration des Nutzers, nicht aus diesem Paket — siehe README.
   */
  clientBasic: string
  store?: StateStore
}

const alsIsoDatum = (d: Date) => d.toISOString().slice(0, 10)

export class HanseaticClient {
  readonly #clientBasic: string
  readonly #store: StateStore
  #session: Session | null = null
  #elevated = false

  constructor (config: ClientConfig) {
    if (!config?.clientBasic) {
      throw new HanseaticError('grant_rejected',
        'Ohne Login-Client geht nichts. Er wird aus der eigenen Anmeldung gewonnen — siehe README.')
    }
    this.#clientBasic = config.clientBasic
    this.#store = config.store ?? new MemoryStore()
  }

  get isLoggedIn (): boolean {
    return this.#session !== null && Date.now() < this.#session.expiresAt
  }

  /** true, sobald `elevate()` durchgelaufen ist. Gilt für die Dauer der Sitzung. */
  get isElevated (): boolean {
    return this.#elevated
  }

  async login (creds: Credentials, opts: LoginOptions = {}): Promise<void> {
    this.#session = await login(creds, this.#clientBasic, this.#store, opts)
    this.#elevated = false
  }

  /**
   * Verwirft das Token hier. Mehr ist nicht möglich: Die Bank kennt keine
   * serverseitige Abmeldung (gemessen). Das Gerätetoken bleibt im Store.
   */
  logout (): void {
    this.#session = null
    this.#elevated = false
  }

  async elevate (opts: ElevateOptions): Promise<void> {
    await elevate(this.#token(), opts)
    this.#elevated = true
  }

  async getAccounts (): Promise<Account[]> {
    const roh = await api.initCustomer(this.#token())
    const gruppen = roh.accounts ?? {}
    // Nur Kreditkartenkonten waren je gefüllt; die anderen Listen kommen leer zurück.
    // Sie trotzdem mitzunehmen kostet nichts und schadet nicht, falls doch etwas kommt.
    return [
      ...(gruppen.creditAccounts ?? []),
      ...(gruppen.overnightAccounts ?? []),
      ...(gruppen.loanAccounts ?? []),
      ...(gruppen.savingsAccounts ?? []),
    ].map(mapAccount).filter(k => k.id !== '')
  }

  /**
   * Buchungen — in einem Zeitraum oder, ohne Angabe, alle verfügbaren.
   *
   * Gelesen wird von der neuesten Buchung rückwärts. Mit `from` endet das Blättern,
   * sobald das Buchungsdatum darunter fällt; ohne `from` läuft es bis ans Ende der
   * Historie der Bank. Letzteres braucht praktisch immer eine Freischaltung, weil ohne
   * sie nur die jüngsten Buchungen erreichbar sind.
   *
   * Liegt der verlangte Beginn hinter dem, was ohne Bestätigung erreichbar ist, wirft
   * der Aufruf `not_elevated` — ohne Teilergebnis, damit aus einer halben Antwort keine
   * Lücke im Bestand des Aufrufers wird.
   */
  async getTransactions (accountId: string,
                         range?: { from?: Date, to?: Date }): Promise<TransactionPage> {
    const bearer = this.#token()
    // Ohne Untergrenze wird nicht gefiltert: jedes Datum ist >= ''.
    const ohneUntergrenze = !range?.from
    const vonIso = range?.from ? alsIsoDatum(range.from) : ''
    const bisIso = alsIsoDatum(range?.to ?? new Date())

    const gesammelt: Transaction[] = []
    let ältestesGesehen = ''
    let reichtZurück = false

    for (let seite = 1; seite <= MAX_SEITEN; seite++) {
      const roh = await api.transactionsEnriched(bearer, accountId, seite)
      const zeilen = (roh.transactions ?? []).map(mapTransaction)
      gesammelt.push(...zeilen)

      for (const z of zeilen) {
        if (z.bookingDate && (!ältestesGesehen || z.bookingDate < ältestesGesehen)) {
          ältestesGesehen = z.bookingDate
        }
      }

      // Weit genug: Wir haben eine Buchung vor dem Beginn des Zeitraums gesehen. Erst
      // das beweist, dass der Zeitraum lückenlos abgedeckt ist.
      if (!ohneUntergrenze && ältestesGesehen && ältestesGesehen < vonIso) {
        reichtZurück = true
        break
      }

      // Die Bank hat nichts mehr — auch nicht hinter einer Bestätigung.
      //
      // Mit Untergrenze bleibt `reichtZurück` hier bewusst false: Wir haben zwar alles,
      // was es gibt, aber der angefragte Zeitraum beginnt früher als die Historie. Das
      // ist der Unterschied zwischen "vollständig" und "alles, was zu haben war".
      // Ohne Untergrenze war genau das die Frage — dann ist es true.
      if (!roh.more && (!roh.moreWithSCA || this.#elevated)) {
        reichtZurück = ohneUntergrenze
        break
      }

      // Es gäbe mehr, aber nur nach Bestätigung. Nichts zurückgeben, sondern sagen,
      // was fehlt: Der Aufrufer entscheidet, ob er das Handy bemüht.
      if (!roh.more && roh.moreWithSCA && !this.#elevated) {
        throw new HanseaticError('not_elevated', ohneUntergrenze
          ? 'Für die vollständige Historie ist eine Bestätigung nötig. Erst elevate() aufrufen.'
          : `Für Buchungen ab ${vonIso} ist eine Bestätigung nötig. Erst elevate() aufrufen.`)
      }

      if (zeilen.length === 0) break
    }

    const imZeitraum = gesammelt
      .filter(t => t.bookingDate >= vonIso && t.bookingDate <= bisIso)
      .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))

    return { transactions: imZeitraum, oldestReached: ältestesGesehen, reachedFrom: reichtZurück }
  }

  /**
   * Die Kontoauszüge im Postfach.
   *
   * Anders als bei Buchungen wird hier nicht geworfen: Die jüngsten Auszüge sind ohne
   * Bestätigung abrufbar, und eine kurze Liste ist eine richtige Antwort auf einen nicht
   * freigeschalteten Zustand. Dass mehr dahinterliegt, sagt `hasMoreBehindSca`.
   */
  async getStatements (): Promise<StatementList> {
    const bearer = this.#token()
    const [nachrichten, stats] = await Promise.all([
      api.postboxMessages(bearer),
      api.postboxStats(bearer).catch(() => ({})),
    ])

    const statements: StatementMeta[] = (nachrichten ?? []).map(mapStatement)
    const älteres = Object.values((stats as { older90Days?: Record<string, boolean> })
      .older90Days ?? {}).some(Boolean)

    return { statements, hasMoreBehindSca: !this.#elevated && älteres }
  }

  /** Ein Auszug als Bytes. Der Inhalt wird nicht ausgewertet. */
  async getStatement (id: number): Promise<{ mimeType: string, bytes: Uint8Array }> {
    const roh = await api.postboxMessage(this.#token(), id)
    const inhalt = roh.body?.content
    if (!inhalt) {
      throw new HanseaticError('http', `Der Auszug ${id} kam ohne Inhalt zurück.`)
    }
    return {
      mimeType: roh.body?.mimeType ?? 'application/octet-stream',
      bytes: new Uint8Array(Buffer.from(inhalt, 'base64')),
    }
  }

  // --- Sync-Fassade: dieselben Vorgänge unter den Namen, die eine Finanzverwaltung
  // erwartet. Weiterleitungen, keine zweite Ebene.

  syncBalances (): Promise<Account[]> {
    return this.getAccounts()
  }

  syncSince (accountId: string, since: Date): Promise<TransactionPage> {
    return this.getTransactions(accountId, { from: since })
  }

  /** Alles, was die Bank hergibt. Braucht eine Freischaltung. */
  syncAll (accountId: string): Promise<TransactionPage> {
    return this.getTransactions(accountId)
  }

  #token (): string {
    if (!this.#session) {
      throw new HanseaticError('not_logged_in', 'Erst login() aufrufen.')
    }
    if (Date.now() >= this.#session.expiresAt) {
      throw new HanseaticError('token_expired',
        'Das Zugangstoken ist abgelaufen (eine Stunde). Bitte neu anmelden.')
    }
    return this.#session.accessToken
  }
}
