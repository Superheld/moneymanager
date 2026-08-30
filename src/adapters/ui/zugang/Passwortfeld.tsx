// Ein Feld für eine Passphrase — überall im Zugang dasselbe.
//
// Es lag bis 2026-08-30 in `Sperrbildschirm.tsx` und wurde herausgezogen, als der
// Passphrasenwechsel sein Bestätigungsfeld bekam: zwei Stellen, ein Feld. Es bleibt in
// `zugang/` und wandert nicht nach `bausteine/` — die beiden Nutzer sind derselbe
// Fachbereich, und ein Baustein, den nur ein Bereich benutzt, ist ein Teil dieses
// Bereichs.

import { FormField } from "../bausteine";

export function Passwortfeld({
  label,
  hint,
  wert,
  setzen,
  beiEnter,
}: {
  label: string;
  hint?: string;
  wert: string;
  setzen(v: string): void;
  beiEnter?(): void;
}) {
  return (
    <FormField label={label} hint={hint} required>
      <input
        className="field"
        type="password"
        // `FormField` verbindet Beschriftung und Feld nicht — ohne das hier nennt ein
        // Screenreader ein Passwortfeld ohne Namen. Bei einem Tor, an dem es nur dieses
        // eine Feld gibt, ist das der Unterschied zwischen bedienbar und nicht.
        aria-label={label}
        value={wert}
        onChange={(e) => setzen(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && beiEnter) beiEnter();
        }}
        autoComplete="off"
      />
    </FormField>
  );
}
