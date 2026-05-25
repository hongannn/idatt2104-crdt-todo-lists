import type { LWWRegisterState } from "./crdt/LWWRegister";
import type { ORSetState } from "./crdt/ORSet";

/**
 * Shared state for the collaborative todo list.
 */
export interface SharedState {
  todos: ORSetState;
  completed: ORSetState;
  title: LWWRegisterState<string>;
}

export type MessageType = "welcome" | "update" | "state";

export interface WSMessage {
  type: MessageType;
  nodeId: string;
  state: SharedState;
  clientCount?: number;
}
