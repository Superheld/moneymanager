import { HanseaticError } from './errors.js'

/** Das Gateway, über das alle fachlichen Aufrufe laufen. */
export const GATEWAY = 'https://connecthb.hanseaticbank.de'
/** Die Weboberfläche — nur nötig, um den Page-Client aus dem HTML zu lesen. */
export const WEB_APP = 'https://meine.hanseaticbank.de'

/** Wartezeit zwischen zwei Statusabfragen. So macht es die Weboberfläche. */
export const POLL_INTERVAL_MS = 5000

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT'
  /** Bearer-Token für fachliche Aufrufe. */
  bearer?: string
  /** Vollständiger Authorization-Header — für die Basic-Anmeldung. */
  authorization?: string
  headers?: Record<string, string>
  /** Objekt → JSON, URLSearchParams → formularkodiert. */
  body?: unknown
  timeoutMs?: number
}

/**
 * Ein Aufruf gegen die Bank.
 *
 * Wirft ausschließlich `HanseaticError` — nie einen nackten Fetch-Fehler. Der Aufrufer
 * soll an `code` entscheiden können, ohne Zeichenketten zu vergleichen.
 */
export async function request<T> (path: string, opts: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${GATEWAY}${path}`
  const headers: Record<string, string> = { accept: 'application/json', ...opts.headers }

  let body: string | undefined
  if (opts.body instanceof URLSearchParams) {
    headers['content-type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    body = opts.body.toString()
  } else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  if (opts.bearer) headers['authorization'] = `Bearer ${opts.bearer}`
  if (opts.authorization) headers['authorization'] = opts.authorization

  let response: Response
  try {
    response = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    })
  } catch (cause) {
    const grund = cause instanceof Error ? cause.message : String(cause)
    throw new HanseaticError('http', `Verbindung zur Bank fehlgeschlagen: ${grund}`, { cause })
  }

  const text = await response.text()

  if (!response.ok) throw fehlerAus(response.status, text, path)

  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch (cause) {
    throw new HanseaticError('http', `Antwort war kein JSON (${path})`,
      { status: response.status, details: text.slice(0, 200), cause })
  }
}

/** Einen HTTP-Status in den Fehler übersetzen, der den Aufrufer interessiert. */
function fehlerAus (status: number, text: string, path: string): HanseaticError {
  const details = text.slice(0, 300)

  if (status === 401) {
    return new HanseaticError('token_expired',
      'Das Zugangstoken ist abgelaufen oder ungültig — neu anmelden.', { status, details })
  }
  if (status === 400 && /invalid_grant|invalid_client/.test(text)) {
    return new HanseaticError('grant_rejected',
      'Die Bank hat Zugangsdaten oder Client abgewiesen.', { status, details })
  }
  if (status === 403) {
    return new HanseaticError('account_locked',
      'Die Bank verweigert den Zugriff — möglicherweise ist der Zugang gesperrt.',
      { status, details })
  }
  return new HanseaticError('http', `Die Bank antwortete mit ${status} auf ${path}`,
    { status, details })
}

/**
 * Nutzlast eines JWT lesen. Es wird nichts geprüft — die Signatur gehört der Bank, wir
 * lesen nur die Angaben, die für den Ablauf nötig sind.
 */
export function jwtPayload (token: string): Record<string, unknown> {
  const teil = token.split('.')[1]
  if (!teil) {
    throw new HanseaticError('grant_rejected', 'Die Bank lieferte kein lesbares Token.')
  }
  try {
    const json = Buffer.from(teil.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch (cause) {
    throw new HanseaticError('grant_rejected', 'Das Token der Bank war nicht lesbar.', { cause })
  }
}
