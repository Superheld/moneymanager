/**
 * Was die Library sich merken muss — und sonst nichts.
 *
 * Das Gerätetoken ist das einzige, was hier hineingehört: Ohne es verlangt die Bank bei
 * jeder Anmeldung eine Bestätigung im Handy. Alles Weitere — was schon importiert wurde,
 * wann zuletzt abgeglichen wurde — weiß die aufrufende Anwendung besser.
 */
export interface StateStore {
  getDeviceToken (loginId: string): Promise<string | null>
  setDeviceToken (loginId: string, token: string): Promise<void>
}

/** Standard: hält nichts über das Programmende hinaus. Jede Anmeldung klingelt. */
export class MemoryStore implements StateStore {
  #tokens = new Map<string, string>()

  async getDeviceToken (loginId: string): Promise<string | null> {
    return this.#tokens.get(loginId) ?? null
  }

  async setDeviceToken (loginId: string, token: string): Promise<void> {
    this.#tokens.set(loginId, token)
  }
}
