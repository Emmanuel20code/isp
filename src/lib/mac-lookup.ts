/**
 * MAC Address OUI / Vendor database and helper utilities
 */

const OUI_VENDORS: Record<string, string> = {
  // Apple
  "00:03:93": "Apple",
  "00:05:02": "Apple",
  "00:0A:27": "Apple",
  "00:0A:95": "Apple",
  "00:0D:93": "Apple",
  "00:10:FA": "Apple",
  "00:11:24": "Apple",
  "00:14:51": "Apple",
  "00:16:CB": "Apple",
  "00:17:F2": "Apple",
  "00:19:E3": "Apple",
  "00:1B:63": "Apple",
  "00:1C:B3": "Apple",
  "00:1E:52": "Apple",
  "00:1E:C2": "Apple",
  "00:21:E9": "Apple",
  "00:22:41": "Apple",
  "00:23:12": "Apple",
  "00:23:32": "Apple",
  "00:23:6C": "Apple",
  "00:24:36": "Apple",
  "00:25:00": "Apple",
  "00:25:4B": "Apple",
  "00:25:BC": "Apple",
  "00:26:08": "Apple",
  "00:26:B0": "Apple",
  "00:88:65": "Apple",
  "28:6A:BA": "Apple",
  "70:EE:50": "Apple",
  "88:66:5A": "Apple",
  "A4:83:E7": "Apple",
  "AC:BC:32": "Apple",
  "BC:D0:74": "Apple",
  "DC:A9:04": "Apple",
  "F0:18:98": "Apple",
  "F8:FF:C2": "Apple",

  // Samsung
  "00:07:AB": "Samsung",
  "00:12:47": "Samsung",
  "00:15:99": "Samsung",
  "00:16:32": "Samsung",
  "00:17:C9": "Samsung",
  "00:18:AF": "Samsung",
  "00:1A:8A": "Samsung",
  "00:1D:25": "Samsung",
  "00:1E:7D": "Samsung",
  "00:21:19": "Samsung",
  "00:23:D6": "Samsung",
  "00:24:54": "Samsung",
  "00:26:5D": "Samsung",
  "18:3A:2D": "Samsung",
  "24:4B:03": "Samsung",
  "50:01:D9": "Samsung",
  "8C:77:12": "Samsung",
  "94:01:C2": "Samsung",
  "A0:07:98": "Samsung",
  "B8:5E:7B": "Samsung",
  "CC:07:AB": "Samsung",

  // Transsion (Tecno, Infinix, Itel) - Extremely popular in Africa / ISP networks
  "00:1E:E2": "Transsion (Tecno/Infinix)",
  "28:24:FF": "Transsion (Tecno/Infinix)",
  "74:D2:1D": "Transsion (Tecno/Infinix)",
  "BC:6A:29": "Transsion (Tecno/Infinix)",
  "E4:08:44": "Transsion (Tecno/Infinix)",
  "FC:A1:3E": "Transsion (Tecno/Infinix)",
  "10:2C:6B": "Transsion (Tecno/Infinix)",
  "40:4E:36": "Transsion (Tecno/Infinix)",
  "48:2C:A0": "Transsion (Tecno/Infinix)",
  "54:E4:3A": "Transsion (Tecno/Infinix)",
  "64:A2:F9": "Transsion (Tecno/Infinix)",
  "84:DB:AC": "Transsion (Tecno/Infinix)",
  "98:1C:12": "Transsion (Tecno/Infinix)",
  "A4:3B:FA": "Transsion (Tecno/Infinix)",
  "B4:F1:DA": "Transsion (Tecno/Infinix)",
  "C8:02:8F": "Transsion (Tecno/Infinix)",
  "E0:DC:FF": "Transsion (Tecno/Infinix)",
  "F8:8F:D9": "Transsion (Tecno/Infinix)",

  // Xiaomi / Redmi / POCO
  "00:9E:C8": "Xiaomi",
  "18:59:36": "Xiaomi",
  "28:6C:07": "Xiaomi",
  "34:80:0D": "Xiaomi",
  "50:64:2B": "Xiaomi",
  "64:09:80": "Xiaomi",
  "74:23:44": "Xiaomi",
  "78:02:F8": "Xiaomi",
  "88:C3:97": "Xiaomi",
  "AC:F7:F3": "Xiaomi",
  "D4:97:0B": "Xiaomi",
  "F8:A4:5F": "Xiaomi",

  // Huawei / Honor
  "00:1E:10": "Huawei",
  "00:25:9E": "Huawei",
  "20:F4:1B": "Huawei",
  "48:46:FB": "Huawei",
  "70:7B:E8": "Huawei",
  "80:B6:86": "Huawei",
  "88:CE:FA": "Huawei",
  "A4:99:9B": "Huawei",
  "DC:D2:FC": "Huawei",
  "F8:01:13": "Huawei",

  // Oppo / Realme / OnePlus
  "10:2A:97": "Oppo",
  "2C:59:8A": "Oppo",
  "3C:CD:57": "Realme",
  "70:8A:09": "Oppo",
  "94:D0:29": "OnePlus",
  "C4:93:D9": "Oppo",
  "E8:BB:A8": "Oppo",
  "F4:60:E2": "OnePlus",

  // Vivo / iQOO
  "20:47:DA": "Vivo",
  "30:4A:26": "Vivo",
  "70:BB:E9": "Vivo",
  "84:57:33": "Vivo",
  "A8:5B:78": "Vivo",
  "DC:37:14": "Vivo",

  // TP-Link
  "00:0A:EB": "TP-Link",
  "00:14:78": "TP-Link",
  "00:19:E0": "TP-Link",
  "00:21:27": "TP-Link",
  "00:23:CD": "TP-Link",
  "00:25:86": "TP-Link",
  "00:27:19": "TP-Link",
  "14:EB:B6": "TP-Link",
  "50:C7:BF": "TP-Link",
  "60:32:B1": "TP-Link",
  "70:4F:57": "TP-Link",
  "98:DA:C4": "TP-Link",
  "AC:84:C6": "TP-Link",
  "C0:06:C3": "TP-Link",
  "E8:48:B8": "TP-Link",

  // Tenda / Mercusys / D-Link / Netgear
  "00:B0:C2": "Tenda",
  "04:95:E6": "Tenda",
  "C8:3A:35": "Tenda",
  "E8:65:D4": "Tenda",
  "F0:82:61": "Mercusys",
  "74:05:A5": "Mercusys",
  "00:05:5D": "D-Link",
  "00:11:95": "D-Link",
  "00:18:E7": "D-Link",
  "00:09:5B": "Netgear",
  "00:14:6C": "Netgear",
  "00:18:4D": "Netgear",

  // Ubiquiti Networks
  "00:27:22": "Ubiquiti UniFi",
  "04:18:D6": "Ubiquiti UniFi",
  "24:A4:3C": "Ubiquiti UniFi",
  "68:D7:9A": "Ubiquiti UniFi",
  "78:8A:20": "Ubiquiti airMAX",
  "B4:FB:E4": "Ubiquiti UniFi",
  "D8:B3:70": "Ubiquiti UniFi",
  "E0:63:DA": "Ubiquiti airMAX",
  "F0:9F:C2": "Ubiquiti UniFi",

  // Ruijie / Reyee
  "00:1A:A9": "Ruijie Reyee",
  "14:14:4B": "Ruijie Reyee",
  "38:52:1A": "Ruijie Reyee",
  "58:69:6C": "Ruijie Reyee",
  "70:70:8B": "Ruijie Reyee",
  "E0:05:C5": "Ruijie Reyee",

  // Cambium & Mimosa
  "00:04:56": "Cambium Networks",
  "58:C1:7A": "Cambium ePMP",
  "20:B0:01": "Mimosa Networks",

  // Starlink
  "70:B3:D5": "Starlink SpaceX Router",
  "98:CD:AC": "Starlink SpaceX Router",

  // Cisco
  "00:00:0C": "Cisco Systems",
  "00:01:42": "Cisco Systems",
  "00:0C:85": "Cisco Meraki",
  "00:18:BA": "Cisco Meraki",
  "E0:55:3D": "Cisco Meraki",

  // ZTE
  "00:1E:73": "ZTE Corporation",
  "00:22:93": "ZTE Corporation",
  "74:B5:7E": "ZTE Corporation",

  // MikroTik
  "00:0C:42": "MikroTik",
  "08:55:31": "MikroTik RouterBOARD",
  "18:FD:74": "MikroTik RouterBOARD",
  "2C:C8:1B": "MikroTik RouterBOARD",
  "48:8F:5A": "MikroTik RouterBOARD",
  "64:D1:54": "MikroTik RouterBOARD",
  "74:4D:28": "MikroTik RouterBOARD",
  "B8:69:F4": "MikroTik RouterBOARD",
  "C4:AD:34": "MikroTik RouterBOARD",
  "CC:2D:E0": "MikroTik RouterBOARD",
  "D4:01:C3": "MikroTik RouterBOARD",
  "D4:CA:6D": "MikroTik RouterBOARD",
  "E4:8D:8C": "MikroTik RouterBOARD",

  // Intel, Realtek, Espressif (IoT), Google, Sony, LG
  "00:02:B3": "Intel",
  "00:03:47": "Intel",
  "00:04:23": "Intel",
  "00:07:E9": "Intel",
  "00:13:02": "Intel",
  "00:1B:21": "Intel",
  "00:05:59": "Realtek",
  "00:E0:4C": "Realtek",
  "24:0A:C4": "Espressif (ESP32 IoT)",
  "30:AE:A4": "Espressif (ESP32 IoT)",
  "84:0D:8E": "Espressif (ESP32 IoT)",
  "A4:CF:12": "Espressif (ESP32 IoT)",
  "B4:E6:2D": "Espressif (ESP32 IoT)",
  "DC:4F:22": "Espressif (ESP32 IoT)",
  "00:1A:11": "Google",
  "3C:5A:B4": "Google",
  "54:60:09": "Google Pixel",
  "94:EB:2C": "Google Home / Nest",
  "00:01:4A": "Sony",
  "00:04:1F": "Sony PlayStation / TV",
  "00:1E:75": "Sony",
  "00:05:F9": "LG Electronics (Smart TV)",
  "00:19:A1": "LG Electronics (Smart TV)",
  "00:1E:75": "LG Electronics (Smart TV)",
  "B8:27:EB": "Raspberry Pi",
  "DC:A6:32": "Raspberry Pi",
  "E4:5F:01": "Raspberry Pi",
};

