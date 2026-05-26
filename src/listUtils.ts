import { LWWRegister, type LWWRegisterState } from "./crdt/LWWRegister";
import { ORSet } from "./crdt/ORSet";
import type { ListState, SharedState } from "./protocol";

export interface ListEntry {
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
  itemTexts: Map<string, LWWRegister<string>>;
}

export function makeList(nodeId: string, state?: ListState): ListEntry {
  const itemTexts = new Map<string, LWWRegister<string>>();
  for (const [id, s] of Object.entries(state?.texts ?? {})) {
    itemTexts.set(id, new LWWRegister<string>(nodeId, s));
  }
  return {
    todos: new ORSet(nodeId, state?.todos),
    completed: new ORSet(nodeId, state?.completed),
    title: new LWWRegister<string>(nodeId, state?.title),
    itemTexts,
  };
}

export function mergeLists(
  lists: Map<string, ListEntry>,
  nodeId: string,
  incoming: Record<string, ListState>,
): void {
  for (const [id, state] of Object.entries(incoming)) {
    if (!lists.has(id)) {
      lists.set(id, makeList(nodeId, state));
    } else {
      const list = lists.get(id)!;
      list.todos.merge(state.todos);
      list.completed.merge(state.completed);
      list.title.merge(state.title);
      for (const [textId, textState] of Object.entries(state.texts ?? {})) {
        const reg = list.itemTexts.get(textId);
        if (reg) reg.merge(textState);
        else list.itemTexts.set(textId, new LWWRegister<string>(nodeId, textState));
      }
    }
  }
}

export function serializeState(lists: Map<string, ListEntry>): SharedState {
  const result: Record<string, ListState> = {};
  for (const [id, list] of lists) {
    const texts: Record<string, LWWRegisterState<string>> = {};
    for (const [textId, reg] of list.itemTexts) {
      texts[textId] = reg.getState();
    }
    result[id] = {
      todos: list.todos.getState(),
      completed: list.completed.getState(),
      title: list.title.getState(),
      texts,
    };
  }
  return { lists: result };
}
