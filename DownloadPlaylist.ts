import axios from 'axios';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { unlinkSync } from 'node:fs';

let lastPart: string | null = null;
let customIndex = 0;
let lastFileName = '';

interface Playlist {
  segments: string[];
}

interface MediaSegment {
  url: string;
  index?: string;
  key?: any;
}

/**
 * Decrypts an encrypted file and writes the decrypted content to a new file.
 * @param filePath - Path to the encrypted file.
 * @param outputPath - Path to write the decrypted file.
 * @param key - Decryption key.
 * @param iv - Initialization vector.
 */
async function decryptFileToFile(filePath: string, outputPath: string, key: Buffer, iv: Buffer): Promise<void> {
  try {
    const encryptedData = await fs.promises.readFile(filePath);

    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);

    await fs.promises.writeFile(outputPath, decryptedData);
    console.log('Decrypted data written to:', outputPath);
  } catch (error) {
    console.error('Error decrypting and writing file:', error);
    throw error;
  }
}


/**
 * Converts a buffer to a hexadecimal string.
 * @param buffer - The buffer to convert.
 * @returns The hexadecimal string representation of the buffer.
 */
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
}


/**
 * Parses an M3U8 playlist string and extracts media segments and keys.
 * @param playlist - The M3U8 playlist string.
 * @returns An object containing the segments and keys.
 */
function parseM3U8(playlist: string): { segments: MediaSegment[]; keys: any[] } {
  const segments: MediaSegment[] = [];
  const keys: any[] = [];
  const lines = playlist.split(/\r?\n/);

  for (const line of lines) {
    if (line.startsWith("#EXT-X-KEY")) {
      const parts = line.split(",");
      const key: any = {
        name: "",
        uri: "",
        iv: "",
        ivasDec: "",
      };

      for (const part of parts) {
        const [keyName, value] = part.split("=");
        switch (keyName.trim()) {
          case "URI":
            key.uri = value.trim().slice(1, -1); // Remove quotes
            const uriParts = key.uri.split("/");
            key.name = uriParts[5].slice(25);
            break;
          case "IV":
            key.iv = value.trim().slice(2); // Remove 0x prefix
            key.ivasDec = parseInt(value.trim().slice(2), 16);
            break;
        }
      }

      keys.push(key);
    } else if (line.startsWith("#EXTINF:")) {
      const url = lines[lines.indexOf(line) + 1].trim();
      const segment: MediaSegment = {
        url,
        index: url.split("-").pop()?.replace(".ts", "") || "",
        key: keys[keys.length - 1],
      };

      if (keys.length > 0) {
        segment.key = keys[keys.length - 1]; // Use the latest key
      }

      segments.push(segment);
    }
    else if (line === "#EXT-X-DISCONTINUITY") {
      console.log("Discontinuity encountered, breaking the loop.");
      break;
    }
  }

  return { segments, keys };
}


/**
 * Downloads and decrypts a playlist.
 * @param playlistUrl - The URL of the playlist.
 * @param outputFile - The output file path.
 */
const downloadPlaylist = async (playlistUrl: string, outputFile: string) => {
  try {
    const response = await axios.get<string>(playlistUrl);
    const playlistContent = response.data;
    const m3u8 = parseM3U8(playlistContent);
    if (m3u8.segments.length === 0) {
      console.log("No parseable content in playlist");
      process.exit(1);
    }

      fs.writeFileSync(outputFile, playlistContent);
    }

    console.log('Playlist downloaded and saved:', outputFile);
  } catch (error) {
    console.error('Error downloading playlist:', error);
  }
};

/**
 * Starts the downloader with a specified interval.
 * @param playlistUrl - The URL of the playlist.
 * @param outputPrefix - The output Prefix of the file.
 * @param interval - The interval in seconds.
 */
const startDownloader = (playlistUrl: string, outputPrefix: string, interval: number) => {
  downloadPlaylist(playlistUrl, `${outputPrefix}${getUnixTimestamp()}.m3u8`);
  setInterval(() => {
    downloadPlaylist(playlistUrl, `${outputPrefix}${getUnixTimestamp()}.m3u8`);
  }, interval * 1000);
};

/**
 * Gets the current Unix timestamp in seconds.
 * @returns The current Unix timestamp.
 */
function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}