/**
 * Normalizes a MAC string to standard AA:BB:CC:DD:EE:FF format
 */
export function normalizeMac(rawMac: string): string {
  if (!rawMac) return "";
  const cleaned = rawMac.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleaned.length !== 12) {
    // If it's partially formatted, try basic cleanup
    return rawMac.trim().toUpperCase().replace(/-/g, ":");
  }
  return (cleaned.match(/.{1,2}/g) || []).join(":");
}

/**
 * Checks if a MAC address is a locally administered (private/randomized) MAC.
 * In IEEE 802, if the 2nd least significant bit of the first byte is 1,
 * the MAC is locally administered (Android/iOS "Use randomized MAC" feature).
 * The second hex character will be 2, 6, A, or E (e.g. x2:xx, x6:xx, xA:xx, xE:xx).
 */
export function isLocallyAdministeredMac(mac: string): boolean {
  const norm = normalizeMac(mac);
  if (norm.length < 2) return false;
  const secondChar = norm[1]?.toUpperCase();
  return ["2", "6", "A", "E"].includes(secondChar);
}

/**
 * Resolves the device hardware vendor / manufacturer based on MAC OUI
 */
export function getMacVendor(mac: string): {
  vendor: string;
  isRandomized: boolean;
  category: "mobile" | "pc" | "ap" | "iot" | "tv" | "unknown";
} {
  const norm = normalizeMac(mac);
  if (!norm) {
    return { vendor: "Unknown Device", isRandomized: false, category: "unknown" };
  }

  const isRandomized = isLocallyAdministeredMac(norm);
  const prefix = norm.substring(0, 8); // e.g. "00:1E:E2"

  if (OUI_VENDORS[prefix]) {
    const v = OUI_VENDORS[prefix];
    let cat: "mobile" | "pc" | "ap" | "iot" | "tv" | "unknown" = "mobile";
    if (
      v.includes("TP-Link") ||
      v.includes("Tenda") ||
      v.includes("Mercusys") ||
      v.includes("MikroTik") ||
      v.includes("D-Link") ||
      v.includes("Netgear") ||
      v.includes("Ubiquiti") ||
      v.includes("Ruijie") ||
      v.includes("Cambium") ||
      v.includes("Cisco") ||
      v.includes("Starlink")
    ) {
      cat = "ap";
    } else if (v.includes("Intel") || v.includes("Realtek") || v.includes("Raspberry Pi")) {
      cat = "pc";
    } else if (v.includes("Espressif")) {
      cat = "iot";
    } else if (v.includes("TV") || v.includes("PlayStation") || v.includes("LG Electronics")) {
      cat = "tv";
    }
    return { vendor: v, isRandomized, category: cat };
  }

  if (isRandomized) {
    return {
      vendor: "Private / Randomized MAC (Android / iOS / Windows)",
      isRandomized: true,
      category: "mobile",
    };
  }

  return {
    vendor: "Generic Wi-Fi Device",
    isRandomized: false,
    category: "unknown",
  };
}

