// Registerleiste — die Reiter selbst, ohne Seite drumherum.
//
// Herausgelöst aus `Bereich`, als die Analyse Reiter bekam: dort stehen Zeitraum und
// Kennzahlen ZWISCHEN Seitenkopf und Reitern, weil sie für jedes Register gelten, und
// `Bereich` legt den Kopf fest über die Leiste. Eine zweite Leiste daneben hätte beim
// nächsten Feinschliff anders ausgesehen als die erste.

export interface Register {
  /** Stabiler technischer Schlüssel — nicht der Anzeigename. */
  readonly id: string;
  readonly label: string;
}

export function Registerleiste({
  register,
  aktiv,
  onWahl,
}: {
  register: readonly Register[];
  aktiv: string | undefined;
  onWahl: (id: string) => void;
}) {
  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: "var(--sp-4)",
        borderBottom: "1px solid var(--line)",
        marginBottom: "var(--sp-4)",
        // Die Leiste darf waagerecht rollen, wenn viele Register nebeneinander stehen.
        // `overflow-y` MUSS dabei ausdrücklich dastehen: sobald eine der beiden Achsen
        // nicht mehr `visible` ist, rechnet der Browser die andere zu `auto` um — und
        // die Reiter ragen mit ihrem `marginBottom: -1` genau einen Pixel über den
        // Kasten hinaus. Das reicht für einen senkrechten Rollbalken an einer Leiste,
        // die nur eine Zeile hoch ist.
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {register.map((r) => {
        const istAktiv = r.id === aktiv;
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={istAktiv}
            onClick={() => onWahl(r.id)}
            style={{
              background: "none",
              border: 0,
              // Der aktive Reiter trägt die Akzentlinie; das Absetzen um einen Pixel
              // legt sie über die Trennlinie der Leiste, statt daneben.
              borderBottom: `2px solid ${istAktiv ? "var(--accent)" : "transparent"}`,
              marginBottom: -1,
              padding: "var(--sp-2) 0",
              cursor: "pointer",
              font: "inherit",
              fontWeight: istAktiv ? "var(--fw-bold)" : "inherit",
              color: istAktiv ? "var(--ink)" : "var(--ink-3)",
              whiteSpace: "nowrap",
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
