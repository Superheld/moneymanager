// Die Kurve über „Reicht das Geld?" — der Stand aller liquiden Konten zusammen, Tag für Tag.
//
// **Warum ein eigener Chart und nicht `SaldoVerlaufChart`.** Der zeichnet Monate: einen
// Punkt je Monat, verbunden durch schräge Linien, und einen Wert nur über `<title>`, also
// nur mit der Maus. Hier geht es um Tage, und an einem Tag ändert sich der Stand nicht
// allmählich, sondern auf einmal — eine Rate fällt am Fünften, nicht verteilt über den
// Vierten. Die Linie ist deshalb eine TREPPE (waagerecht bis zum Tag, dann senkrecht), und
// gefragt ist, WAS an einem Tag fällt: Name und Betrag der Posten. Das passt in keinen
// `<title>` und ist am Handy ohne Maus gar nicht zu erreichen. Die Optik ist dieselbe:
// Raster, Achsenschrift, die feste Linie in Tinte, die zweite gestrichelt im Akzent.
//
// Drei Dinge daran sind Entscheidung:
//
//   • Der Chart misst seine BREITE und zeichnet in echten Pixeln, statt über eine feste
//     `viewBox` zu skalieren. Bei 1000 Einheiten auf 360 px stünde die Achsenschrift in
//     vier Pixeln da — am Handy, wo man sie braucht, unlesbar.
//   • Die NULL ist immer im Bild. Die Frage ist, ob das Geld reicht; der Abstand zur Null
//     ist die Antwort, und ohne sie sähe ein Rückgang um ein Zehntel aus wie ein Absturz.
//   • Was zu einem Tag gehört, steht UNTER dem Chart und nicht in einer schwebenden
//     Blase: dort verdeckt es nichts, ein Finger muss nicht daraufbleiben, und eine
//     Vorlesehilfe bekommt es über `aria-live`. Mit den Pfeiltasten geht man Tag für Tag.
//
// Farbe nur über `geldFarbe.ts`: die Nulllinie und die Marke eines Tages unter null
// amber (`warnFlaeche`), sonst neutral — ein Stand ist eine Höhe, keine Richtung.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Kurventag } from "../../../application";
import { useDatum, useGeld } from "../bausteine/einstellungenKontext";
import { geldFarbe, warnFarbe, warnFlaeche } from "../bausteine/geldFarbe";
import { useSchmal } from "../bausteine/useSchmal";

/** Ohne Messung (jsdom, erster Render): eine Breite, mit der alles gezeichnet werden kann. */
const VORGABE_BREITE = 640;

/** Die Breite des Behälters, laufend nachgeführt. */
function useBreite() {
  const ref = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(VORGABE_BREITE);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth > 0) setBreite(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const beobachter = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setBreite(w);
    });
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  return { ref, breite };
}

