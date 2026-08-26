// Nach einer Weile ohne Bedienung wieder zusperren.
//
// **Wogegen das hilft und wogegen nicht.** Es ist der Schutz gegen jemanden, der sich an
// den entsperrten Rechner setzt — der einzige der vier Angreifer, den weder Dateirechte
// noch Verschlüsselung erreichen. Gegen Schadcode, der als der Nutzer läuft, wirkt es
// nicht: solange die App offen ist, ist der Schlüssel im Speicher.

import { useEffect, useRef } from "react";

/** Woran „Bedienung" erkannt wird. `visibilitychange` ist dabei der wichtigste. */
const EREIGNISSE = ["mousedown", "keydown", "wheel", "touchstart", "visibilitychange"] as const;

/**
 * Sperrt nach `minuten` ohne Bedienung. `0` schaltet ab.
 *
 * **Kein Timer, der jede Sekunde tickt**, sondern einer, der beim nächsten Handgriff neu
 * gestellt wird. Das ist nicht nur billiger, sondern auch richtiger: eine Sperre, die
 * einen Zähler mitschleppt, verrechnet sich, sobald der Rechner schläft.
 */
export function useZeitsperre(minuten: number, sperren: () => void): void {
  const sperrenRef = useRef(sperren);
  sperrenRef.current = sperren;

  useEffect(() => {
    if (minuten <= 0) return;

    let handle: ReturnType<typeof setTimeout>;
    const stellen = () => {
      clearTimeout(handle);
      handle = setTimeout(() => sperrenRef.current(), minuten * 60_000);
    };

    stellen();
    for (const e of EREIGNISSE) window.addEventListener(e, stellen, { passive: true });

    return () => {
      clearTimeout(handle);
      for (const e of EREIGNISSE) window.removeEventListener(e, stellen);
    };
  }, [minuten]);
}
