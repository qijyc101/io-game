import type {
  ClientMessage,
  ServerMessage,
  StateMessage,
  WelcomeMessage,
  DiedMessage,
  KilledMessage,
} from "@io-game/shared";

export type GameSocketCallbacks = {
  onWelcome: (msg: WelcomeMessage) => void;
  onState: (msg: StateMessage) => void;
  onDied: (msg: DiedMessage) => void;
  onKilled: (msg: KilledMessage) => void;
  onDisconnect: () => void;
};

export class GameSocket {
  private ws: WebSocket | null = null;
  private seq = 0;
  private callbacks: GameSocketCallbacks;
  private stateListeners = new Set<(msg: StateMessage) => void>();

  constructor(callbacks: GameSocketCallbacks) {
    this.callbacks = callbacks;
  }

  onStateMessage(listener: (msg: StateMessage) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  connect(nickname: string): void {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}//${host}/ws`);

    this.ws.onopen = () => {
      this.send({ type: "join", nickname });
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data as string) as ServerMessage;
      switch (msg.type) {
        case "welcome":
          this.callbacks.onWelcome(msg);
          break;
        case "state":
          this.callbacks.onState(msg);
          for (const listener of this.stateListeners) {
            listener(msg);
          }
          break;
        case "died":
          this.callbacks.onDied(msg);
          break;
        case "killed":
          this.callbacks.onKilled(msg);
          break;
      }
    };

    this.ws.onclose = () => {
      this.callbacks.onDisconnect();
    };
  }

  sendInput(move: { x: number; y: number }, aim: number, shoot: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.seq++;
    this.send({
      type: "input",
      seq: this.seq,
      move,
      aim,
      shoot,
    });
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  private send(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }
}
