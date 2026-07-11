// Manuelle Streaming-Links pro Release (Deezer-Album-ID als Key)
// Für Releases ohne Eintrag wird der Suchlink als Fallback verwendet
export type ReleaseLinks = {
  spotify?: string;
  apple?: string;
  youtube?: string;
};

export const releaseLinks: Record<number, ReleaseLinks> = {
  // Boomerang (Single) — Track-Links: Spotify-App spielt Track-Deep-Links direkt ab
  988921101: {
    spotify: "https://open.spotify.com/track/4lnta7X93z9vGCLlqa8XCH",
    apple: "https://music.apple.com/at/album/boomerang/6771997654?i=6771997656",
  },
  // Checkmate Time (Live & Unplugged) (Single)
  980802741: {
    spotify: "https://open.spotify.com/track/2rZDU9Tsfq3oZY0HgIAAaL",
    apple:
      "https://music.apple.com/at/album/checkmate-time-live-unplugged-live/6768492164?i=6768492165",
  },
  // Out (Album)
  640877461: {
    spotify: "https://open.spotify.com/album/5dWKNVY6Yu00ZrTKgIHGbH",
    apple: "https://music.apple.com/at/album/out/1767539387",
  },
  // Checkmate Time (Single)
  926540531: {
    spotify: "https://open.spotify.com/track/1B5OhtKSPb2jbsA7ifBDo2",
    apple:
      "https://music.apple.com/at/album/checkmate-time-single/1879867244?i=1879867250",
  },
  // The Ocean Acoustic (Single)
  910375581: {
    spotify: "https://open.spotify.com/track/43GgopTe524kJqmbEtAn2F",
    apple:
      "https://music.apple.com/at/album/the-ocean-acoustic-single/1874075036?i=1874075050",
  },
  // Who I Am (Single, neuere Version)
  844084352: {
    spotify: "https://open.spotify.com/track/3Y713zJCbmfrxa53vjtChW",
    apple:
      "https://music.apple.com/at/album/who-i-am-single/1848436662?i=1848436770",
  },
  // Who I Am (Single, ältere Version)
  830046731: {
    spotify: "https://open.spotify.com/track/4xk8vEDQSi1i6p4Sdr5TLf",
    apple:
      "https://music.apple.com/at/album/who-i-am-single/1843132846?i=1843132853",
  },
};
