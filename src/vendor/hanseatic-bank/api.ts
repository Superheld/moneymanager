import { request } from './transport.js'
import type {
  RawInitCustomer, RawPostboxMessage, RawPostboxStats, RawTransactionPage,
} from './raw.js'

/**
 * Die rohen Aufrufe — eins zu eins, ohne Deutung.
 *
 * Nur lesende Endpoints. Die schreibenden sind in docs/bank-api.md beschrieben und
 * bewusst nicht hier: eine Library, die Salden liest, hat keinen Grund, Geld zu bewegen.
 */

export function initCustomer (bearer: string): Promise<RawInitCustomer> {
  return request<RawInitCustomer>('/customerinfo/1.0/initCustomer', {
    method: 'POST',
    bearer,
    // "MHB" ist Pflicht; "WEB" wird mit 422 abgewiesen.
    body: { initiator: 'MHB', language: 'de' },
  })
}

export function transactionsEnriched (bearer: string, accountNumber: string,
                                      page: number): Promise<RawTransactionPage> {
  const query = new URLSearchParams({
    page: String(page),
    withReservations: 'true',
    withEnrichments: 'true',
  })
  return request<RawTransactionPage>(
    `/transaction/1.0/transactionsEnriched/${encodeURIComponent(accountNumber)}?${query}`,
    { bearer })
}

export function postboxStats (bearer: string): Promise<RawPostboxStats> {
  return request<RawPostboxStats>('/postbox/1.0/messages/stats', { bearer })
}

export function postboxMessages (bearer: string): Promise<RawPostboxMessage[]> {
  return request<RawPostboxMessage[]>('/postbox/1.0/messages', { bearer })
}

export function postboxMessage (bearer: string, id: number): Promise<RawPostboxMessage> {
  return request<RawPostboxMessage>(`/postbox/1.0/messages/${id}`, { bearer })
}
