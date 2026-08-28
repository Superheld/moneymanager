/** Fehlercodes, die der Aufrufer unterscheiden können muss. */
export type HanseaticErrorCode =
  | 'not_logged_in'    // ohne Anmeldung aufgerufen
  | 'not_elevated'     // Zeitraum liegt hinter einer Bestätigung
  | 'sca_timeout'      // niemand hat im Handy bestätigt
  | 'account_locked'   // die Bank verweigert den Zugang
  | 'token_expired'    // das Zugangstoken ist abgelaufen (HTTP 401)
  | 'grant_rejected'   // Zugangsdaten oder Client abgewiesen
  | 'http'             // alles andere, was über HTTP schiefging

export class HanseaticError extends Error {
  readonly code: HanseaticErrorCode
  /** HTTP-Status, sofern es einen gab. */
  readonly status?: number
  /**
   * Antwort der Bank, gekürzt — hilft beim Nachvollziehen, ohne alles zu speichern.
   *
   * **Gehört in kein Protokoll und in keine Datenbank.** Was hier steht, kommt roh vom
   * `/token`-Endpunkt und kann alles enthalten, was die Bank in eine Fehlerantwort legt.
   * Heute landet es nirgends: es steht ABSICHTLICH nicht in `message`, und die App
   * protokolliert nur `message`. Genau das ist die Schutzmassnahme — wer die beiden
   * zusammenlegt, um die Fehlersuche zu erleichtern, hebt sie auf.
   */
  readonly details?: string

  constructor (code: HanseaticErrorCode, message: string,
               opts: { status?: number, details?: string, cause?: unknown } = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'HanseaticError'
    this.code = code
    this.status = opts.status
    this.details = opts.details
  }
}
