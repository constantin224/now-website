export type Release = {
  title: string; type: "album" | "single" | "ep"; year: number;
  cover: string; label: string;
  links: { spotify?: string; apple?: string; youtube?: string; shop?: string };
  spotifyEmbedId?: string;
};
export const releases: Release[] = [{
  title: "Out", type: "album", year: 2024, cover: "/album-cover-out.jpg", label: "Tonherd Music",
  links: {
    spotify: "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
    apple: "https://music.apple.com/at/artist/now/1603132645",
    youtube: "https://www.youtube.com/@now.",
    shop: "https://shop.tonherd.at/products/debutalbum-out-now-digitaler-download",
  },
  spotifyEmbedId: "46Z2az8XmrXnhr0ej2sr3Q",
}];
export type Video = { title: string; youtubeId: string; year: number };
export const videos: Video[] = [
  // Offizielle Musikvideos (neueste zuerst)
  { title: "Checkmate Time (Official Video)", youtubeId: "7E1SID_LGYw", year: 2026 },
  { title: "The Ocean (Official Video)", youtubeId: "jhGfuhR45OM", year: 2024 },
  { title: "Out (Official Video)", youtubeId: "xJEh1AqFWyo", year: 2024 },
  { title: "Someone Else's Life (Official Video)", youtubeId: "a5aE8XcG6V8", year: 2023 },
  { title: "Let Go (Official Video)", youtubeId: "MqL4av6HFw4", year: 2023 },
  { title: "Stay (Official Video)", youtubeId: "a3VTGfWB1wc", year: 2022 },
  { title: "Walls (Official Video)", youtubeId: "V0d3Uhnov-0", year: 2022 },
  { title: "Basic (Official Video)", youtubeId: "k2xfz_iJBGk", year: 2022 },
  { title: "Wastin' Days (Official Video)", youtubeId: "ioyxUVjFIhg", year: 2022 },
];
