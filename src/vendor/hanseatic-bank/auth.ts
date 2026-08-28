import { HanseaticError } from './errors.js'
import { GATEWAY, POLL_INTERVAL_MS, WEB_APP, jwtPayload, request, sleep } from './transport.js'
import type { RawScaStatus, RawTokenResponse } from './raw.js'
import type { Credentials } from './types.js'
import type { StateStore } from './store.js'

/**
 * Die Anmeldung, in vier Schritten.
 *
 * Zwei Clients sind im Spiel und dürfen nicht verwechselt werden: Der **Page-Client**
 * steht offen im HTML der Weboberfläche und darf nur `client_credentials`; der
 * **Login-Client** ist ein nicht-öffentliches Basic-Credential und darf nur den
 * Passwort-Grant. Die Fehlermeldung der Bank sagt nicht, welcher gerade falsch ist.
 */

const GRANT = 'hbSCACustomPassword'

export interface Session {
  accessToken: string
  refreshToken?: string
  /** Zeitpunkt, ab dem das Token als abgelaufen gilt (ms seit Epoche). */
  expiresAt: number
  loginId: string
}

export interface LoginOptions {
  /** Wird einmal aufgerufen, sobald das Handy bestätigen muss. */
  onChallenge?: () => void
  /** Abbruch, wenn niemand bestätigt. Standard: 3 Minuten. */
  scaTimeoutMs?: number
}

/** Page-Client aus dem HTML der Weboberfläche lesen — er steht dort im Klartext. */
export async function fetchPageClient (): Promise<{ id: string, secret: string }> {
  let html: string
  try {
    const antwort = await fetch(`${WEB_APP}/`, { signal: AbortSignal.timeout(20_000) })
    html = await antwort.text()
  } catch (cause) {
    throw new HanseaticError('http', 'Die Weboberfläche war nicht erreichbar.', { cause })
  }

  const id = html.match(/NORTHLAYER_CLIENT_KEY\s*[:=]\s*["']([^"']+)["']/)?.[1]
  const secret = html.match(/NORTHLAYER_CLIENT_SECRET\s*[:=]\s*["']([^"']+)["']/)?.[1]

  if (!id || !secret) {
    throw new HanseaticError('grant_rejected',
      'Der Page-Client steht nicht mehr im HTML der Weboberfläche — die Bank hat vermutlich etwas geändert.')
  }
  return { id, secret }
}

/** Schritt 1: Passwort-Grant. Ergibt entweder das Zugangstoken oder eine SCA-Aufgabe. */
async function passwortGrant (creds: Credentials, clientBasic: string,
                              deviceToken: string | null): Promise<RawTokenResponse> {
  const headers: Record<string, string> = {}
  if (deviceToken) headers['devicetoken'] = deviceToken

  return request<RawTokenResponse>('/token', {
    method: 'POST',
    authorization: `Basic ${clientBasic}`,
    headers,
    body: new URLSearchParams({
      grant_type: GRANT,
      loginId: creds.loginId,
      password: creds.password,
    }),
  })
}

/** Schritt 2: kurzlebiges Token, mit dem der Login-Broker befragt werden darf. */
async function bootstrapToken (): Promise<string> {
  const client = await fetchPageClient()
  const antwort = await request<RawTokenResponse>('/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: client.id,
      client_secret: client.secret,
    }),
  })
  if (!antwort.access_token) {
    throw new HanseaticError('grant_rejected', 'Die Bank gab kein Bootstrap-Token heraus.')
  }
  return antwort.access_token
}

/**
 * Schritt 3: Warten, bis im Handy bestätigt wurde.
 *
 * Abgebrochen wird bei `complete` — **nicht** bei „nicht mehr `open`". Dazwischen liegt
 * `accepted`.
 */
async function warteAufBestätigung (sub: string, scaId: string, bearer: string,
                                    timeoutMs: number): Promise<RawScaStatus> {
  const ende = Date.now() + timeoutMs
  while (Date.now() < ende) {
    const status = await request<RawScaStatus>(
      `${GATEWAY}/openScaBroker/1.0/customer/${encodeURIComponent(sub)}/status/${encodeURIComponent(scaId)}`,
      { bearer })

    if (status.status === 'complete' || status.resultCode === 200) return status
    await sleep(POLL_INTERVAL_MS)
  }
  throw new HanseaticError('sca_timeout',
    'Die Bestätigung im Handy blieb aus. Anmeldung abgebrochen.')
}

/** Die vollständige Anmeldung. Persistiert ein neues Gerätetoken über den Store. */
export async function login (creds: Credentials, clientBasic: string, store: StateStore,
                             opts: LoginOptions = {}): Promise<Session> {
  const gemerktesGerät = await store.getDeviceToken(creds.loginId)
  let antwort = await passwortGrant(creds, clientBasic, gemerktesGerät)

  // Kein Zugangstoken, aber ein id_token: die Bank will eine Bestätigung sehen. Das
  // kann auch passieren, wenn ein Gerätetoken mitging — dessen Gültigkeit endet
  // irgendwann, und wann, ist nicht gemessen.
  if (!antwort.access_token && antwort.id_token) {
    const claims = jwtPayload(antwort.id_token)
    const sub = String(claims['sub'] ?? '')
    const scaId = String(claims['sca_id'] ?? '')
    if (!sub || !scaId) {
      throw new HanseaticError('grant_rejected',
        'Die Bank verlangt eine Bestätigung, nannte aber keine Kennung dafür.')
    }

    opts.onChallenge?.()

    const bearer = await bootstrapToken()
    const status = await warteAufBestätigung(sub, scaId, bearer, opts.scaTimeoutMs ?? 180_000)

    const neuesGerät = status.resultData?.['DEVICETOKEN']
    if (!neuesGerät) {
      throw new HanseaticError('grant_rejected',
        'Die Bestätigung kam durch, aber die Bank nannte kein Gerätetoken.')
    }
    await store.setDeviceToken(creds.loginId, neuesGerät)

    // Schritt 4: derselbe Grant, diesmal mit dem frischen Gerätetoken.
    antwort = await passwortGrant(creds, clientBasic, neuesGerät)
  }

  if (!antwort.access_token) {
    throw new HanseaticError('grant_rejected',
      'Die Anmeldung ergab kein Zugangstoken. Zugangsdaten oder Login-Client prüfen.')
  }

  const sitzung: Session = {
    accessToken: antwort.access_token,
    expiresAt: Date.now() + (antwort.expires_in ?? 3600) * 1000,
    loginId: creds.loginId,
  }
  // Wird nicht benutzt: Der Erneuerungsaufruf ist nie beobachtet worden, und was nicht
  // gemessen ist, wird hier nicht implementiert.
  if (antwort.refresh_token) sitzung.refreshToken = antwort.refresh_token
  return sitzung
}
