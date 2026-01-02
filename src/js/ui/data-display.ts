import { ES } from '../constants';

class DataDisplay {
    private isInitialized: boolean;

    constructor() {
        this.isInitialized = false;
    }

    initialize() {
        this.resetDisplay();
        this.isInitialized = true;
    }

    updateIntensityData(intensity: number, pga: number, timestamp: number) {
        if (!this.isInitialized) return;

        const intensityElement = document.getElementById('val-int') as HTMLElement;
        if (intensityElement) {
            intensityElement.textContent = intensity.toFixed(1);
            const level = ES.getIntensityLevel(intensity);
            intensityElement.style.color = ES.INTENSITY_TEXTS[level];
        }

        const pgaElement = document.getElementById('val-pga');
        if (pgaElement) {
            pgaElement.textContent = pga.toFixed(2);
        }

        const intensityLevelElement = document.getElementById('val-int-level') as HTMLElement;
        if (intensityLevelElement) {
            const level = ES.getIntensityLevel(intensity);
            intensityLevelElement.textContent = level;
            intensityLevelElement.style.backgroundColor = ES.INTENSITY_COLORS[level];
            intensityLevelElement.style.color = ES.INTENSITY_TEXTS[level];
        }

        // Update card backgrounds
        const cardInt = document.getElementById('card-int') as HTMLElement;
        if (cardInt) {
            const level = ES.getIntensityLevel(intensity);
            cardInt.style.backgroundColor = ES.INTENSITY_COLORS[level];
            const label = cardInt.querySelector('.label') as HTMLElement;
            if (label) {
                label.style.color = ES.INTENSITY_TEXTS[level];
            }
        }
        const cardIntLevel = document.getElementById('card-int-level') as HTMLElement;
        if (cardIntLevel) {
            const level = ES.getIntensityLevel(intensity);
            cardIntLevel.style.backgroundColor = ES.INTENSITY_COLORS[level];
            const label = cardIntLevel.querySelector('.label') as HTMLElement;
            if (label) {
                label.style.color = ES.INTENSITY_TEXTS[level];
            }
        }

        const timeElement = document.getElementById('val-time');
        if (timeElement) {
            const date = new Date(Number(timestamp));
            const timeStr = date.toLocaleString('zh-TW', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            }).replace(/\//g, '-').replace('24:', '00:');
            timeElement.innerHTML = timeStr.replace(' ', '<br>');
        }
    }

    updateDataStatus(hasData: boolean) {
        if (!this.isInitialized) return;

        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            if (hasData) {
                statusElement.textContent = '🟢 Connected';
            } else {
                statusElement.textContent = '🟡 No Data';
                this.resetDisplay();
            }
        }
    }

    resetDisplay() {
        const intensityElement = document.getElementById('val-int') as HTMLElement;
        if (intensityElement) {
            intensityElement.textContent = '----';
            intensityElement.style.color = '';
        }

        const pgaElement = document.getElementById('val-pga');
        if (pgaElement) {
            pgaElement.textContent = '----';
        }

        const intensityLevelElement = document.getElementById('val-int-level') as HTMLElement;
        if (intensityLevelElement) {
            intensityLevelElement.textContent = '--';
            intensityLevelElement.style.backgroundColor = '';
            intensityLevelElement.style.color = '';
        }

        // Reset card backgrounds
        const cardInt = document.getElementById('card-int') as HTMLElement;
        if (cardInt) {
            cardInt.style.backgroundColor = '';
            const label = cardInt.querySelector('.label') as HTMLElement;
            if (label) {
                label.style.color = '';
            }
        }
        const cardIntLevel = document.getElementById('card-int-level') as HTMLElement;
        if (cardIntLevel) {
            cardIntLevel.style.backgroundColor = '';
            const label = cardIntLevel.querySelector('.label') as HTMLElement;
            if (label) {
                label.style.color = '';
            }
        }

        const timeElement = document.getElementById('val-time');
        if (timeElement) {
            timeElement.innerHTML = '----/--/--<br>--:--:--';
        }
    }

    updateConnectionStatus(status: string) {
        if (!this.isInitialized) return;

        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            switch (status) {
                case 'connected':
                    statusElement.textContent = '🟢 Connected';
                    break;
                case 'connecting':
                    statusElement.textContent = '🔄 Connecting';
                    break;
                case 'disconnected':
                    statusElement.textContent = '🔴 Disconnected';
                    break;
                case 'error':
                    statusElement.textContent = '❌ Connection Error';
                    break;
                default:
                    statusElement.textContent = '⚪ Unknown';
            }
        }
    }

    updateStationInfo(stationId: string) {
        if (!this.isInitialized) return;

        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            if (window.stationSelector) {
                const stationInfo = window.stationSelector.stationManager.getStationInfo(stationId);
                if (stationInfo && stationInfo.areaCode) {
                    stationElement.textContent = `E-${stationInfo.areaCode}-${stationId}`;
                } else {
                    stationElement.textContent = `E-${stationId}`;
                }
            } else {
                stationElement.textContent = `E-${stationId}`;
            }
        }

        const areaElement = document.getElementById('val-area');
        if (areaElement && window.stationSelector) {
            const stationInfo = window.stationSelector.stationManager.getStationInfo(stationId);
            if (stationInfo && stationInfo.location) {
                areaElement.textContent = stationInfo.location;
            } else {
                areaElement.textContent = '--- ---';
            }
        }
    }

    initializeUI() {
        const statusElement = document.getElementById('val-status');
        if (statusElement) {
            statusElement.textContent = '🔄 Connecting';
        }

        const stationElement = document.getElementById('val-station');
        if (stationElement) {
            stationElement.textContent = '-----';
        }

        const areaElement = document.getElementById('val-area');
        if (areaElement) {
            areaElement.textContent = '--- ---';
        }
    }

    destroy() {
        this.isInitialized = false;
    }
}

export default DataDisplay;