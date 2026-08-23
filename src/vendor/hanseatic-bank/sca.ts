import { HanseaticError } from './errors.js'
import { POLL_INTERVAL_MS, request, sleep } from './transport.js'
import type { RawScaStatus } from './raw.js'

/**
 * Die Freischaltung für Historie und Postfach.
 *
 * `scaBroker/1.0` ist ein allgemeiner Bestätigungsdienst: verschiedene Vorgänge werden
 * verschieden eingereicht, der Status wird für alle gleich abgefragt. Diese Library
 * benutzt davon ausschließlich `session` — die anderen Wege ändern Daten der Bank.
 */

export interface ElevateOptions {
  /** Wird einmal aufgerufen, sobald das Handy bestätigen muss. */
  onConfirm: () => void
  /** Abbruch, wenn niemand bestätigt. Standard: 3 Minuten. */
  timeoutMs?: number
}

export async function elevate (accessToken: string, opts: ElevateOptions): Promise<void> {
  const eröffnet = await request<RawScaStatus>('/scaBroker/1.0/session', {
    method: 'POST',
    bearer: accessToken,
    body: {
      initiator: 'ton-sca-fe',
      lang: 'de',
      // Wörtlich "Bearer " plus Token — im Rumpf, zusätzlich zum Header.
      session: `Bearer ${accessToken}`,
    },
  })

  const id = eröffnet.scaUniqueId
  if (!id) {
    throw new HanseaticError('http', 'Die Bank eröffnete keine Bestätigung.')
  }

  opts.onConfirm()

  const ende = Date.now() + (opts.timeoutMs ?? 180_000)
  while (Date.now() < ende) {
    const status = await request<RawScaStatus>(
      `/scaBroker/1.0/status/${encodeURIComponent(id)}`, { bearer: accessToken })

    // Nur `complete` zählt. `accepted` sieht nach Erfolg aus, ist aber ein
    // Zwischenstand — wer hier aussteigt, liest gleich darauf zu wenig Daten.
    if (status.status === 'complete' || status.resultCode === 200) return

    await sleep(POLL_INTERVAL_MS)
  }

  throw new HanseaticError('sca_timeout',
    'Die Bestätigung im Handy blieb aus. Die Freischaltung kam nicht zustande.')
}
