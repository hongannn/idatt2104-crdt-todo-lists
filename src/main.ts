import { ORSet } from "./crdt/ORSet";
import { LWWRegister, type LWWRegisterState } from "./crdt/LWWRegister";
import type { ListState, SharedState, WSMessage } from "./protocol";

const nodeId = Math.random().toString(36).slice(2, 8);
const lists = new Map<string, ListEntry>();
const wsUrl = "ws://" + location.host;
const input = document.getElementById("item-input") as HTMLInputElement;
const title = document.getElementById("title")!;
let activeListId = "";
let ws: WebSocket;

interface ListEntry {
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
  itemTexts: Map<string, LWWRegister<string>>;
}

function getActiveList(): ListEntry | undefined {
  return lists.get(activeListId);
}

function makeList(state?: ListState): ListEntry {
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

function mergeLists(incoming: Record<string, ListState>): void {
  for (const [id, state] of Object.entries(incoming)) {
    if (!lists.has(id)) {
      lists.set(id, makeList(state));
    } else {
      const list = lists.get(id)!;
      list.todos.merge(state.todos);
      list.completed.merge(state.completed);
      list.title.merge(state.title);
      for (const [textId, textState] of Object.entries(state.texts ?? {})) {
        const reg = list.itemTexts.get(textId);
        if (reg) reg.merge(textState);
        else
          list.itemTexts.set(
            textId,
            new LWWRegister<string>(nodeId, textState),
          );
      }
    }
  }
}

function localState(): SharedState {
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

function connect(): void {
  ws = new WebSocket(wsUrl);
  ws.onopen = () => setStatus("connected", "Connected");

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as WSMessage;
    if (msg.type === "welcome") {
      lists.clear();
      mergeLists(msg.state.lists);
      if (!lists.has(activeListId))
        activeListId = Object.keys(msg.state.lists)[0] ?? "";
    } else if (msg.type === "state") {
      mergeLists(msg.state.lists);
    }
    if (msg.deletedLists) {
      for (const id of msg.deletedLists) {
        lists.delete(id);
        if (activeListId === id) activeListId = lists.keys().next().value ?? "";
      }
    }
    if (msg.clientCount !== undefined)
      document.getElementById("clients-count")!.textContent =
        `${msg.clientCount} connected`;
    render();
  };

  ws.onclose = () => {
    setStatus("error", "Reconnecting...");
    setTimeout(connect, 2000);
  };
  ws.onerror = () => setStatus("error", "Error");
}

function sendUpdate(): void {
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(
      JSON.stringify({
        type: "update",
        nodeId,
        state: localState(),
      } as WSMessage),
    );
}

function render(): void {
  renderSidebar();
  renderList();
}

function renderSidebar(): void {
  for (const [id, list] of lists) {
    const li = document.createElement("li");
    li.className = "list-item" + (id === activeListId ? " active" : "");
    li.onclick = () => {
      activeListId = id;
      render();
    };

    const del = document.createElement("button");
    del.className = "btn-delete-list";
    del.textContent = "x";
    del.onclick = (e) => {
      e.stopPropagation();
      deleteList(id);
    };

    const name = document.createElement("span");
    name.textContent = list.title.get() ?? "New List";

    const nav = document.getElementById("list-nav")!;
    li.appendChild(name);
    li.appendChild(del);
    nav.appendChild(li);
  }
}

function renderList(): void {
  const list = getActiveList();
  const todoList = document.getElementById("todo-list")!;
  const label = document.getElementById("active-label")!;
  todoList.innerHTML = "";

  if (!list) {
    label.textContent = "Tasks";
    return;
  }

  const items = list.todos.elements();
  if (items.length === 0) {
    const tmpl = document.getElementById(
      "empty-template",
    ) as HTMLTemplateElement;
    todoList.appendChild(tmpl.content.cloneNode(true));
    label.textContent = "Tasks";
  } else {
    const done = items.filter((id) => list.completed.contains(id));
    label.textContent = `Tasks — ${done.length}/${items.length} done`;

    const sorted = [
      ...items.filter((id) => !list.completed.contains(id)),
      ...done,
    ];

    for (const id of sorted) {
      todoList.appendChild(makeTodoItem(id, list));
    }
  }

  const t = list.title.get();
  if (t && t !== title.textContent!.trim() && document.activeElement !== title)
    title.textContent = t;
}

function makeTodoItem(id: string, list: ListEntry): HTMLElement {
  const isDone = list.completed.contains(id);
  const currentText = list.itemTexts.get(id)?.get() ?? "";

  const li = document.createElement("li");
  li.className = "todo-item" + (isDone ? " done" : "");

  const box = document.createElement("div");
  box.className = "checkbox" + (isDone ? " checked" : "");
  box.title = isDone ? "Mark undone" : "Mark done";
  box.onclick = () => toggleDone(id, isDone);

  const text = document.createElement("span");
  text.className = "todo-text";
  text.textContent = currentText;
  text.ondblclick = () => {
    text.contentEditable = "true";
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
  };
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      text.blur();
    }
  });
  text.addEventListener("blur", () => {
    if (text.contentEditable !== "true") return;
    text.contentEditable = "false";
    const newText = text.textContent?.trim() ?? "";
    if (newText && newText !== currentText) commitEdit(id, newText);
    else text.textContent = currentText;
  });

  const del = document.createElement("button");
  del.className = "btn-remove";
  del.textContent = "x";
  del.title = "Remove";
  del.onclick = () => removeItem(id);

  li.appendChild(box);
  li.appendChild(text);
  li.appendChild(del);
  return li;
}