/**
 * Evaluates wireless signal strength (dBm) to percentage and rating
 */
export function getSignalQuality(signalDbm?: number | null): {
  rating: "Excellent" | "Good" | "Fair" | "Poor" | "Very Weak";
  percentage: number;
  color: string;
} {
  if (signalDbm === undefined || signalDbm === null || isNaN(signalDbm)) {
    return { rating: "Good", percentage: 70, color: "text-emerald-500" };
  }

  if (signalDbm >= -55) {
    return { rating: "Excellent", percentage: 100, color: "text-emerald-500" };
  }
  if (signalDbm >= -67) {
    return { rating: "Good", percentage: 80, color: "text-emerald-400" };
  }
  if (signalDbm >= -75) {
    return { rating: "Fair", percentage: 60, color: "text-amber-500" };
  }
  if (signalDbm >= -85) {
    return { rating: "Poor", percentage: 35, color: "text-orange-500" };
  }
  return { rating: "Very Weak", percentage: 15, color: "text-red-500" };
}

/**
 * Resolves frequency in MHz to human readable Wi-Fi band & channel
 */
export function getFrequencyChannel(freqMhz?: number | null): {
  band: "2.4 GHz" | "5 GHz" | "6 GHz" | "Unknown";
  channelText: string;
} {
  if (!freqMhz || isNaN(freqMhz)) {
    return { band: "2.4 GHz", channelText: "2.4 GHz" };
  }

  // 2.4 GHz band (2412 - 2484 MHz)
  if (freqMhz >= 2412 && freqMhz <= 2484) {
    const ch = freqMhz === 2484 ? 14 : Math.round((freqMhz - 2407) / 5);
    return { band: "2.4 GHz", channelText: `Ch ${ch} (2.4 GHz)` };
  }

  // 5 GHz band (5150 - 5895 MHz)
  if (freqMhz >= 5150 && freqMhz <= 5895) {
    const ch = Math.round((freqMhz - 5000) / 5);
    return { band: "5 GHz", channelText: `Ch ${ch} (5 GHz)` };
  }

  // 6 GHz band (Wi-Fi 6E)
  if (freqMhz >= 5925 && freqMhz <= 7125) {
    return { band: "6 GHz", channelText: `6 GHz (${freqMhz} MHz)` };
  }

  return { band: "Unknown", channelText: `${freqMhz} MHz` };
}
