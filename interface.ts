export interface Playlist {
  segments: string[];
}

export interface MediaSegment {
  url: string;
  index?: string;
  key?: any;
}

export interface M3UPlaylist {
  media: Media[];
  streams: Stream[];
}

export interface Media {
  type: string;
  groupId: string;
  name: string;
  default: boolean;
  forced: boolean;
  uri: string;
  language: string;
}

export interface Stream {
  programId: number;
  bandwidth: number;
  subtitles: string;
  uri: string; // Derived from the line after the stream definition
}