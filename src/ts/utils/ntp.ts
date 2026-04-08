import { NtpTimeSync } from 'ntp-time-sync';
import { logger } from './logger.js';

interface TimeCache {
  syncedTime: number;
  lastSync: number;
}

class NTPManager {
  private static instance: NTPManager;
  private timeSync: NtpTimeSync | null = null;
  private cache: TimeCache = {
    syncedTime: 0,
    lastSync: 0,
  };
  private syncInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): NTPManager {
    if (!NTPManager.instance) {
      NTPManager.instance = new NTPManager();
    }
    return NTPManager.instance;
  }

  async initialize(): Promise<void> {
    try {
      this.timeSync = NtpTimeSync.getInstance({
        servers: ['time.exptech.com.tw'],
        sampleCount: 4,
        replyTimeout: 3000,
      });

      await this.syncTime();

      this.syncInterval = setInterval(() => {
        this.syncTime().catch((error) => {
          logger.error('NTP 同步錯誤:', error);
        });
      }, 60000);
    } catch (error) {
      logger.error('NTP 初始化錯誤:', error);
      this.cache.syncedTime = Date.now();
      this.cache.lastSync = Date.now();
    }
  }

  private async syncTime(): Promise<void> {
    if (!this.timeSync) return;

    try {
      const result = await this.timeSync.getTime(true);
      this.cache.syncedTime = result.now.getTime();
      this.cache.lastSync = Date.now();

      logger.info(`NTP 同步完成，偏移量: ${result.offset.toFixed(2)} ms`);
    } catch (error) {
      logger.error('NTP 同步失敗:', error);
      throw error;
    }
  }

  now(): number {
    if (!this.cache.syncedTime || !this.cache.lastSync) {
      return Date.now();
    }

    const offset = Date.now() - this.cache.lastSync;
    return this.cache.syncedTime + offset;
  }

  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

const ntpManager = NTPManager.getInstance();

export { ntpManager };
export default ntpManager.now.bind(ntpManager);