import axios from "axios";
import { randomUUID } from "node:crypto";
import { readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import * as crypto from "crypto";
import * as fs from "fs";
import type { M3UPlaylist, Stream, MediaSegment } from "./interface";
let refreshTime: Date;
let playlistUrl: string;


export async function getDownloadURL(id: string): Promise<string> {
  console.log("Getting download URL");
  console.log("ID:", id);
  const { url, session, sticherURL } = await getMasterPlaylist(id);
  const MasterManifest = await axios.get(url);
  const highestBandwidthStream = getHighestBandwidthStream(parseMaster(MasterManifest.data).streams);
  return `${sticherURL}/v2/stitch/hls/channel/${id}/${highestBandwidthStream?.uri}&jwt=${session}`;
}

async function getMasterPlaylist(id: string) {
  const uuid = randomUUID();
  const response = await axios.get(
    `https://boot.pluto.tv/v4/start?appName=web&appVersion=9.3.0-69146e96681a70e0e5f4f40942d0abc67f04864a&deviceVersion=129.0.0&deviceModel=web&deviceMake=firefox&deviceType=web&clientID=${uuid}&clientModelNumber=1.0.0`
  );
  refreshTime = new Date();
  refreshTime.setSeconds(refreshTime.getSeconds() + response.data.refreshInSec - 1);
  return {
    url: `${response.data.servers.stitcher}/v2/stitch/hls/channel/${id}/master.m3u8?${response.data.stitcherParams}&jwt=${response.data.sessionToken}`,
    session: response.data.sessionToken,
    sticherURL: response.data.servers.stitcher,
  };
}

/**
 * Converts a buffer to a hexadecimal string.
 * @param buffer - The buffer to convert.
 * @returns The hexadecimal string representation of the buffer.
 */
function buf2hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}

function getURLBaseDir(url: string): string {
  const parts = url.split(/720p(?:DRM)?\//);
  if (!parts[1]) return '';
  const segments = parts[1].split("/");
  segments.pop();
  return segments.join("/");
}

export async function ProcessPlaylist(playlist: string, ShowName: string) {
  for (let segment of parsePlaylist(playlist).segments) {
    const Directory = join(
      "./",
      ShowName,
      segment.key.name,
      getURLBaseDir(segment.url)
    );
    await mkdir(Directory, { recursive: true });
    const urlParts = segment.url.split("/");
    const lastPathSegment = urlParts[urlParts.length - 1];
    let VCSegment = await axios.get(segment.url, {
      responseType: "arraybuffer",
    });
    const keyResponse = await axios.get<ArrayBuffer>(segment.key.uri, {
      responseType: "arraybuffer",
    });
    const key = Buffer.from(buf2hex(keyResponse.data), "hex");
    const iv = Buffer.from(segment.key.iv, "hex");
    if (await Bun.file(join(Directory, lastPathSegment)).exists()) {
      console.log("File already exists, skipping");
      continue;
    }
    await decryptFileToFile(
      VCSegment.data,
      join(Directory, lastPathSegment),
      key,
      iv
    );
  }
}

/**
 * Decrypts an encrypted file and writes the decrypted content to a new file.
 * @param filePath - Path to the encrypted file.
 * @param outputPath - Path to write the decrypted file.
 * @param key - Decryption key.
 * @param iv - Initialization vector.
 */
async function decryptFileToFile(file: ArrayBuffer, outputPath: string, key: Buffer, iv: Buffer): Promise<void> {
  try {
    const encryptedData = Buffer.from(file);
    const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
    const decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
    await fs.promises.writeFile(outputPath, decryptedData);
    console.log("Decrypted data written to:", outputPath);
  } catch (error) {
    console.error("Error decrypting and writing file:", error);
    throw error;
  }
}

function getHighestBandwidthStream(streams: Stream[]): Stream | undefined {
  const maxBandwidth = Math.max(...streams.map((stream) => stream.bandwidth));
  return streams.filter((stream) => stream.bandwidth == maxBandwidth)[0];
}

function parseMaster(m3uContent: string): M3UPlaylist {
  const lines = m3uContent.split("\n");
  const playlist: M3UPlaylist = { media: [], streams: [] };

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith("#EXTM3U")) {
      continue;
    } else if (trimmedLine.startsWith("#EXT-X-MEDIA")) {
      const media = parseAttributes(trimmedLine);
      playlist.media.push(media);
    } else if (trimmedLine.startsWith("#EXT-X-STREAM-INF")) {
      const stream = parseAttributes(trimmedLine);
      stream.uri = lines[lines.indexOf(line) + 1].trim();
      playlist.streams.push(stream);
    }
  }

  return playlist;
}