export function LiquiditaetKurve({ kurve }: { kurve: readonly Kurventag[] }) {
  const { t } = useTranslation();
  const geld = useGeld();
  const datum = useDatum();
  const schmal = useSchmal();
  const { ref, breite } = useBreite();
  const [gewaehlt, setGewaehlt] = useState<number | null>(null);

  const n = kurve.length;
  if (n < 2) return null;

  const hoehe = schmal ? 190 : 230;
  const padR = 10;
  const padT = 12;
  const padB = 24;
  const innenH = hoehe - padT - padB;

  const werte = kurve.flatMap((k) => [k.fest, k.erwartet]);
  const max = Math.max(0, ...werte);
  const min = Math.min(0, ...werte);
  const spanne = max - min || 1;
  // Die Achse in ganzen Euro: Cent sagen dort nichts, und die Spalte wird schmaler.
  const raster = [0, 1, 2, 3].map((g) => min + (spanne * g) / 3);
  const achse = raster.map((v) => geld.format(Math.round(v / 100) * 100));
  // So breit wie die längste Beschriftung — eine feste Breite schnitte grosse Stände ab
  // und liesse kleinen zu viel Platz.
  const padL = Math.ceil(Math.max(...achse.map((a) => a.length)) * 6.4) + 10;
  const innenB = Math.max(1, breite - padL - padR);
  // Ein Tag ist ein Streifen; die Treppe steht an seinem linken Rand und gilt bis zum
  // nächsten. Der letzte Tag bekommt seinen Streifen auch, sonst endete die Kurve am
  // Anfang ihres letzten Tages.
  const streifen = innenB / n;
  const x = (i: number) => padL + i * streifen;
  const y = (v: number) => padT + ((max - v) * innenH) / spanne;

  const treppe = (wert: (k: Kurventag) => number) =>
    kurve
      .map((k, i) => {
        const yy = y(wert(k)).toFixed(1);
        return `${i === 0 ? "M" : "V"}${i === 0 ? `${x(0).toFixed(1)} ${yy}` : yy} H${x(i + 1).toFixed(1)}`;
      })
      .join(" ");


  // Beschriftet wird jeder Monatserste, breit dazu der Fünfzehnte; der erste Tag immer.
  // Steht ein Erster zu nah am Anfang, entfällt er — zwei Daten übereinander liest niemand.
  const marken = kurve
    .map((k, i) => ({ i, tag: Number(k.datum.slice(8, 10)) }))
    .filter(({ i, tag }) => i === 0 || tag === 1 || (!schmal && tag === 15))
    .filter(({ i }, j, alle) => j === 0 || x(i) - x(alle[j - 1].i) > (schmal ? 44 : 52));

  const tagAus = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0) return;
    const px = ((e.clientX - r.left) / r.width) * breite;
    setGewaehlt(Math.min(n - 1, Math.max(0, Math.floor((px - padL) / streifen))));
  };

  const taste = (e: KeyboardEvent<SVGSVGElement>) => {
    const jetzt = gewaehlt ?? -1;
    const neu =
      e.key === "ArrowRight" ? Math.min(n - 1, jetzt + 1)
      : e.key === "ArrowLeft" ? Math.max(0, jetzt < 0 ? 0 : jetzt - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? n - 1
      : null;
    if (neu == null) return;
    e.preventDefault();
    setGewaehlt(neu);
  };

  const tag = gewaehlt == null ? undefined : kurve[gewaehlt];

  return (
    <div ref={ref} style={{ marginBottom: "var(--sp-4)" }}>
      <svg
        width={breite}
        height={hoehe}
        viewBox={`0 0 ${breite} ${hoehe}`}
        style={{ display: "block", maxWidth: "100%", touchAction: "pan-y", outlineOffset: 2 }}
        tabIndex={0}
        role="group"
        aria-label={t("blickNachVorn.reicht.kurveName")}
        // Antippen wählt einen Tag, es holt nicht den Fokus: sonst stünde nach jedem Tippen
        // der Fokusrahmen um den Chart. Mit der Tastatur kommt man per Tab hinein.
        onPointerDown={(e) => {
          e.preventDefault();
          tagAus(e);
        }}
        onPointerMove={tagAus}
        onKeyDown={taste}
      >
        {raster.map((v, i) => (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={breite - padR} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
              {achse[i]}
            </text>
          </g>
        ))}
        {min < 0 && (
          <line x1={padL} y1={y(0)} x2={breite - padR} y2={y(0)} stroke={warnFlaeche(true)} strokeWidth="1.2" strokeDasharray="2 3" />
        )}
        {marken.map(({ i }) => (
          <text key={i} x={x(i)} y={hoehe - 7} textAnchor={i === 0 ? "start" : "middle"} fontSize="11" fill="var(--ink-3)" fontFamily="var(--font-ui)">
            {datum.ohneJahr(kurve[i].datum)}
          </text>
        ))}
        {/* Die Tage, an denen etwas Datiertes fällt: ein Strich unten an der Achse. Er
            zeigt, wo Antippen etwas zu sagen hat. */}
        {kurve.map((k, i) =>
          k.posten.length === 0 ? null : (
            <line key={`p${i}`} x1={x(i) + streifen / 2} y1={hoehe - padB} x2={x(i) + streifen / 2} y2={hoehe - padB + 4} stroke="var(--ink-3)" strokeWidth="1.4" />
          ),
        )}
        <path d={treppe((k) => k.erwartet)} fill="none" stroke="var(--accent-deep, var(--ink-2))" strokeWidth="2" strokeDasharray="6 4" strokeLinejoin="round" />
        <path d={treppe((k) => k.fest)} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinejoin="round" />
        {tag && gewaehlt != null && (
          <g pointerEvents="none">
            <rect x={x(gewaehlt)} y={padT} width={Math.max(1, streifen)} height={innenH} fill="var(--accent-soft, var(--surface-2))" opacity="0.6" />
            <circle cx={x(gewaehlt) + streifen / 2} cy={y(tag.fest)} r="3.5" fill={warnFlaeche(tag.fest < 0) ?? "var(--ink)"} />
            <circle cx={x(gewaehlt) + streifen / 2} cy={y(tag.erwartet)} r="3.5" fill={warnFlaeche(tag.erwartet < 0) ?? "var(--accent-deep, var(--ink-2))"} />
          </g>
        )}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2) var(--sp-5)", marginTop: "var(--sp-2)", fontSize: "var(--fs-sm)", color: "var(--ink-2)" }}>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2.2px solid var(--ink)", verticalAlign: "middle", marginRight: 6 }} />
          {t("blickNachVorn.reicht.fest")}
        </span>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 0, borderTop: "2px dashed var(--accent-deep, var(--ink-2))", verticalAlign: "middle", marginRight: 6 }} />
          {t("blickNachVorn.reicht.erwartet")}
        </span>
        <span className="hinweis">{t("blickNachVorn.reicht.kurveSumme")}</span>
      </div>

      {/* Was zum gewählten Tag gehört. `aria-live`, damit die Pfeiltasten auch ohne Blick
          etwas sagen; die Fläche steht immer da, damit nichts springt. */}
      <div aria-live="polite" style={{ marginTop: "var(--sp-3)", minHeight: 44 }}>
        {!tag ? (
          <p className="hinweis" style={{ margin: 0 }}>{t("blickNachVorn.reicht.kurveWaehlen")}</p>
        ) : (
          <div data-testid="kurventag">
            <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-1) var(--sp-4)", fontSize: "var(--fs-ui)" }}>
              <strong>{datum.ohneJahr(tag.datum)}</strong>
              <span>
                {t("blickNachVorn.reicht.fest")}{" "}
                <span className="num" style={{ color: warnFarbe(tag.fest < 0) }}>{geld.formatMitSymbol(tag.fest)}</span>
              </span>
              <span>
                {t("blickNachVorn.reicht.erwartet")}{" "}
                <span className="num" style={{ color: warnFarbe(tag.erwartet < 0) }}>{geld.formatMitSymbol(tag.erwartet)}</span>
              </span>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: "var(--sp-2) 0 0", fontSize: "var(--fs-ui)" }}>
              {tag.posten.map((p, i) => (
                <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "3px 0", borderTop: "1px solid var(--line)" }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.bezeichnung}</span>
                  <span className="num" style={{ color: geldFarbe(p.betrag), flex: "0 0 auto" }}>{geld.format(p.betrag, { mitVorzeichen: true })}</span>
                </li>
              ))}
              {tag.budgetanteil > 0 && (
                <li style={{ display: "flex", justifyContent: "space-between", gap: "var(--sp-3)", padding: "3px 0", borderTop: "1px solid var(--line)", color: "var(--ink-2)" }}>
                  <span>{t("blickNachVorn.reicht.kurveBudgets")}</span>
                  <span className="num" style={{ flex: "0 0 auto" }}>{geld.format(-tag.budgetanteil, { mitVorzeichen: true })}</span>
                </li>
              )}
              {tag.posten.length === 0 && (
                <li className="hinweis" style={{ padding: "3px 0", borderTop: "1px solid var(--line)" }}>{t("blickNachVorn.reicht.kurveNichts")}</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
