const WebSocket = require('ws');
const { ipcRenderer } = require('electron');
const constants = require('../js/constants');

class WSService {
    constructor() {
        this.ws = null;
        this.netStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
        this.state = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };
        this.deviceId = constants.WAVEFORM_CONSTANTS.STATION.DEFAULT_ID;
        this.wsUrl = "wss://bamboo.exptech.dev/ws/eswave";
        this.isManualReconnect = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.baseReconnectDelay = 1000;
        this.maxReconnectDelay = 30000;

        this.heartbeatInterval = setInterval(() => {
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

        this.sendToRenderer('connection-status', 'connecting');

        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
            console.log('WebSocket connected');
            this.isManualReconnect = false;
            this.reconnectAttempts = 0;
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
                setTimeout(() => this.connect(), this.baseReconnectDelay);
            }
        });
    }

    handleMessage(message) {
        try {
            this.sendToRenderer('ws-message', message);
            this.sendToRenderer('connection-status', 'connected');
        } catch (e) {
            console.error(e);
        }
    }

    sendToRenderer(channel, data) {
        try {
            ipcRenderer.send('ws-message-to-main', { channel, data });
        } catch (error) {
            console.error('Failed to send message via IPC:', error);
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
        }

        this.deviceId = stationId;
        this.reconnectAttempts = 0;

        this.netStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
        this.state = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };

        if (this.ws) {
            this.isManualReconnect = true;
            this.ws.close();
        }
        this.connect();
    }

    destroy() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

module.exports = WSService;