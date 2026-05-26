import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { WebSocketServer, WebSocket } from "ws";
import {
  makeList,
  mergeLists,
  serializeState,
  type ListEntry,
} from "./listUtils";
import type { WSMessage } from "./protocol";

const PORT = 3001;
const SERVER_NODE_ID = "server";

const lists = new Map<string, ListEntry>();
const defaultList = makeList(SERVER_NODE_ID);
defaultList.title.set("New List");
lists.set("default", defaultList);

function broadcast(
  wss: WebSocketServer,
  msg: WSMessage,
  exclude?: WebSocket,
): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client !== exclude && client.readyState === WebSocket.OPEN)
      client.send(payload);
  }
}

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
};

const httpServer = http.createServer((req, res) => {
  const url = req.url === "/" ? "/index.html" : (req.url ?? "/index.html");
  const ext = path.extname(url);
  const filePath = path.join(__dirname, "..", "public", path.basename(url));
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "text/plain" });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server: httpServer });
httpServer.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});

wss.on("connection", (ws) => {
  console.log(`[server] Client connected (${wss.clients.size} total)`);

  const state = serializeState(lists);
  ws.send(
    JSON.stringify({
      type: "welcome",
      nodeId: SERVER_NODE_ID,
      state,
      clientCount: wss.clients.size,
    } as WSMessage),
  );
  broadcast(
    wss,
    {
      type: "state",
      nodeId: SERVER_NODE_ID,
      state,
      clientCount: wss.clients.size,
    },
    ws,
  );

  ws.on("message", (raw) => {
    let msg: WSMessage;
    try {
      msg = JSON.parse(raw.toString()) as WSMessage;
    } catch {
      return;
    }
    if (msg.type === "deleteList" && msg.listId) {
      lists.delete(msg.listId);
      broadcast(wss, {
        type: "state",
        nodeId: SERVER_NODE_ID,
        state: serializeState(lists),
        clientCount: wss.clients.size,
        deletedLists: [msg.listId],
      });
      return;
    }

    if (msg.type !== "update") return;

    mergeLists(lists, SERVER_NODE_ID, msg.state.lists);
    console.log(`[server] from ${msg.nodeId} | ${lists.size} lists`);

    broadcast(wss, {
      type: "state",
      nodeId: SERVER_NODE_ID,
      state: serializeState(lists),
      clientCount: wss.clients.size,
    });
  });

  ws.on("close", () => {
    console.log(`[server] Client disconnected (${wss.clients.size} remaining)`);
    broadcast(wss, {
      type: "state",
      nodeId: SERVER_NODE_ID,
      state: serializeState(lists),
      clientCount: wss.clients.size,
    });
  });
  ws.on("error", (err) => console.error("[server] error:", err.message));
});
