class StationManager {
    constructor() {
        this.stations = {};
        this.region = {};
        this.selectedStationId = this.loadSelectedStation();
        this.isLoading = false;
    }

    async loadStations() {
        if (this.isLoading) return;
        this.isLoading = true;

        try {
            const response = await fetch('https://raw.githubusercontent.com/ExpTechTW/API/refs/heads/main/resource/station.csv');
            const csvText = await response.text();

            const regionResponse = await fetch('https://raw.githubusercontent.com/ExpTechTW/TREM-Lite/refs/heads/main/src/resource/data/region.json');
            this.region = await regionResponse.json();

            this.parseStations(csvText);
        } catch (error) {
            console.error('Failed to load stations:', error);
        } finally {
            this.isLoading = false;
        }
    }

    parseStations(csvText) {
        const rows = csvText.split('\n');
        this.stations = {};

        rows.forEach((row, index) => {
            if (!row.trim()) return;
            const cols = row.split(',').map(c => c.trim());

            // Skip header
            if (index === 0 && (cols[0].toLowerCase() === 'loc_code' || cols[0].toLowerCase() === 'station' || cols[0].toLowerCase() === 'code')) {
                return;
            }

            if (cols.length >= 7) {
                const id = cols[1];
                let net = cols[6];
                if (net === "1") net = "SE-Net";
                else if (net === "2") net = "MS-Net";
                else if (net === "3") net = "ES-Net";
                const stationCode = cols[5];

                // Only include ES-Net stations
                if (net === "ES-Net") {
                    const location = this.getLocationName(stationCode); // Use code column for location lookup
                    // console.log('Adding station:', id, 'code:', stationCode, 'location:', location);
                    this.stations[id] = {
                        net: net,
                        info: [{ code: stationCode }],
                        location: location
                    };
                }
            }
        });
    }

    getLocationName(code) {
        // Parse location from code (direct match with region.json codes)
        if (!code) {
            // console.log('Invalid code:', code);
            return "未知地區";
        }

        try {
            const townCode = parseInt(code);
            // console.log('Looking up code:', townCode);

            // Find city name and town name
            for (const [cityKey, cityData] of Object.entries(this.region)) {
                // console.log('Checking city:', cityKey);

                // Find town name
                for (const [townKey, townData] of Object.entries(cityData)) {
                    if (townKey !== 'code' && townData.code === townCode) {
                        // console.log('Found match:', cityKey, townKey, 'for code:', townCode);
                        return `${cityKey}${townKey}`;
                    }
                }
            }

            console.log('No match found for code:', townCode);
            return "未知地區";
        } catch (error) {
            console.error('Error parsing location:', error, code);
            return "未知地區";
        }
    }

    getESNetStations() {
        return Object.entries(this.stations)
            .filter(([id, station]) => station.net === "ES-Net")
            .map(([id, station]) => ({
                id: id,
                location: station.location || "未知地區",
                net: station.net,
                code: station.info && station.info[0] ? parseInt(station.info[0].code) : 0
            }))
            .sort((a, b) => a.code - b.code);
    }

    saveSelectedStation(stationId) {
        this.selectedStationId = stationId;
        localStorage.setItem('selectedStationId', stationId);
    }

    loadSelectedStation() {
        return localStorage.getItem('selectedStationId') || null;
    }

    getSelectedStation() {
        return this.selectedStationId;
    }

    getStationInfo(stationId) {
        return this.stations[stationId] || null;
    }
}

module.exports = { StationManager };