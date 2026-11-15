// KostenStapelChart — je Monat EIN Balken, gestapelt nach Kostenart, und die Einnahmen
// als Linie darüber. Die Kostensicht des Verlaufs („Was hat der Monat gekostet?").
//
// Gestapelt und nicht nebeneinander wie im `MonatsFlussChart`: dort werden zwei Grössen
// verglichen (herein gegen hinaus), hier wird EINE zerlegt — die Kosten des Monats in
// ihre Arten. Die Höhe des Stapels ist die Zahl, auf die es ankommt, und die Linie sagt,
// ob die Einnahmen sie tragen: liegt der Stapel über der Linie, hat der Monat mehr
// gekostet, als hereinkam.
//
// Beides steht auf EINER Achse. Kosten und Einnahmen sind dieselbe Einheit; zwei Skalen
// liessen jede Kreuzung von Linie und Stapel zufällig aussehen.
//
// FARBEN. Die Stapel sind Teile eines Ganzen und tragen die Reihenfarben
// (`--serie-1`…`-6` aus `styles/tokens/colors.css`) — in fester Zuordnung zur Kostenart,
// nie nach Rang: Fixkosten sind in jedem Monat dieselbe Farbe, auch wenn eine andere Art
// fehlt. Die vier Geld-Tokens stehen hier bewusst NICHT (`farbregel.test.ts`): ein
// amberfarbener Stapel hiesse „sieh hin", und Kosten zu haben ist kein Befund. Die
// Einnahmen sind eine Linie in `--ink` und nicht grün wie im Flussdiagramm — sie läuft
// über sechs farbige Flächen, und zwei davon sind selbst Grüntöne.
//
// DIE SIEBTE ART, die Tilgung (seit 2026-11-15), bekommt KEINE siebte Farbe. Die Reihe hat
// sechs Töne, die bei Farbfehlsichtigkeit unterscheidbar geprüft sind; ein siebter wäre
// ungeprüft, und ein zyklischer Index gäbe ihr die Farbe der Fixkosten. Sie trägt den Ton
// der Vorsorge (`--serie-6`) SCHRAFFIERT: beides baut Vermögen auf und steht in derselben
// Stufe — der Ton sagt „dieselbe Familie", die Schraffur „eine andere Art". Eine Schraffur
// ist eine Form und keine Farbe, sie trägt auch dort, wo zwei Töne für das Auge
// zusammenfallen. Die Legende zeigt dasselbe Muster.

import { useId } from "react";
import { useTranslation } from "react-i18next";
import { KOSTENZEILEN, type KostenMonat, type KostenZeileId } from "../../../application";
import { useGeld } from "../bausteine/einstellungenKontext";

/**
 * Art → Reihenfarbe; gestapelt wird in der Reihenfolge der Ergebnisrechnung
 * (`KOSTENZEILEN`, unten zuerst). Ausgeschrieben statt aus dem Index gebaut: `tokens.test.ts` findet
 * nur, was als `var(--…)` im Quelltext steht, und ein zusammengesetzter Name liefe
 * ungeprüft ins Leere.
 */
const FARBE: Record<KostenZeileId, string> = {
  fixkosten: "var(--serie-1)",
  laufend: "var(--serie-2)",
  ungeplant: "var(--serie-3)",
  abschreibungen: "var(--serie-4)",
  vorsorge: "var(--serie-6)",
  // Derselbe Ton wie die Vorsorge — die Fläche schraffiert ihn (`SCHRAFFIERT`, oben im Kopf).
  tilgung: "var(--serie-6)",
};

/** Die Arten, deren Fläche schraffiert statt voll gezeichnet wird. */
const SCHRAFFIERT: ReadonlySet<KostenZeileId> = new Set(["tilgung"]);

/** Blass steht, was noch läuft — dieselbe Zurücknahme wie beim Plan im Flussdiagramm. */
const BLASS = 0.45;

