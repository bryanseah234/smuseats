export type FloorplanRoom = {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  layout: {
    width: number;
    height: number;
    spawn: [number, number];
  };
};

const pdfModules = import.meta.glob('/{Admin,LKCSB,SCIS1,SOA,SOE_SCIS2,SOSS_CIS,YPHSL}/*.pdf', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\.pdf$/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

const toTitleCase = (value: string) =>
  value
    .replace(/\.pdf$/i, '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((token) => token[0].toUpperCase() + token.slice(1))
    .join(' ');

export const pdfRooms: FloorplanRoom[] = Object.entries(pdfModules)
  .map(([assetPath, assetUrl]) => {
    const [, building, rawFileName] = assetPath.match(/^\/([^/]+)\/(.+)$/) ?? [];

    if (!building || !rawFileName) {
      return null;
    }

    const baseName = rawFileName.replace(/\.pdf$/i, '');

    return {
      id: slugify(`${building}-${baseName}`),
      name: toTitleCase(baseName),
      description: `${building} floorplan`,
      imageUrl: assetUrl,
      layout: {
        width: 1000,
        height: 700,
        spawn: [50, 50],
      },
    };
  })
  .filter((entry): entry is FloorplanRoom => entry !== null)
  .sort((a, b) => a.name.localeCompare(b.name));
