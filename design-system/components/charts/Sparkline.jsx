import React from 'react';

/**
 * Sparkline — tiny inline trend line. `variant="plan"` draws dashed teal, else solid ink.
 */
export function Sparkline({ values, variant = 'ist', width = 120, height = 32 }) {
  var min=Math.min.apply(null,values), max=Math.max.apply(null,values);
  var ix=function(i){return i*(width-4)/(values.length-1)+2;};
  var iy=function(v){return 4+(max-v)*(height-8)/((max-min)||1);};
  var d=values.map(function(v,i){return (i?'L':'M')+ix(i).toFixed(1)+' '+iy(v).toFixed(1);}).join(' ');
  return (
    <svg viewBox={'0 0 '+width+' '+height} width={width} height={height}>
      <path d={d} fill="none" stroke={variant==='plan'?'var(--accent)':'var(--ink-2)'} strokeWidth="2"
        strokeDasharray={variant==='plan'?'5 4':undefined} strokeLinecap="round"/>
    </svg>
  );
}
