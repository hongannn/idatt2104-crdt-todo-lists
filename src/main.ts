import { ORSet } from "./crdt/ORSet";
import { LWWRegister } from "./crdt/LWWRegister";
import type { ListState, SharedState, WSMessage } from "./protocol";

const nodeId = "browser-" + Math.random().toString(36).slice(2, 8);
document.getElementById("node-id")!.textContent = "Node: " + nodeId;

interface ListEntry {
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
}

const lists = new Map<string, ListEntry>();
let activeListId = "";

function activeList(): ListEntry | undefined {
  return lists.get(activeListId);
}

function makeList(state?: ListState): ListEntry {
  return {
    todos: new ORSet(nodeId, state?.todos),
    completed: new ORSet(nodeId, state?.completed),
    title: new LWWRegister<string>(nodeId, state?.title),
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
    }
  }
}

function localState(): SharedState {
  const result: Record<string, ListState> = {};
  for (const [id, list] of lists) {
    result[id] = {
      todos: list.todos.getState(),
      completed: list.completed.getState(),
      title: list.title.getState(),
    };
  }
  return { lists: result };
}

const wsUrl = "ws://" + location.host;
let ws: WebSocket;

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
  const nav = document.getElementById("list-nav")!;
  nav.innerHTML = "";
  for (const [id, list] of lists) {
    const li = document.createElement("li");
    li.className = "list-item" + (id === activeListId ? " active" : "");
    li.onclick = () => {
      activeListId = id;
      render();
    };

    const name = document.createElement("span");
    name.textContent = list.title.get() ?? "New List";

    const del = document.createElement("button");
    del.className = "btn-delete-list";
    del.textContent = "x";
    del.onclick = (e) => {
      e.stopPropagation();
      deleteList(id);
    };

    li.appendChild(name);
    li.appendChild(del);
    nav.appendChild(li);
  }
}

function renderList(): void {
  const list = activeList();
  const todoList = document.getElementById("todo-list")!;
  const label = document.getElementById("active-label")!;
  const titleEl = document.getElementById("title-el")!;

  if (!list) {
    todoList.innerHTML = "";
    label.textContent = "Tasks";
    return;
  }

  const items = list.todos.elements();
  todoList.innerHTML = "";

  if (items.length === 0) {
    const tmpl = document.getElementById(
      "empty-template",
    ) as HTMLTemplateElement;
    todoList.appendChild(tmpl.content.cloneNode(true));
    label.textContent = "Tasks";
  } else {
    const done = items.filter((t) => list.completed.contains(t));
    label.textContent = `Tasks — ${done.length}/${items.length} done`;

    const sorted = [
      ...items.filter((t) => !list.completed.contains(t)),
      ...done,
    ];

    for (const item of sorted) {
      const isDone = list.completed.contains(item);
      const li = document.createElement("li");
      li.className = "todo-item" + (isDone ? " done" : "");

      const box = document.createElement("div");
      box.className = "checkbox" + (isDone ? " checked" : "");
      box.title = isDone ? "Mark undone" : "Mark done";
      box.onclick = () => toggleDone(item, isDone);

      const text = document.createElement("span");
      text.className = "todo-text";
      text.textContent = item;

      const del = document.createElement("button");
      del.className = "btn-remove";
      del.textContent = "x";
      del.title = "Remove";
      del.onclick = () => removeItem(item);

      li.appendChild(box);
      li.appendChild(text);
      li.appendChild(del);
      todoList.appendChild(li);
    }
  }

  const t = list.title.get();
  if (
    t &&
    t !== titleEl.textContent!.trim() &&
    document.activeElement !== titleEl
  )
    titleEl.textContent = t;
}

// Actions
function addItem(text: string): void {
  const list = activeList();
  if (!list || !text || list.todos.contains(text)) return;
  list.todos.add(text);
  sendUpdate();
  render();
}

function removeItem(text: string): void {
  const list = activeList();
  if (!list) return;
  list.todos.remove(text);
  list.completed.remove(text);
  sendUpdate();
  render();
}

function toggleDone(text: string, isDone: boolean): void {
  const list = activeList();
  if (!list) return;
  if (isDone) list.completed.remove(text);
  else list.completed.add(text);
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

// Title editing
const titleEl = document.getElementById("title-el")!;

titleEl.addEventListener("blur", () => {
  const list = activeList();
  if (!list) return;
  const val = titleEl.textContent!.trim();
  const resolved = val || "New List";
  titleEl.textContent = resolved;
  if (resolved !== list.title.get()) {
    list.title.set(resolved);
    sendUpdate();
    renderSidebar();
  }
});

titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    titleEl.blur();
  }
});

const input = document.getElementById("item-input") as HTMLInputElement;

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

function setStatus(type: string, text: string): void {
  document.getElementById("dot")!.className = "dot " + type;
  document.getElementById("status-text")!.textContent = text;
}

connect();
