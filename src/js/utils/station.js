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
                const areaCode = cols[5]; // Area code from code column (region code)
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
                        areaCode: areaCode,
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
                areaCode: station.areaCode,
                code: station.info && station.info[0] ? parseInt(station.info[0].code) : 0
            }))
            .sort((a, b) => a.code - b.code);
    }

    getESNetStationsGroupedByCity() {
        const stations = this.getESNetStations();

        // Group stations by city
        const grouped = {};
        stations.forEach(station => {
            // Extract city from location (format: "縣市區鎮")
            let city = station.location;

            // Try to extract the city part (縣市) - match first occurrence of 縣 or 市
            // Examples: "新北市中和區" -> "新北市", "新竹縣竹東鎮" -> "新竹縣", "雲林縣斗六市" -> "雲林縣"
            const cityMatch = station.location.match(/^(.+?[縣市])/);
            if (cityMatch) {
                city = cityMatch[1]; // The city part
            }

            console.log(`Station ${station.id}: location="${station.location}" -> city="${city}"`);

            if (!grouped[city]) {
                grouped[city] = [];
            }
            grouped[city].push(station);
        });

        // Sort cities by the smallest area code in each city, then sort stations within each city
        const sortedCities = Object.keys(grouped).sort((a, b) => {
            const minCodeA = Math.min(...grouped[a].map(s => s.code));
            const minCodeB = Math.min(...grouped[b].map(s => s.code));
            return minCodeA - minCodeB;
        });

        const sortedGrouped = {};
        sortedCities.forEach(city => {
            sortedGrouped[city] = grouped[city].sort((a, b) => {
                // First sort by area code, then by station ID
                if (a.code !== b.code) {
                    return a.code - b.code;
                }
                return a.id.localeCompare(b.id);
            });
        });

        console.log('ES-Net stations grouped by city (sorted by area code):', sortedGrouped);
        return sortedGrouped;
    }

    getESNetStationsGroupedByTown() {
        const stations = this.getESNetStations();

        // Group stations by town
        const grouped = {};
        stations.forEach(station => {
            // Extract town from location (format: "縣市區鎮")
            // Examples: "新北市中和區", "新竹縣竹東鎮", "雲林縣斗六市", "屏東縣竹田鄉"
            let town = station.location;

            // Try to extract the administrative division (區/鎮/市/鄉)
            const patterns = [
                /(.+[縣市])(.+[區鎮市鄉])$/  // Match "縣市" + "區鎮市鄉"
            ];

            for (const pattern of patterns) {
                const match = station.location.match(pattern);
                if (match) {
                    town = match[2]; // The administrative division part
                    break;
                }
            }

            console.log(`Station ${station.id}: location="${station.location}" -> town="${town}"`);

            // Fallback: if no pattern matches, use the whole location
            if (town === station.location) {
                console.log(`Could not parse town from location: "${station.location}"`);
            }

            if (!grouped[town]) {
                grouped[town] = [];
            }
            grouped[town].push(station);
        });

        // Sort towns by the smallest area code in each town, then sort stations within each town
        const sortedTowns = Object.keys(grouped).sort((a, b) => {
            const minCodeA = Math.min(...grouped[a].map(s => s.code));
            const minCodeB = Math.min(...grouped[b].map(s => s.code));
            return minCodeA - minCodeB;
        });

        const sortedGrouped = {};
        sortedTowns.forEach(town => {
            sortedGrouped[town] = grouped[town].sort((a, b) => {
                // First sort by area code, then by station ID
                if (a.code !== b.code) {
                    return a.code - b.code;
                }
                return a.id.localeCompare(b.id);
            });
        });

        console.log('ES-Net stations grouped by town (sorted by area code):', sortedGrouped);
        return sortedGrouped;
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