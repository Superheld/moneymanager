import React from 'react';

/**
 * Donut — proportional ring for allocation / category breakdowns.
 * `segments` is an array of {value, color, label}; renders a centered total.
 */
export function Donut({ segments, size = 160, stroke = 20, center, sub }) {
  var total = segments.reduce(function(a,s){return a+s.value;},0);
  var r=(size-stroke)/2-2, c=2*Math.PI*r, cx=size/2, cy=size/2, off=0;
  return (
    <svg viewBox={'0 0 '+size+' '+size} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke}/>
      {segments.map(function(s,i){
        var len=(s.value/total)*c, el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={s.color} strokeWidth={stroke}
          strokeDasharray={len.toFixed(1)+' '+(c-len).toFixed(1)} strokeDashoffset={(-off).toFixed(1)}
          transform={'rotate(-90 '+cx+' '+cy+')'}/>;
        off+=len; return el;})}
      {center && <text x={cx} y={cy-1} textAnchor="middle" fontFamily="var(--font-ui)" fontSize="18" fontWeight="800" fill="var(--ink)">{center}</text>}
      {sub && <text x={cx} y={cy+15} textAnchor="middle" fontFamily="var(--font-ui)" fontSize="10" fill="var(--ink-3)">{sub}</text>}
    </svg>
  );
}
