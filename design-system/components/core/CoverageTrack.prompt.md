Slim rounded bar for "Wie gut ist der Topf finanziert?" (Deckungsgrad) and Budgets. Teal up to target, amber when over.

```jsx
<CoverageTrack label="Lebensmittel" right="520 / 600 €" value={520} max={600} />
<CoverageTrack label="Auswärts" right="240 / 180 €" value={240} max={180} />
```

The over-budget amber state is inferred from `value > max`; force it with `over`.
