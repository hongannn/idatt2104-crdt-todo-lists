import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { LWWRegister } from './crdt/LWWRegister';
import { ORSet } from './crdt/ORSet';
import type { ListState, SharedState, WSMessage } from './protocol';

const PORT = 3001;
const SERVER_NODE_ID = 'server';

interface ListCRDTs {
  todos: ORSet;
  completed: ORSet;
  title: LWWRegister<string>;
}

function makeList(state?: ListState): ListCRDTs {
  return {
    todos: new ORSet(SERVER_NODE_ID, state?.todos),
    completed: new ORSet(SERVER_NODE_ID, state?.completed),
    title: new LWWRegister<string>(SERVER_NODE_ID, state?.title),
  };
}

const lists = new Map<string, ListCRDTs>();
const defaultList = makeList();
defaultList.title.set('New List');
lists.set('default', defaultList);

function currentState(): SharedState {
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

function mergeIncoming(state: SharedState): void {
  for (const [id, listState] of Object.entries(state.lists)) {
    if (!lists.has(id)) {
      lists.set(id, makeList(listState));
    } else {
      const list = lists.get(id)!;
      list.todos.merge(listState.todos);
      list.completed.merge(listState.completed);
      list.title.merge(listState.title);
    }
  }
}

function broadcast(wss: WebSocketServer, msg: WSMessage, exclude?: WebSocket): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'text/javascript',
};

const httpServer = http.createServer((req, res) => {
  const url = req.url === '/' ? '/index.html' : req.url ?? '/index.html';
  const ext = path.extname(url);
  const filePath = path.join(__dirname, '..', 'public', path.basename(url));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});

wss.on('connection', (ws) => {
  console.log(`[server] Client connected (${wss.clients.size} total)`);

  const state = currentState();
  ws.send(JSON.stringify({ type: 'welcome', nodeId: SERVER_NODE_ID, state, clientCount: wss.clients.size } as WSMessage));
  broadcast(wss, { type: 'state', nodeId: SERVER_NODE_ID, state, clientCount: wss.clients.size }, ws);

  ws.on('message', (raw) => {
    let msg: WSMessage;
    try { msg = JSON.parse(raw.toString()) as WSMessage; } catch { return; }
    if (msg.type === 'deleteList' && msg.listId) {
      lists.delete(msg.listId);
      broadcast(wss, { type: 'state', nodeId: SERVER_NODE_ID, state: currentState(), clientCount: wss.clients.size, deletedLists: [msg.listId] });
      return;
    }

    if (msg.type !== 'update') return;

    mergeIncoming(msg.state);
    console.log(`[server] from ${msg.nodeId} | ${lists.size} lists`);

    broadcast(wss, { type: 'state', nodeId: SERVER_NODE_ID, state: currentState(), clientCount: wss.clients.size });
  });

  ws.on('close', () => {
    console.log(`[server] Client disconnected (${wss.clients.size} remaining)`);
    broadcast(wss, { type: 'state', nodeId: SERVER_NODE_ID, state: currentState(), clientCount: wss.clients.size });
  });
  ws.on('error', (err) => console.error('[server] error:', err.message));
});
