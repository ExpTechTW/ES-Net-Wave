export interface ParsedSensorData {
  x: number[];
  y: number[];
  z: number[];
}

export interface ParsedIntensityData {
  intensity: number;
  pga: number;
  timestamp: number;
}

export interface ParsedMessage {
  type: "intensity" | "sensor" | null;
  intensityData?: ParsedIntensityData;
  sensorData?: ParsedSensorData;
}

export function parseWebSocketMessage(
  data: string,
  expectedStationId: string,
): ParsedMessage | null {
  const parts = data.split("~");
  if (parts.length !== 3) {
    return null;
  }

  const stationId = parts[0];
  if (stationId !== expectedStationId) {
    return null;
  }

  const payload = parts[1];
  const status = parts[2];

  if (status.charCodeAt(0) !== 0x01) {
    return null;
  }

  try {
    const binaryString = atob(payload);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    if (bytes.length < 1) {
      return null;
    }

    const msgType = bytes[0];

    if (msgType === 0x11) {
      // 震度數據
      if (bytes.length < 17) return null; // 1 + 8 + 4 + 4

      const dataView = new DataView(bytes.buffer);
      const ts = dataView.getBigUint64(1, true);
      const intensity = dataView.getFloat32(9, true);
      const pga = dataView.getFloat32(13, true);

      return {
        type: "intensity",
        intensityData: {
          intensity,
          pga,
          timestamp: Number(ts),
        },
      };
    } else if (msgType === 0x10) {
      // 感測器數據
      if (bytes.length < 10) return null;

      const count = bytes[1];
      const xArr: number[] = [];
      const yArr: number[] = [];
      const zArr: number[] = [];
      let offset = 10;

      for (let i = 0; i < count; i++) {
        if (offset + 12 > bytes.length) break;
        const dataView = new DataView(bytes.buffer);
        const x = dataView.getFloat32(offset, true);
        const y = dataView.getFloat32(offset + 4, true);
        const z = dataView.getFloat32(offset + 8, true);
        xArr.push(x);
        yArr.push(y);
        zArr.push(z);
        offset += 12;
      }

      if (xArr.length === 0) return null;

      return {
        type: "sensor",
        sensorData: {
          x: xArr,
          y: yArr,
          z: zArr,
        },
      };
    }
  } catch (error) {
    console.error("Error parsing message:", error);
  }

  return null;
}
