import * as React from 'react';

export interface ScenarioChipProps {
  /** Active scenario name. Default "Basis". */
  name?: string;
  style?: React.CSSProperties;
}

/**
 * The teal "Szenario: …" pill — signals the active plan layer (Plan ≠ Ist). Lives in the context bar.
 * @startingPoint section="Layout" subtitle="Scenario indicator" viewport="700x150"
 */
export function ScenarioChip(props: ScenarioChipProps): React.JSX.Element;
