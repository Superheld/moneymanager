import React from 'react';
import { useSchmal } from './useSchmal';

/**
 * Dialog — centered modal for create/edit flows. Renders a scrim, a header with icon +
 * title/subtitle + close, the body, and a footer (e.g. Abbrechen / Speichern).
 *
 * ## Schmal steht er ueber die ganze Hoehe, und die Fusszeile bleibt stehen
 *
 * Breit ist er eine 680er Box mit 48 px Luft darueber — auf einem Telefon hiess das:
 * Formular ausfuellen, scrollen, „Speichern" suchen. Der Knopf lag unter dem Bildrand,
 * und zwar OHNE dass man das sieht: der Dialog ist ein eigener Scrollbereich, der Rest
 * der Seite steht still.
 *
 * Unter 700 px (`useSchmal`) fuellt er deshalb den Bildschirm und wird zu drei Teilen,
 * von denen nur der mittlere scrollt: Kopf oben, Inhalt dazwischen, Fusszeile unten.
 * **Damit ist die Handlung immer sichtbar** — dieselbe Regel wie beim Update-Knopf in
 * der Seitenleiste: Auskunft darf weichen, eine Handlung nicht.
 *
 * `position: sticky` an der Fusszeile waere der kuerzere Weg und hier der falsche: die
 * Box traegt `overflow: hidden` (fuer die abgerundeten Ecken) und ist damit selbst ein
 * Scrollbereich, in dem nichts scrollt — das Sticky haette keine Wirkung, und man saehe
 * es ihm nicht an. Drei Teile mit einem scrollenden Mittelstueck sagen, was gemeint ist.
 *
 * Die Raender folgen `env(safe-area-inset-*)`: schmal liegt der Dialog UNTER der Kerbe
 * und ueber der Wischleiste, und beide sind je nach Geraet verschieden hoch.
 */
export function Dialog({ title, subtitle, onClose, footer, children }) {
  const schmal = useSchmal();

  return (
    <div onClick={function(e){ if(e.target===e.currentTarget && onClose) onClose(); }}
      style={{ position:'absolute', inset:0, background:'oklch(0.3 0.02 60/.34)', display:'flex',
        alignItems:schmal?'stretch':'flex-start', justifyContent:'center',
        padding:schmal?0:'48px 20px', overflow:schmal?'hidden':'auto', zIndex:30 }}>
      <div style={{ width:'100%', maxWidth:schmal?'none':680, background:'var(--surface)',
        border:schmal?'none':'1px solid var(--line)',
        borderRadius:schmal?0:'var(--r-2xl)', boxShadow:schmal?'none':'var(--shadow-pop)',
        overflow:'hidden', display:'flex', flexDirection:'column', minHeight:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:13,
          padding:schmal?'calc(18px + env(safe-area-inset-top)) 18px 18px':'18px 22px',
          borderBottom:'1px solid var(--line)', flex:'0 0 auto' }}>
          <span style={{ width:36, height:36, borderRadius:11, background:'var(--accent-wash)', color:'var(--accent-deep)',
            display:'grid', placeItems:'center', fontSize:20, fontWeight:'var(--fw-black)', flex:'0 0 auto' }}>+</span>
          <div style={{ minWidth:0 }}>
            <h3 style={{ margin:0, fontSize:17, fontWeight:'var(--fw-black)' }}>{title}</h3>
            {subtitle && <div style={{ fontSize:'12.5px', color:'var(--ink-3)', marginTop:2 }}>{subtitle}</div>}
          </div>
          {/* 36 px statt 30 schmal: eine Trefferflaeche fuer den Finger. */}
          <button onClick={onClose} style={{ marginLeft:'auto', width:schmal?36:30, height:schmal?36:30, borderRadius:'var(--r-sm)',
            border:'1px solid var(--line)', background:'var(--surface)', color:'var(--ink-3)', cursor:'pointer', fontSize:15, flex:'0 0 auto' }}>✕</button>
        </div>
        {/* Der einzige Teil, der scrollt. `minHeight: 0` ist Pflicht: ein Flex-Kind
            besteht sonst auf seiner Inhaltshoehe und schiebt die Fusszeile hinaus. */}
        <div style={{ padding:schmal?'18px':'20px 22px', display:'flex', flexDirection:'column', gap:15,
          flex:schmal?'1 1 auto':'0 0 auto', overflowY:schmal?'auto':'visible', minHeight:0 }}>{children}</div>
        {footer && <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap',
          padding:schmal?'15px 18px calc(15px + env(safe-area-inset-bottom))':'15px 22px',
          borderTop:'1px solid var(--line)', background:'var(--cream)', flex:'0 0 auto' }}>{footer}</div>}
      </div>
    </div>
  );
}