function parseAttributes(line: string): any {
  const parts = line.split(",");
  const attributes: any = {};
  for (const part of parts) {
    const [key, value] = part.split("=");
    attributes[key.trim().toLowerCase()] = value.trim().replace(/"/g, "");
  }
  return attributes;
}

function removeAfterLastSlash(str: string): string {
  const lastSlashIndex = str.lastIndexOf("/");
  return lastSlashIndex !== -1 ? str.substring(0, lastSlashIndex) : str;
}

/**
 * @param {string | Buffer | URL} directoryPath
 * @returns {Promise<string[]>} - Array of long file paths
 */
export async function getFiles(directoryPath: string, NamePrefix: string = "", fileExt: string = ""): Promise<string[]> {
  try {
    const fileNames = await readdir(directoryPath);
    const filePaths = fileNames.map((fn) => join(directoryPath, fn));

    return filePaths
      .filter((fp) => (!NamePrefix || fp.includes(NamePrefix)) && (!fileExt || fp.endsWith(fileExt)))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.error(err);
    return [];
  }
}

/**
 * Downloads and decrypts a playlist.
 * @param channelID - The channel ID.
 * @param playlistUrl - The URL of the playlist.
 * @param outputFile - The output file path.
 */
async function downloadPlaylist(channelID: string, outputFile: string): Promise<void> {
  if(refreshTime < new Date() || !playlistUrl) {
    console.log("Refreshing session token or no playlist URL");
    playlistUrl = await getDownloadURL(channelID);
  }
  try {
    const response = await axios.get<string>(playlistUrl);
    const playlistContent = response.data;
    const m3u8 = parsePlaylist(playlistContent);

    if (m3u8.segments.length === 0) {
      console.log("No parseable content in playlist");
      process.exit(1);
    }

    await fs.promises.writeFile(outputFile, playlistContent);
    console.log('Playlist downloaded and saved:', outputFile);
  } catch (error) {
    console.error('Error downloading playlist:', error);
  }
};

/**
 * Starts the downloader with a specified interval.
 * @param channelID - The channel ID.
 * @param outputPrefix - The output Prefix of the file.
 * @param interval - The interval in seconds.
 */
export async function startDownloader(channelID: string, outputPrefix: string, interval: number) {
  downloadPlaylist(channelID, `${outputPrefix}${getUnixTimestamp()}.m3u8`);
  setInterval(() => {
    downloadPlaylist(channelID, `${outputPrefix}${getUnixTimestamp()}.m3u8`);
  }, interval * 1000);
};


/**
 * Parses an M3U8 playlist string and extracts media segments and keys.
 * @param playlist - The M3U8 playlist string.
 * @returns An object containing the segments and keys.
 */
function parsePlaylist(playlist: string): { segments: MediaSegment[]; keys: any[] } {
  const segments: MediaSegment[] = [];
  const keys: any[] = [];
  const lines = playlist.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (line.startsWith("#EXT-X-KEY")) {
      const key = parseKey(line);
      if (!key.uri.includes("099_Pluto_TV_OandO") && !key.uri.includes("829_Pluto_TV_OandO")) {
        keys.push(key);
      }
    } else if (line.startsWith("#EXTINF:")) {
      const url = lines[index + 1].trim();
      if (!url.includes("099_Pluto_TV_OandO") && !url.includes("829_Pluto_TV_OandO")) {
        const segment: MediaSegment = {
          url,
          index: url.split("-").pop()?.replace(".ts", "") || "",
          key: keys[keys.length - 1],
        };
        segments.push(segment);
      }
    }
  }
  return { segments, keys };
}

function parseKey(line: string): any {
  const parts = line.split(",");
  const key: any = { name: "", uri: "", iv: "", ivasDec: "" };

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

  return key;
}

/**
 * Gets the current Unix timestamp in seconds.
 * @returns The current Unix timestamp.
 */
function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}
