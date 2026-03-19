// Deezer Artist ID für Now.
const ARTIST_ID = 156250942;

export type LatestRelease = {
  title: string;
  type: string;
  releaseDate: string;
  cover: string;
  links: {
    deezer: string;
    spotify: string;
    apple: string;
  };
};

export type DeezerRelease = {
  id: number;
  title: string;
  type: string;
  releaseDate: string;
  cover: string;
  coverSmall: string;
  link: string;
};

// Alle Releases des Artists holen, nach Datum sortiert (neueste zuerst)
export async function getAllReleases(): Promise<DeezerRelease[]> {
  try {
    const res = await fetch(
      `https://api.deezer.com/artist/${ARTIST_ID}/albums?limit=50`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return [];

    const data = await res.json();
    const albums = data.data as Array<{
      id: number;
      title: string;
      record_type: string;
      release_date: string;
      cover_medium: string;
      cover_big: string;
      link: string;
    }>;

    if (!albums || albums.length === 0) return [];

    return albums
      .sort(
        (a, b) =>
          new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
      )
      .map((a) => ({
        id: a.id,
        title: a.title,
        type: a.record_type,
        releaseDate: a.release_date,
        cover: a.cover_big || a.cover_medium,
        coverSmall: a.cover_medium,
        link: a.link,
      }));
  } catch {
    return [];
  }
}

export async function getLatestRelease(): Promise<LatestRelease | null> {
  try {
    // Alle Alben/Singles des Artists holen, sortiert nach Release-Datum
    const res = await fetch(
      `https://api.deezer.com/artist/${ARTIST_ID}/albums?limit=50`,
      { next: { revalidate: 3600 } } // Stündlich Cache, wird via Cron täglich revalidiert
    );
    if (!res.ok) return null;

    const data = await res.json();
    const albums = data.data as Array<{
      id: number;
      title: string;
      record_type: string;
      release_date: string;
      cover_medium: string;
      cover_big: string;
      link: string;
    }>;

    if (!albums || albums.length === 0) return null;

    // Nach Datum sortieren, neuestes zuerst
    albums.sort(
      (a, b) =>
        new Date(b.release_date).getTime() - new Date(a.release_date).getTime()
    );

    const latest = albums[0];

    return {
      title: latest.title,
      type: latest.record_type, // "single", "album", "ep"
      releaseDate: latest.release_date,
      cover: latest.cover_big || latest.cover_medium,
      links: {
        deezer: latest.link,
        // Spotify und Apple Music — Artist-Seite als Fallback
        spotify:
          "https://open.spotify.com/intl-de/artist/46Z2az8XmrXnhr0ej2sr3Q",
        apple: "https://music.apple.com/at/artist/now/1603132645",
      },
    };
  } catch {
    return null;
  }
}
