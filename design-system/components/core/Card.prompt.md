Flat panel with a hairline border — the standard content container. Flat by default; pass `floating` only for popovers/menus.

```jsx
<Card title="Verfügbares Geld" subtitle="alle Konten zusammen" action={<Legend/>}>
  <Chart/>
</Card>
```

Use `pad={false}` for edge-to-edge content (charts, split layouts). Radius is 18px; never add a colored left-border accent.
