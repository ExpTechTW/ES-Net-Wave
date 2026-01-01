const WAVEFORM_CONSTANTS = {
    CANVAS: {
        MAX_POINTS: 6000,
        DEFAULT_SCALE: 1.5,
        GRID_LINES: 6,
        TIME_INTERVAL: 10,
        SAMPLE_RATE: 0.02,
        MARGIN: 20
    },
    DATA: {
        BUFFER_SIZE: 6000,
        MAX_AMPLITUDE: 10.0,
        SAMPLE_RATE: 100
    },
    RENDER: {
        LINE_WIDTH: 2
    },
    COLORS: {
        GRID: '#222',
        TIME_TEXT: '#666',
        WAVE_X: '#ff0000',
        WAVE_Y: '#00ff00',
        WAVE_Z: '#00BBff',
        TRAFFIC_ACTIVE: '#0f0',
        TRAFFIC_IDLE: '#555'
    },
    UI: {
        FONT: '10px monospace',
        LAYOUT_CHECK_INTERVAL: 500,
        RESIZE_THRESHOLD: 5
    },
    PGA_THRESHOLDS: {
        CRITICAL: 8.0,
        WARNING: 2.5,
        NOTICE: 0.8
    },
    STATION: {
        DEFAULT_ID: "17E83F8"
    },
    INTENSITY_COLORS: {
        '0': '#1A1A1A',
        '1': '#003264',
        '2': '#0064C8',
        '3': '#1E9632',
        '4': '#FFC800',
        '5-': '#FF9600',
        '5+': '#FF6400',
        '6-': '#FF0000',
        '6+': '#C00000',
        '7': '#9600C8'
    },
    getIntensityLevel: function(intensity) {
        if (intensity < 0.5) return '0';
        if (intensity < 1.5) return '1';
        if (intensity < 2.5) return '2';
        if (intensity < 3.5) return '3';
        if (intensity < 4.5) return '4';
        if (intensity < 5.0) return '5-';
        if (intensity < 5.5) return '5+';
        if (intensity < 6.0) return '6-';
        if (intensity < 6.5) return '6+';
        return '7';
    }
};

module.exports = { WAVEFORM_CONSTANTS };