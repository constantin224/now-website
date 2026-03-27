// Manuelle Streaming-Links pro Release (Deezer-Album-ID als Key)
// Für Releases ohne Eintrag wird der Suchlink als Fallback verwendet
export type ReleaseLinks = {
  spotify?: string;
  apple?: string;
  youtube?: string;
};

export const releaseLinks: Record<number, ReleaseLinks> = {
  // Out (Album)
  640877461: {
    spotify: "https://open.spotify.com/album/5dWKNVY6Yu00ZrTKgIHGbH",
    apple: "https://music.apple.com/at/album/out/1767539387",
  },
  // Checkmate Time (Single)
  926540531: {
    spotify: "https://open.spotify.com/album/1SNY96CS7hI8iA8rRKQ5Ld",
    apple: "https://music.apple.com/at/album/checkmate-time-single/1879867244",
  },
  // The Ocean Acoustic (Single)
  910375581: {
    spotify: "https://open.spotify.com/album/4sxsVXgGhzatAMU3mA6fM1",
    apple: "https://music.apple.com/at/album/the-ocean-acoustic-single/1874075036",
  },
  // Who I Am (Single, neuere Version)
  844084352: {
    spotify: "https://open.spotify.com/album/2ZDe5JpTv6sik6WWTYhaKv",
    apple: "https://music.apple.com/at/album/who-i-am-single/1848436662",
  },
  // Who I Am (Single, ältere Version)
  830046731: {
    spotify: "https://open.spotify.com/album/2xt0BybMmQPX1JHlonKOiE",
    apple: "https://music.apple.com/at/album/who-i-am-single/1843132846",
  },
};
