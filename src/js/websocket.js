const WebSocket = require('ws');

class WSService {
    constructor(mainWindow) {
        this.mainWindow = mainWindow;
        this.ws = null;
        this.netStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
        this.state = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };
        this.deviceId = "17E83F8";
        this.wsUrl = "wss://bamboo.exptech.dev/ws/eswave";
        this.isManualReconnect = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseReconnectDelay = 1000; // 1 second
        this.maxReconnectDelay = 30000; // 30 seconds
        this.init();
    }

    init() {
        this.connect();
        setInterval(() => {
            const hb = this.getHeartbeat();
            this.sendToRenderer('server-heartbeat', hb);
        }, 1000);
    }

    connect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached, stopping reconnection');
            this.sendToRenderer('connection-status', 'error');
            return;
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            this.isManualReconnect = false;
            this.reconnectAttempts = 0; // Reset on successful connection
            this.sendToRenderer('connection-status', 'connected');
            this.ws.send(this.deviceId);
        });

        this.ws.on('message', (data, isBinary) => {
            if (isBinary) {
                this.handleMessage(data.toString('latin1'));
            } else {
                this.handleMessage(data.toString('utf8'));
            }
        });

        this.ws.on('error', (error) => {
            console.error('WebSocket error:', error);
            this.sendToRenderer('connection-status', 'error');

            // Check if it's a server error (5xx) that needs longer delay
            const isServerError = error.message && (
                error.message.includes('522') ||
                error.message.includes('502') ||
                error.message.includes('503') ||
                error.message.includes('504') ||
                error.message.includes('Unexpected server response')
            );

            if (isServerError) {
                this.reconnectAttempts++;
                const delay = Math.min(
                    this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts),
                    this.maxReconnectDelay
                );
                console.log(`Server error detected, retrying in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                setTimeout(() => this.connect(), delay);
            }
        });

        this.ws.on('close', () => {
            console.log('WebSocket closed');
            this.sendToRenderer('connection-status', 'disconnected');

            if (!this.isManualReconnect) {
                // Only auto-reconnect if not manually triggered
                // Use shorter delay for normal disconnections
                setTimeout(() => this.connect(), this.baseReconnectDelay);
            }
        });
    }

    handleMessage(message) {
        try {
            // Forward the raw message to renderer for processing
            this.sendToRenderer('ws-message', message);
            // Also send connected status since we're receiving data
            this.sendToRenderer('connection-status', 'connected');
        } catch (e) {
            console.error(e);
        }
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            try {
                this.mainWindow.webContents.send(channel, data);
            } catch (error) {
                console.error('Failed to send message to renderer:', error);
            }
        }
    }

    getHeartbeat() {
        const isActive = (Date.now() / 1000 - this.netStatus.lastPktTime) < 5;
        return { count: isActive ? this.netStatus.pktCount : 0, lastId: this.netStatus.lastPktId };
    }

    setStation(stationId) {
        const wasChanged = this.deviceId !== stationId;

        if (wasChanged) {
            console.log(`Switching station from ${this.deviceId} to ${stationId}`);
        } else {
            console.log(`Reconnecting to station ${stationId}`);
        }

        this.deviceId = stationId;
        this.reconnectAttempts = 0; // Reset reconnection attempts on station change

        // Always reset network status and clear waveform
        this.netStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
        this.state = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };

        // Clear waveform data in renderer
        this.sendToRenderer('clear-waveform');

        // Only reconnect if station actually changed
        if (wasChanged) {
            if (this.ws) {
                this.isManualReconnect = true;
                this.ws.close();
            }
            this.connect();
        }
    }
}

module.exports = WSService;