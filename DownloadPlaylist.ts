import { join } from 'node:path';
import { mkdir } from "node:fs/promises";
import { startDownloader, getDownloadURL } from './helper';

const playlistUrl = await getDownloadURL("64be64070e086a0009d7b028"); // Example for Freitag Nacht News
const outputPrefix = `FNN_`; // Example for Freitag Nacht News

const interval = 5; // seconds
const Directory = join("./", "m3u8");
await mkdir(Directory, { recursive: true });
startDownloader(playlistUrl, join(Directory, outputPrefix), interval);
