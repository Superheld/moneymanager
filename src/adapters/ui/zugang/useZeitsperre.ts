// Nach einer Weile ohne Bedienung wieder zusperren.
//
// **Wogegen das hilft und wogegen nicht.** Es ist der Schutz gegen jemanden, der sich an
// den entsperrten Rechner setzt — der einzige der vier Angreifer, den weder Dateirechte
// noch Verschlüsselung erreichen. Gegen Schadcode, der als der Nutzer läuft, wirkt es
// nicht: solange die App offen ist, ist der Schlüssel im Speicher.

import { useEffect, useRef } from "react";

/** Handgriffe, die als Bedienung zählen und die Frist neu stellen. */
const BEDIENUNG = ["mousedown", "keydown", "wheel", "touchstart"] as const;

/**
 * Sperrt nach `minuten` ohne Bedienung. `0` schaltet ab.
 *
 * **Die Frist ist eine UHRZEIT, kein Countdown.** Gemerkt wird der Zeitpunkt, an dem
 * gesperrt werden muss; der Timer ist nur der Wecker dazu. Bis 2026-11-10 war der Timer
 * selbst die Frist, und das trug genau dort nicht, wo es darauf ankommt: schläft der
 * Rechner, steht `setTimeout` still und läuft nach dem Aufwachen mit dem REST weiter.
 * Wer den Deckel nach vierzehn von fünfzehn Minuten zuklappte, fand die App am nächsten
 * Morgen noch eine Minute lang offen vor.
 *
 * Deshalb zwei Dinge: der Wecker prüft beim Klingeln gegen die Uhr statt sich selbst zu
 * glauben, und **die Rückkehr ins Fenster ist keine Bedienung, sondern eine Prüfung** —
 * `visibilitychange` und `focus` stellen die Frist nicht neu, sie sehen nach, ob sie
 * abgelaufen ist. Vorher stand `visibilitychange` in der Liste der Handgriffe: das
 * Aufklappen des Rechners hätte die Sperre also um eine volle Frist verlängert.
 */
export function useZeitsperre(minuten: number, sperren: () => void): void {
  const sperrenRef = useRef(sperren);
  sperrenRef.current = sperren;

  useEffect(() => {
    if (minuten <= 0) return;

    const dauer = minuten * 60_000;
    let frist = Date.now() + dauer;
    let handle: ReturnType<typeof setTimeout>;
    let gesperrt = false;

    const wecken = (inMs: number) => {
      clearTimeout(handle);
      handle = setTimeout(pruefen, Math.max(0, inMs));
    };

    function pruefen() {
      if (gesperrt) return;
      const rest = frist - Date.now();
      if (rest <= 0) {
        gesperrt = true;
        clearTimeout(handle);
        sperrenRef.current();
      } else {
        // Der Wecker ging zu früh (oder die Frist wurde inzwischen verlängert).
        wecken(rest);
      }
    }

    const bedient = () => {
      if (gesperrt) return;
      // Erst prüfen, dann verlängern: der erste Tastendruck nach dem Aufwachen darf eine
      // abgelaufene Frist nicht wiederbeleben.
      if (Date.now() >= frist) return pruefen();
      frist = Date.now() + dauer;
      wecken(dauer);
    };

    wecken(dauer);
    for (const e of BEDIENUNG) window.addEventListener(e, bedient, { passive: true });
    document.addEventListener("visibilitychange", pruefen);
    window.addEventListener("focus", pruefen);

    return () => {
      clearTimeout(handle);
      for (const e of BEDIENUNG) window.removeEventListener(e, bedient);
      document.removeEventListener("visibilitychange", pruefen);
      window.removeEventListener("focus", pruefen);
    };
  }, [minuten]);
}
