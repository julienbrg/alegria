/**
 * What the ask services run on. Built by the controller: the model comes
 * from the assistant, the session from the server, never from the client.
 */
export interface AskRequest {
  message: string;
  /** Assistant name, already checked as visible to the caller. */
  context: string;
  model: string;
  sessionId: string;
}