function addItem(text: string): void {
  const list = getActiveList();
  if (!list || !text) return;
  const id = Math.random().toString(36).slice(2, 10);
  const reg = new LWWRegister<string>(nodeId);
  reg.set(text);
  list.itemTexts.set(id, reg);
  list.todos.add(id);
  sendUpdate();
  render();
}

function removeItem(id: string): void {
  const list = getActiveList();
  if (!list) return;
  list.todos.remove(id);
  list.completed.remove(id);
  sendUpdate();
  render();
}

function toggleDone(id: string, isDone: boolean): void {
  const list = getActiveList();
  if (!list) return;
  if (isDone) list.completed.remove(id);
  else list.completed.add(id);
  sendUpdate();
  render();
}

function commitEdit(id: string, newText: string): void {
  const list = getActiveList();
  if (!list) return;
  list.itemTexts.get(id)!.set(newText);
  sendUpdate();
  render();
}

function deleteList(id: string): void {
  if (lists.size <= 1) return;
  lists.delete(id);
  if (activeListId === id) activeListId = lists.keys().next().value ?? "";
  if (ws && ws.readyState === WebSocket.OPEN)
    ws.send(
      JSON.stringify({
        type: "deleteList",
        nodeId,
        listId: id,
        state: localState(),
      } as WSMessage),
    );
  render();
}

function createList(): void {
  const id = "list-" + Math.random().toString(36).slice(2, 8);
  const entry = makeList();
  entry.title.set("New List");
  lists.set(id, entry);
  activeListId = id;
  sendUpdate();
  render();
}

function setStatus(type: string, text: string): void {
  document.getElementById("dot")!.className = "dot " + type;
  document.getElementById("status-text")!.textContent = text;
}

title.addEventListener("blur", () => {
  const list = getActiveList();
  if (!list) return;
  const val = title.textContent!.trim();
  const resolved = val || "New List";
  title.textContent = resolved;
  if (resolved !== list.title.get()) {
    list.title.set(resolved);
    sendUpdate();
    renderSidebar();
  }
});

title.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    title.blur();
  }
});

document.getElementById("btn-add")!.onclick = () => {
  const v = input.value.trim();
  if (v) {
    addItem(v);
    input.value = "";
    input.focus();
  }
};

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btn-add")!.click();
});

document.getElementById("btn-new-list")!.onclick = () => createList();

connect();