// Example usage
const playlistUrl = 'https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/v2/stitch/hls/channel/65a67c494a10d800085cab06/3321280/playlist.m3u8?terminate=false&sid=1029bb2c-56f2-11ef-843f-be5cd951c95a&deviceDNT=0&deviceLat=53.66999816894531&deviceLon=10.239999771118164&deviceModel=web&deviceVersion=128.0.0&includeExtendedEvents=true&appName=web&DRMCapabilities=widevine&deviceId=7ce10306-fe24-4a6e-9711-af70289fa6ae&appVersion=9.3.0-69146e96681a70e0e5f4f40942d0abc67f04864a&deviceType=web&deviceMake=firefox&jwt=eyJhbGciOiJIUzI1NiIsImtpZCI6ImVjMmQ3MDIwLTRiMzAtNGEzNS1hOTFlLTI4ZGQ1YWM4ZmZkNyIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uSUQiOiIxMDI5YmIyYy01NmYyLTExZWYtODQzZi1iZTVjZDk1MWM5NWEiLCJjbGllbnRJUCI6IjMxLjE3LjIxLjE1MSIsImNpdHkiOiJBaHJlbnNidXJnIiwicG9zdGFsQ29kZSI6IjIyOTI2IiwiY291bnRyeSI6IkRFIiwiZG1hIjoyNzYwMDEsImFjdGl2ZVJlZ2lvbiI6IkRFIiwiZGV2aWNlTGF0Ijo1My42Njk5OTgxNjg5NDUzMSwiZGV2aWNlTG9uIjoxMC4yMzk5OTk3NzExMTgxNjQsInByZWZlcnJlZExhbmd1YWdlIjoiZGUiLCJkZXZpY2VUeXBlIjoid2ViIiwiZGV2aWNlVmVyc2lvbiI6IjEyOC4wLjAiLCJkZXZpY2VNYWtlIjoiZmlyZWZveCIsImRldmljZU1vZGVsIjoid2ViIiwiYXBwTmFtZSI6IndlYiIsImFwcFZlcnNpb24iOiI5LjMuMC02OTE0NmU5NjY4MWE3MGUwZTVmNGY0MDk0MmQwYWJjNjdmMDQ4NjRhIiwiY2xpZW50SUQiOiI3Y2UxMDMwNi1mZTI0LTRhNmUtOTcxMS1hZjcwMjg5ZmE2YWUiLCJjbUF1ZGllbmNlSUQiOiIiLCJpc0NsaWVudEROVCI6ZmFsc2UsInVzZXJJRCI6IiIsImxvZ0xldmVsIjoiREVGQVVMVCIsInRpbWVab25lIjoiRXVyb3BlL0JlcmxpbiIsInNlcnZlclNpZGVBZHMiOmZhbHNlLCJlMmVCZWFjb25zIjpmYWxzZSwiZmVhdHVyZXMiOnsibXVsdGlQb2RBZHMiOnsiZW5hYmxlZCI6dHJ1ZX19LCJmbXNQYXJhbXMiOnsiZndWY0lEMiI6IjdjZTEwMzA2LWZlMjQtNGE2ZS05NzExLWFmNzAyODlmYTZhZSIsImZ3VmNJRDJDb3BwYSI6IjdjZTEwMzA2LWZlMjQtNGE2ZS05NzExLWFmNzAyODlmYTZhZSIsImN1c3RvbVBhcmFtcyI6eyJmbXNfbGl2ZXJhbXBfaWRsIjoiIiwiZm1zX2VtYWlsaGFzaCI6IiIsImZtc19zdWJzY3JpYmVyaWQiOiIiLCJmbXNfaWZhIjoiIiwiZm1zX2lkZnYiOiIiLCJmbXNfdXNlcmlkIjoiN2NlMTAzMDYtZmUyNC00YTZlLTk3MTEtYWY3MDI4OWZhNmFlIiwiZm1zX3ZjaWQydHlwZSI6InVzZXJpZCIsImZtc19yYW1wX2lkIjoiIiwiZm1zX2hoX3JhbXBfaWQiOiIiLCJmbXNfYmlkaWR0eXBlIjoiIiwiX2Z3XzNQX1VJRCI6IiIsImZtc19ydWxlaWQiOiIxMDAwMCwxMDAwOSwxMDAwMyJ9fSwiZHJtIjp7Im5hbWUiOiJ3aWRldmluZSIsImxldmVsIjoiTDMifSwiaXNzIjoiYm9vdC5wbHV0by50diIsInN1YiI6InByaTp2MTpwbHV0bzpkZXZpY2VzOkRFOk4yTmxNVEF6TURZdFptVXlOQzAwWVRabExUazNNVEV0WVdZM01ESTRPV1poTm1GbCIsImF1ZCI6IioucGx1dG8udHYiLCJleHAiOjE3MjMzNjQ3MTIsImlhdCI6MTcyMzI3ODMxMiwianRpIjoiNWM1YWM2ZGEtNTYzMC00MjMzLTg5NTQtZDFiYTA1YTdiNzE5In0.OMzcnZHZPrnxd1FKuDPkGlJgz7d1S51V5qEEuYQukV8&gdpr=1&gdprConsent=CQDIa3AQDIa3AAcABBENBAFgAAAAAAAAACiQAAAAAAGhQCAACoATgBUAD0AIoAUgAvABzAEqAOAAhABHYCvAK-Ae0BLQCpYHUgdUEAOQAMAA0ACEAFwAYABbADkAOgAjABOACiAFqAMIAxQBlAGwAOUAgACCAEYAI8AUgAuQBxAGNANAAlkBe4DFAGNgMgAcwA6EB5gSACAEQeANAAVACcAKgAegBFACcAFIAOYA4ICvAK-Ae0A_gCWoHUgdUOAQwAMAA0ACAAGAAWgA6ACMAFEALQAXgAwgBlADYAG4AOUAgACCAEYAJUAXIA1QBxAFNAMaAaABawC3gF7gMUAY2AyABzADoQHmAPZHQAQAiEQA4AKgBwQFeAV8A9oB_AEtQOpA6ogAOADCAGwASoAuQBqgDiAKaAY0BawC3gF7gMUAZAA5glASAAWABwAHgARAAmABcADFAIYAiQBHACjAMUAdQBF4CRAF5gMkAZYBAEkACAAuApMoAgAAaABAADAALQAdABGACiAFsALwAYQAygBsgDeAOUAgACCAEZAJUAlgBxAEIAJaAU0AwIBjQDMgGgARqAvcBf4DFAHMAOhgdSB1QDzCoAiAE4AVABFADmAOCArwCvgJaAWsAyApABACIAAA.YAAAAAAAAAAA&gpp=DBABMA~CQDIscAQDIscAAcABBDEBAFgAAAAAAAAACiQAAAAAAAA.YAAAAAAAAAAA&gpp_sid=2&CMCD=mtp%3D86900%2Cot%3Dm%2Csf%3Dh%2Csid%3D%22152eed5a-87e4-4800-970a-32cf2bfbc7b3%22';
const outputPrefix = `DJ_`;
const interval = 5; // seconds
startDownloader(playlistUrl, outputPrefix, interval);
