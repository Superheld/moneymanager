// Gegenüber dem Ursprungs-Repo ist hier NUR der Testrunner ausgetauscht: `node:test` und
// `node:assert/strict` laufen unter Vitest nicht (es findet keine Suite und meldet die
// Datei als Fehler, obwohl die Prüfungen durchlaufen). Die Fälle und ihre Werte sind
// unverändert — wer abgleicht, vergleicht die Zeilen darunter, nicht die Importe.

import { describe, expect, test } from 'vitest'
import { buchungsart, buchungsdatum, deutschesDatumZuIso, mapAccount, mapTransaction } from './map.js'

// Die Werte hier sind erfunden. Echte Kontodaten gehören nicht in Tests — was die Bank
// tatsächlich liefert, steht im Herkunfts-Repository.

describe('map', () => {
  test('deutsches Datum wird ISO', () => {
    expect(deutschesDatumZuIso('13.08.2026')).toBe('2026-08-13')
    expect(deutschesDatumZuIso(undefined)).toBe('')
    expect(deutschesDatumZuIso('2026-08-13')).toBe('2026-08-13')
  })

  test('Buchungsdatum kommt aus transactionDateTime, nicht aus transactionDate', () => {
    // Genau hier lag die Falle: transactionDate ist das Umsatzdatum und fällt nicht
    // monoton — ein Zeitraumfilter darauf verliert Zeilen.
    expect(buchungsdatum({
      transactionDate: '05.03.2026',
      date: '11.03.2026',
      transactionDateTime: '2026-03-11T00:00:00+01:00',
    })).toBe('2026-03-11')
  })

  test('Buchungsdatum fällt auf date zurück, wenn ISO fehlt', () => {
    expect(buchungsdatum({ transactionDate: '05.03.2026', date: '11.03.2026' })).toBe('2026-03-11')
  })

  test('Ausgabe wird debit, Tilgung wird credit — nach dem Vorzeichen der Bank', () => {
    expect(mapTransaction({ amount: -12.34 }).direction).toBe('debit')
    expect(mapTransaction({ amount: 99.5 }).direction).toBe('credit')
  })

  test('beide Daten kommen heraus, auch wenn sie auseinanderliegen', () => {
    const t = mapTransaction({
      transactionId: 'abc',
      transactionDate: '05.03.2026',
      transactionTime: '12:45',
      transactionDateTime: '2026-03-11T00:00:00+01:00',
      amount: -10,
      currencyCode: 978,
      description: '  Ein Einkauf  ',
      booked: true,
    })
    expect(t.purchaseDate).toBe('2026-03-05')
    expect(t.bookingDate).toBe('2026-03-11')
    expect(t.purchaseTime).toBe('12:45')
    expect(t.currency).toBe('EUR')
    expect(t.description).toBe('Ein Einkauf')
  })

  test('fehlende Felder brechen den Mapper nicht', () => {
    // transactionTime fehlt auf Folgeseiten als Schlüssel — das darf nichts auslösen.
    const t = mapTransaction({ transactionId: 1, date: '01.02.2026', amount: -1 })
    expect(t.purchaseTime).toBe(undefined)
    expect(t.merchant).toBe(undefined)
    expect(t.booked).toBe(true)
  })

  test('Händler wird nur gesetzt, wenn es einen gibt', () => {
    const mit = mapTransaction({ merchantData: { name: 'Testladen', city: 'Teststadt' } })
    expect(mit.merchant).toEqual({ name: 'Testladen', city: 'Teststadt' })
    expect(mapTransaction({}).merchant).toBe(undefined)
  })

  test('Konto samt Karte', () => {
    const k = mapAccount({
      accountNumber: '1234567890',  // privacy-ok — erfundener Testwert
      accountHolder: 'Test Person',
      iban: 'DE00000000000000000000',  // privacy-ok — erfundener Testwert
      productLabel: 'TestCard',
      saldo: -100,
      creditcard: { limit: 1000, otb: 900, nameOnCard: 'TEST PERSON', validUntil: '12/29' },
    })
    expect(k.id).toBe('1234567890')  // privacy-ok — erfundener Testwert
    expect(k.balance).toBe(-100)
    expect(k.card?.available).toBe(900)
  })

  test('Buchungsart aus dem Schlüssel der Bank', () => {
    expect(buchungsart('KARTEN-UMS.')).toBe('card')
    expect(buchungsart('LS-EINZUG')).toBe('directDebit')
    expect(buchungsart('UEBERWEISUNG')).toBe('transfer')
    expect(buchungsart('WAS-NEUES')).toBe('other')
    expect(buchungsart(undefined)).toBe('other')
  })

  test('leere Kennung wird weggelassen, nicht als leerer String durchgereicht', () => {
    // Gemessen: Lastschriften und Überweisungen kommen mit leerem transactionId-Feld.
    // Ein leerer String sähe aus wie ein Wert und wäre bei jeder solchen Buchung derselbe.
    expect(mapTransaction({ transactionId: '', creditDebitKey: 'LS-EINZUG' }).id).toBe(undefined)
    expect(mapTransaction({ creditDebitKey: 'LS-EINZUG' }).id).toBe(undefined)
    expect(mapTransaction({ transactionId: 'abc', creditDebitKey: 'KARTEN-UMS.' }).id).toBe('abc')
  })
})
