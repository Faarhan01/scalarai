type MessageHandler = (message: any) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private pingInterval: any = null;
  private handlers: MessageHandler[] = [];
  private isIntentionallyClosed = false;

  connect(url: string, onOpen?: () => void, onClose?: () => void) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return;
    }

    this.isIntentionallyClosed = false;
    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        if (onOpen) onOpen();
        this.startPing();
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handlers.forEach((handler) => handler(message));
        } catch {
          // ignore invalid messages
        }
      };

      this.ws.onclose = () => {
        if (onClose) onClose();
        this.stopPing();
        if (!this.isIntentionallyClosed) {
          this.scheduleReconnect(url, onOpen, onClose);
        }
      };

      this.ws.onerror = () => {
        try { this.ws?.close(); } catch {}
      };
    } catch {
      this.scheduleReconnect(url, onOpen, onClose);
    }
  }

  onMessage(handler: MessageHandler) {
    this.handlers.push(handler);
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  disconnect() {
    this.isIntentionallyClosed = true;
    this.stopPing();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private startPing() {
    this.stopPing();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping", clientTime: Date.now() }));
      }
    }, 15000);
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private scheduleReconnect(url: string, onOpen?: () => void, onClose?: () => void) {
    if (this.reconnectTimeout) return;
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect(url, onOpen, onClose);
    }, 2500);
  }
}
