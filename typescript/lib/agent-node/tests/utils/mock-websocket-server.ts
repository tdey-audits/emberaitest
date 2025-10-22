import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

export class MockWebSocketServer {
  private wss: WebSocketServer;
  private clients: Set<WebSocket> = new Set();
  private messageHandlers: Array<(ws: WebSocket, message: string) => void> = [];

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('message', (data) => {
        const message = data.toString();
        this.messageHandlers.forEach((handler) => handler(ws, message));
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('ping', () => {
        ws.pong();
      });
    });
  }

  onMessage(handler: (ws: WebSocket, message: string) => void): void {
    this.messageHandlers.push(handler);
  }

  broadcast(message: string): void {
    this.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  }

  send(ws: WebSocket, message: string): void {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  }

  getClientsCount(): number {
    return this.clients.size;
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.clients.forEach((client) => client.close());
      this.wss.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}
