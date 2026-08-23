// Gegenüber dem Ursprungs-Repo ist hier NUR der Testrunner ausgetauscht: `node:test` und
// `node:assert/strict` laufen unter Vitest nicht (es findet keine Suite und meldet die
// Datei als Fehler, obwohl die Prüfungen durchlaufen). Die Fälle und ihre Werte sind
// unverändert. Für `rejects(fn, praedikat)` gibt es in Vitest keine direkte Entsprechung:
// der Fehler wird gefangen und danach geprüft — das trennt „hat geworfen" von „hat DAS
// geworfen", was die Prädikat-Form stillschweigend vermischt.

import { afterEach, describe, expect, test } from 'vitest'
import { HanseaticClient } from './client.js'
import { HanseaticError } from './errors.js'

// Geprüft wird die Blätter-Logik, nicht die Bank. Die Antworten sind erfunden und so
// gebaut, dass sie sich verhalten wie das, was in docs/bank-api.md gemessen steht:
// absteigend nach Buchungsdatum, `more` für weitere Seiten, `moreWithSCA` für das,
// was hinter einer Bestätigung liegt.

const echtesFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = echtesFetch })

/** Erzeugt Buchungen, absteigend ab einem Starttag. */
function seite (abTag: number, anzahl: number, more: boolean, moreWithSCA: boolean) {
  const transactions = Array.from({ length: anzahl }, (_, i) => {
    const tag = abTag - i
    const iso = `2026-03-${String(tag).padStart(2, '0')}`
    return {
      transactionId: `t${tag}`,
      date: `${String(tag).padStart(2, '0')}.03.2026`,
      transactionDate: `${String(tag).padStart(2, '0')}.03.2026`,
      transactionDateTime: `${iso}T00:00:00+01:00`,
      amount: -1,
      currencyCode: 978,
      description: `Buchung ${tag}`,
      booked: true,
    }
  })
  return { transactions, more, moreWithSCA }
}

/** Client mit gestubbter Bank; die Sitzung entsteht über den echten login()-Pfad. */
function neuerClient (): HanseaticClient {
  return new HanseaticClient({ clientBasic: 'dGVzdDp0ZXN0' })  // privacy-ok — erfundener Testwert
}

