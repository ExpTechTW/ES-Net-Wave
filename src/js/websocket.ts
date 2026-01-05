import { ipcRenderer } from 'electron';
import * as constants from './constants';

interface NetStatus {
    lastPktTime: number;
    lastPktId: string;
    pktCount: number;
}

interface State {
    intensity: number;
    pga: number;
    ts: number;
    tsStr: string;
}

class WSService {
    private ws: WebSocket | null = null;
    private netStatus: NetStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
    private state: State = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };
    private deviceId: string = constants.ES.STATION.DEFAULT_ID;
    private currentStation: string = this.deviceId;
    private wsUrl: string = "wss://bamboo.exptech.dev/ws/eswave";
    private isManualReconnect: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private baseReconnectDelay: number = 1000;
    private maxReconnectDelay: number = 30000;
    private heartbeatInterval: NodeJS.Timeout | null = null;

    constructor() {
        const savedStationId = localStorage.getItem('selectedStationId');
        this.currentStation = savedStationId || constants.ES.STATION.DEFAULT_ID;

        this.heartbeatInterval = setInterval(() => {
            const hb = this.getHeartbeat();
            this.sendToRenderer('server-heartbeat', hb);
        }, 1000);
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            return;
        }
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached, stopping reconnection');
            this.sendToRenderer('connection-status', 'error');
            return;
        }

        // Only send connecting status if not manually reconnecting (to avoid duplicate status)
        if (!this.isManualReconnect) {
            this.sendToRenderer('connection-status', 'connecting');
        }

        this.ws = new WebSocket(this.wsUrl);

        this.ws.addEventListener('open', () => {
            console.log('WebSocket connected');
            this.isManualReconnect = false;
            this.reconnectAttempts = 0;
            this.sendToRenderer('connection-status', 'connected');
            if (this.ws) {
                this.ws.send(this.currentStation);
            }
        });

        this.ws.addEventListener('message', (event) => {
            const data = event.data;
            this.handleMessage(typeof data === 'string' ? data : data.toString('latin1'));
        });

        this.ws.addEventListener('error', (error: Event) => {
            console.error('WebSocket error:', error);
            this.sendToRenderer('connection-status', 'error');

            const errorEvent = error as ErrorEvent;
            const isServerError = errorEvent.message && (
                errorEvent.message.includes('522') ||
                errorEvent.message.includes('502') ||
                errorEvent.message.includes('503') ||
                errorEvent.message.includes('504') ||
                errorEvent.message.includes('Unexpected server response')
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

        this.ws.addEventListener('close', () => {
            console.log('WebSocket closed');
            // Only send disconnected status if not manually reconnecting
            if (!this.isManualReconnect) {
                this.sendToRenderer('connection-status', 'disconnected');
            }

            if (!this.isManualReconnect) {
                setTimeout(() => this.connect(), this.baseReconnectDelay);
            }
        });
    }

    handleMessage(message: string) {
        try {
            this.sendToRenderer('ws-message', message);
            this.sendToRenderer('connection-status', 'connected');
        } catch (e) {
            console.error(e);
        }
    }

    sendToRenderer(channel: string, data: any) {
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

    setStation(stationId: string) {
        const wasChanged = this.currentStation !== stationId;

        if (wasChanged) {
            console.log(`Switching station from ${this.currentStation} to ${stationId}`);
        }

        this.currentStation = stationId;
        this.reconnectAttempts = 0;

        this.netStatus = { lastPktTime: 0, lastPktId: "None", pktCount: 0 };
        this.state = { intensity: 0.0, pga: 0.0, ts: 0, tsStr: "Waiting..." };

        // Send connecting status immediately when switching stations
        this.sendToRenderer('connection-status', 'connecting');

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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

export default WSService;