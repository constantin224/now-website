import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://now-music.at";
  return [
    { url: baseUrl, lastModified: new Date(), priority: 1 },
    { url: `${baseUrl}/about`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/music`, lastModified: new Date(), priority: 0.8 },
    { url: `${baseUrl}/shows`, lastModified: new Date(), priority: 0.7 },
    { url: `${baseUrl}/press`, lastModified: new Date(), priority: 0.6 },
  ];
}
