A single headline figure with label and meta, tabular numerals. The screen has exactly one `hero`; supporting figures are `chip` or `tile`.

```jsx
<KPIStat size="hero" label="Verfügbar heute" value="4.180" unit="€"
         meta="über 3 Konten" />
<KPIStat label="Tiefpunkt (Plan)" value="1.500" unit="€" tone="warn" />
```

`tone` follows the semantic palette: plan=teal, warn=amber, ok=green. Pre-format numbers de-DE with the `−` minus sign.
