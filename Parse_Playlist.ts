import { ProcessPlaylist, getFiles } from "./helper.ts";
import { unlinkSync } from 'node:fs';

let ShowName = "FreitagNachtNews";
let Files = await getFiles("./m3u8", "FNN", "m3u8");
if (Files) {
  for (let file of Files) {
    await ProcessPlaylist(await Bun.file(file).text(), ShowName);
    await unlinkSync(file);
  }
}