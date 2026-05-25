import { ORSet } from "./crdt/ORSet";
import { LWWRegister } from "./crdt/LWWRegister";
import type { SharedState, WSMessage } from "./protocol";

const nodeId = "browser-" + Math.random().toString(36).slice(2, 8);
document.getElementById("node-id")!.textContent = "Node: " + nodeId;

let todos = new ORSet(nodeId);
let completed = new ORSet(nodeId);
let title = new LWWRegister<string>(nodeId);

function localState(): SharedState {
  return {
    todos: todos.getState(),
    completed: completed.getState(),
    title: title.getState(),
  };
}

const wsUrl = "ws://" + location.host;
let ws: WebSocket;

function connect(): void {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => setStatus("connected", "Connected");

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as WSMessage;
    if (msg.type === "welcome") {
      todos = new ORSet(nodeId, msg.state.todos);
      completed = new ORSet(nodeId, msg.state.completed);
      title = new LWWRegister<string>(nodeId, msg.state.title);
    } else if (msg.type === "state") {
      todos.merge(msg.state.todos);
      completed.merge(msg.state.completed);
      title.merge(msg.state.title);
    }
    if (msg.clientCount !== undefined) {
      document.getElementById("clients-count")!.textContent = `${msg.clientCount} connected`;
    }
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
  const items = todos.elements();
  const list = document.getElementById("todo-list")!;
  const label = document.getElementById("active-label")!;

  list.innerHTML = "";

  if (items.length === 0) {
    const tmpl = document.getElementById(
      "empty-template",
    ) as HTMLTemplateElement;
    list.appendChild(tmpl.content.cloneNode(true));
    label.textContent = "Tasks";
  } else {
    const doneItems = items.filter((t) => completed.contains(t));
    label.textContent = `Tasks — ${doneItems.length}/${items.length} done`;

    const sorted = [
      ...items.filter((t) => !completed.contains(t)),
      ...items.filter((t) => completed.contains(t)),
    ];

    for (const item of sorted) {
      const isDone = completed.contains(item);
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
      list.appendChild(li);
    }
  }

  const titleEl = document.getElementById("title-el")!;
  const t = title.get();
  if (
    t &&
    t !== titleEl.textContent!.trim() &&
    document.activeElement !== titleEl
  ) {
    titleEl.textContent = t;
  }
}

// Actions
function addItem(text: string): void {
  if (!text || todos.contains(text)) return;
  todos.add(text);
  sendUpdate();
  render();
}

function removeItem(text: string): void {
  todos.remove(text);
  completed.remove(text);
  sendUpdate();
  render();
}

function toggleDone(text: string, isDone: boolean): void {
  if (isDone) completed.remove(text);
  else completed.add(text);
  sendUpdate();
  render();
}

// Title editing
const titleEl = document.getElementById("title-el")!;

titleEl.addEventListener("blur", () => {
  const val = titleEl.textContent!.trim();
  const resolved = val || "Todo List";
  titleEl.textContent = resolved;
  if (resolved !== title.get()) {
    title.set(resolved);
    sendUpdate();
  }
});

titleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    titleEl.blur();
  }
});

// Input / button
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

// Status
function setStatus(type: string, text: string): void {
  document.getElementById("dot")!.className = "dot " + type;
  document.getElementById("status-text")!.textContent = text;
}

connect();