async function meldeAn (client: HanseaticClient, seiten: unknown[]) {
  let index = 0
  globalThis.fetch = (async (url: string | URL) => {
    const pfad = String(url)
    let daten: unknown
    if (pfad.includes('/token')) {
      daten = { access_token: 'testtoken', expires_in: 3600, token_type: 'bearer' }
    } else if (pfad.includes('transactionsEnriched')) {
      daten = seiten[Math.min(index++, seiten.length - 1)]
    } else {
      throw new Error(`unerwarteter Aufruf: ${pfad}`)
    }
    return new Response(JSON.stringify(daten), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  }) as typeof fetch
  await client.login({ loginId: '0000000000', password: 'x' })  // privacy-ok — erfundener Testwert
}

/** Fängt den erwarteten Fehler, damit Code und Text einzeln geprüft werden können. */
async function fehlerAus (versprechen: Promise<unknown>): Promise<HanseaticError> {
  const f = await versprechen.then(() => null, (e: unknown) => e)
  expect(f, 'es wurde gar kein Fehler geworfen').toBeInstanceOf(HanseaticError)
  return f as HanseaticError
}

describe('client', () => {
  test('ohne Anmeldung: not_logged_in', async () => {
    const client = new HanseaticClient({ clientBasic: 'dGVzdDp0ZXN0' })  // privacy-ok — erfundener Testwert
    expect((await fehlerAus(client.getAccounts())).code).toBe('not_logged_in')
  })

  test('Zeitraum innerhalb der ersten Seite: keine Bestätigung nötig', async () => {
    const client = neuerClient()
    await meldeAn(client, [seite(20, 14, false, true)])

    const ergebnis = await client.getTransactions('123', { from: new Date('2026-03-15') })
    expect(ergebnis.transactions.length).toBe(6)          // 20. bis 15.
    expect(ergebnis.reachedFrom).toBe(true)
    expect(ergebnis.oldestReached).toBe('2026-03-07')
  })

  test('Zeitraum hinter der Bestätigung: wirft not_elevated statt Teilmenge', async () => {
    const client = neuerClient()
    await meldeAn(client, [seite(20, 14, false, true)])

    const f = await fehlerAus(client.getTransactions('123', { from: new Date('2026-01-01') }))
    expect(f.code).toBe('not_elevated')
  })

  test('blättert weiter, solange more gesetzt ist', async () => {
    const client = neuerClient()
    await meldeAn(client, [
      seite(31, 10, true, false),     // 31. bis 22.
      seite(21, 10, true, false),     // 21. bis 12.
      seite(11, 10, false, false),    // 11. bis 02.
    ])

    const ergebnis = await client.getTransactions('123', { from: new Date('2026-03-05') })
    expect(ergebnis.transactions.length).toBe(27)         // 31. bis 05.
    expect(ergebnis.reachedFrom).toBe(true)
  })

  test('Historie endet vor dem Zeitraum: reachedFrom bleibt false', async () => {
    // Gegen die echte Bank aufgefallen: Bei einem weit zurückliegenden `from` endete die
    // Historie vorher, und das Flag meldete trotzdem true. "Alles, was zu haben war" ist
    // nicht dasselbe wie "der Zeitraum ist abgedeckt" — nur der zweite Fall ist true.
    const client = neuerClient()
    await meldeAn(client, [seite(10, 5, false, false)])   // nur 10. bis 06.

    const ergebnis = await client.getTransactions('123', { from: new Date('2025-01-01') })
    expect(ergebnis.transactions.length).toBe(5)
    expect(ergebnis.reachedFrom).toBe(false)
    expect(ergebnis.oldestReached).toBe('2026-03-06')
  })

  test('leeres Konto: reachedFrom bleibt false, weil nichts bewiesen ist', async () => {
    const client = neuerClient()
    await meldeAn(client, [{ transactions: [], more: false, moreWithSCA: false }])

    const ergebnis = await client.getTransactions('123', { from: new Date('2026-01-01') })
    expect(ergebnis.transactions.length).toBe(0)
    expect(ergebnis.reachedFrom).toBe(false)
    expect(ergebnis.oldestReached).toBe('')
  })

  test('to schneidet oben ab', async () => {
    const client = neuerClient()
    await meldeAn(client, [seite(20, 14, false, false)])

    const ergebnis = await client.getTransactions('123', {
      from: new Date('2026-03-10'), to: new Date('2026-03-15'),
    })
    expect(ergebnis.transactions.length).toBe(6)          // 15. bis 10.
    expect(ergebnis.transactions[0]?.bookingDate).toBe('2026-03-15')
  })

  test('ohne Zeitraum: blättert bis ans Ende der Historie', async () => {
    const client = neuerClient()
    await meldeAn(client, [
      seite(31, 10, true, false),
      seite(21, 10, true, false),
      seite(11, 10, false, false),
    ])

    const ergebnis = await client.getTransactions('123')
    expect(ergebnis.transactions.length).toBe(30)
    expect(ergebnis.reachedFrom).toBe(true)     // die Frage war "alles", und alles ist da
    expect(ergebnis.oldestReached).toBe('2026-03-02')
  })

  test('ohne Zeitraum und ohne Freischaltung: not_elevated', async () => {
    const client = neuerClient()
    await meldeAn(client, [seite(20, 14, false, true)])

    const f = await fehlerAus(client.getTransactions('123'))
    expect(f.code).toBe('not_elevated')
    expect(f.message).toMatch(/vollständige Historie/)
  })

  test('syncAll ist der Vollabruf', async () => {
    const client = neuerClient()
    await meldeAn(client, [seite(10, 5, false, false)])

    const ergebnis = await client.syncAll('123')
    expect(ergebnis.transactions.length).toBe(5)
    expect(ergebnis.reachedFrom).toBe(true)
  })
})
