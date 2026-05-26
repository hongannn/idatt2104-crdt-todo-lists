import type { LWWRegisterState } from "./crdt/LWWRegister";
import type { ORSetState } from "./crdt/ORSet";

/**
 * Shared state for a collaborative todo list.
 */
export interface ListState {
  todos: ORSetState;
  completed: ORSetState;
  title: LWWRegisterState<string>;
}

export interface SharedState {
  lists: Record<string, ListState>;
}

export type MessageType = "welcome" | "update" | "state";

export interface WSMessage {
  type: MessageType;
  nodeId: string;
  state: SharedState;
  clientCount?: number;
}
