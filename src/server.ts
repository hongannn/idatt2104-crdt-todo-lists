/**
 * CRDT Collaborative Todo List — Server
 *
 * Maintains a globally merged SharedState.
 * On each client update: merges state, broadcasts result to all clients.
 */
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { LWWRegister } from './crdt/LWWRegister';
import { ORSet } from './crdt/ORSet';
import type { SharedState, WSMessage } from './protocol';

const PORT = 3001;
const SERVER_NODE_ID = 'server';

let todos     = new ORSet(SERVER_NODE_ID);
let completed = new ORSet(SERVER_NODE_ID);
let title     = new LWWRegister<string>(SERVER_NODE_ID);

function currentState(): SharedState {
  return {
    todos:     todos.getState(),
    completed: completed.getState(),
    title:     title.getState(),
  };
}

function mergeIncoming(state: SharedState): void {
  todos.merge(state.todos);
  completed.merge(state.completed);
  title.merge(state.title);
}

function broadcast(wss: WebSocketServer, msg: WSMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
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

  ws.send(JSON.stringify({ type: 'welcome', nodeId: SERVER_NODE_ID, state: currentState() } as WSMessage));

  ws.on('message', (raw) => {
    let msg: WSMessage;
    try { msg = JSON.parse(raw.toString()) as WSMessage; } catch { return; }
    if (msg.type !== 'update') return;

    mergeIncoming(msg.state);
    console.log(
      `[server] from ${msg.nodeId} | todos=[${todos.elements().join(', ')}] done=[${completed.elements().join(', ')}] title="${title.get()}"`,
    );

    broadcast(wss, { type: 'state', nodeId: SERVER_NODE_ID, state: currentState() });
  });

  ws.on('close', () => console.log(`[server] Client disconnected (${wss.clients.size} remaining)`));
  ws.on('error', (err) => console.error('[server] error:', err.message));
});