export function KostenStapelChart({ monate, width = 1000, height = 260 }: { monate: readonly KostenMonat[]; width?: number; height?: number }) {
  const { t } = useTranslation();
  const geld = useGeld();
  // Eine Kennung je Diagramm: zwei Diagramme auf derselben Seite dürfen sich ihr Muster
  // nicht gegenseitig überschreiben. `useId` liefert Doppelpunkte, die in `url(#…)` nicht
  // zuverlässig tragen.
  const musterId = `schraffur-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const flaeche = (art: KostenZeileId) => (SCHRAFFIERT.has(art) ? `url(#${musterId})` : FARBE[art]);
  // Derselbe linke Rand wie die beiden anderen Charts des Verlaufs: beim Umschalten
  // bleiben die Monate an ihrem Platz.
  const padL = 56;
  const padR = 16;
  const padT = 14;
  const padB = 26;
  const n = monate.length;

  /**
   * Eine Kostenart kann in einem Monat mit Erstattungen unter null fallen. Eine Fläche
   * mit negativer Höhe gibt es nicht, also zeichnet der Stapel sie nicht — die Zahl
   * bleibt in Tabelle und Titel stehen, wo sie ihr Vorzeichen tragen kann.
   */
  const hoehe = (m: KostenMonat, art: KostenZeileId) => Math.max(0, m.kosten[art]);
  const stapel = (m: KostenMonat) => KOSTENZEILEN.reduce((s, art) => s + hoehe(m, art), 0);
  const max = Math.max(1, ...monate.map(stapel), ...monate.map((m) => m.einnahmen));

  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const basis = padT + innerH;
  const slot = n > 0 ? innerW / n : innerW;
  const bw = Math.min(28, slot * 0.56);
  const h = (v: number) => (v / max) * innerH;
  const mitte = (i: number) => padL + slot * i + slot / 2;

  const gitter = [max, (max * 3) / 4, max / 2, max / 4, 0].map((v) => ({ v, y: basis - h(v) }));
  const linie = monate.map((m, i) => `${i === 0 ? "M" : "L"}${mitte(i).toFixed(1)},${(basis - h(Math.max(0, m.einnahmen))).toFixed(1)}`).join(" ");
  // Welche Arten überhaupt vorkommen: die Legende nennt nur, was im Bild steht. Ein
  // Haushalt ohne Vorsorge bekäme sonst ein Kästchen für eine Farbe, die er nie sieht.
  const vorhanden = KOSTENZEILEN.filter((art) => monate.some((m) => hoehe(m, art) > 0));
  const hatLaufenden = monate.some((m) => m.laufend);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" style={{ display: "block", height: "auto" }} role="img" aria-label={t("historie.kosten.diagrammName")}>
        <defs>
          <pattern id={musterId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--surface)" />
            <rect width="3" height="6" fill={FARBE.tilgung} />
          </pattern>
        </defs>
        {gitter.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke={g.v === 0 ? "var(--ink-3)" : "var(--line)"} strokeWidth={g.v === 0 ? 1.2 : 1} />
            <text x={padL - 8} y={g.y + 4} textAnchor="end" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{geld.format(Math.round(g.v))}</text>
          </g>
        ))}
        {monate.map((m, i) => {
          let unten = basis;
          return (
            <g key={m.monat} data-monat={m.monat} opacity={m.laufend ? BLASS : 1}>
              <title>{t("historie.kosten.tooltip", { monat: m.monat, kosten: geld.formatMitSymbol(m.kostenGesamt), ein: geld.formatMitSymbol(m.einnahmen), frei: geld.formatMitSymbol(m.ergebnis) })}</title>
              {KOSTENZEILEN.map((art) => {
                const hh = h(hoehe(m, art));
                if (hh <= 0) return null;
                unten -= hh;
                // Ein Pixel Fläche zwischen den Teilen: ohne die Fuge verschmelzen zwei
                // benachbarte Töne, und der Stapel liest sich als ein Block.
                return <rect key={art} data-art={art} x={mitte(i) - bw / 2} y={unten} width={bw} height={Math.max(0, hh - 1)} fill={flaeche(art)} />;
              })}
              {/* Der Slot in voller Höhe, damit der Titel auch über der Lücke erscheint. */}
              <rect x={padL + slot * i} y={padT} width={slot} height={innerH} fill="transparent" />
              {i % Math.ceil(n / 12) === 0 && (
                <text x={mitte(i)} y={height - 8} textAnchor="middle" fontSize="10.5" fill="var(--ink-3)" fontFamily="var(--font-ui)">{m.monat}</text>
              )}
            </g>
          );
        })}
        {/* Die Einnahmen ÜBER den Stapeln. Mit Punkten, weil ein einzelner Monat sonst
            keine Linie hat und die Marke ganz fehlte. */}
        {n > 1 && <path d={linie} fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />}
        {monate.map((m, i) => (
          <circle key={m.monat} cx={mitte(i)} cy={basis - h(Math.max(0, m.einnahmen))} r="3.5" fill="var(--ink)" stroke="var(--surface)" strokeWidth="1.5" opacity={m.laufend ? BLASS : 1} />
        ))}
      </svg>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2) var(--sp-4)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span>
          <span style={{ display: "inline-block", width: 14, height: 2, background: "var(--ink)", verticalAlign: "middle", marginRight: 6 }} />
          {t("ergebnis.zeile.einnahmen")}
        </span>
        {vorhanden.map((art) => (
          <span key={art}>
            <span
              style={{
                display: "inline-block",
                width: 11,
                height: 11,
                borderRadius: 3,
                // Dieselbe Schraffur wie im Bild, sonst stünde in der Legende eine Fläche,
                // die man im Diagramm nicht wiederfindet.
                background: SCHRAFFIERT.has(art)
                  ? `repeating-linear-gradient(45deg, ${FARBE[art]} 0 2px, var(--surface) 2px 4px)`
                  : FARBE[art],
                boxShadow: SCHRAFFIERT.has(art) ? `inset 0 0 0 1px ${FARBE[art]}` : undefined,
                verticalAlign: "middle",
                marginRight: 6,
              }}
            />
            {t(`ergebnis.zeile.${art}`)}
          </span>
        ))}
        {hatLaufenden && <span>{t("historie.kosten.legendeLaufend")}</span>}
      </div>
    </div>
  );
}
