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
  { title: "The Ocean", youtubeId: "PLACEHOLDER_1", year: 2024 },
  { title: "Out", youtubeId: "PLACEHOLDER_2", year: 2024 },
  { title: "When The Lights Are Out (Unplugged)", youtubeId: "PLACEHOLDER_3", year: 2024 },
];
