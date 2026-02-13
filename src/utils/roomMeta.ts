export interface RoomMeta {
  building: string;
  buildingLabel: string;
  buildingColor: string;
  buildingIcon: string;
  floor: string;
  type: 'Seminar Room' | 'Auditorium' | 'Hall';
  displayName: string;
  seatCount: number;
}

interface BuildingConfig {
  label: string;
  color: string;
  icon: string;
}

export const BUILDING_CONFIG: Record<string, BuildingConfig> = {
  Admin: { label: 'Admin', color: '#ef4444', icon: '🏛️' },
  LKCSB: { label: 'LKCSB', color: '#3b82f6', icon: '💼' },
  SCIS1: { label: 'SCIS1', color: '#8b5cf6', icon: '💻' },
  SOA: { label: 'SOA', color: '#f59e0b', icon: '📊' },
  SOE_SCIS2: { label: 'SOE/SCIS2', color: '#10b981', icon: '⚙️' },
  SOSS_CIS: { label: 'SOSS/CIS', color: '#ec4899', icon: '🌏' },
  YPHSL: { label: 'YPHSL', color: '#06b6d4', icon: '⚖️' },
};

export const BUILDING_ORDER = ['Admin', 'LKCSB', 'SCIS1', 'SOA', 'SOE_SCIS2', 'SOSS_CIS', 'YPHSL'];

export function extractMeta(image: string, seatCount: number): RoomMeta {
  const file = image.replace(/^\/maps(?:-masked)?\//, '').replace(/\.png$/i, '');

  // Type
  let type: RoomMeta['type'] = 'Seminar Room';
  if (/auditorium/i.test(file)) type = 'Auditorium';
  else if (/hall/i.test(file)) type = 'Hall';

  // Building — first space-delimited token in filename
  const building = file.split(' ')[0];

  // Floor — from the "X-Y" or "BX-Y" pattern at end of filename
  const floorMatch = file.match(/(B?\d+)-\d+$/i);
  const floor = floorMatch ? floorMatch[1].toUpperCase() : '–';

  const config = BUILDING_CONFIG[building] ?? { label: building, color: '#6b7280', icon: '🏢' };

  // Replace folder-style underscores with slashes for display (e.g. SOE_SCIS2 → SOE/SCIS2)
  const displayName = config.label !== building ? file.replace(building, config.label) : file;

  return {
    building,
    buildingLabel: config.label,
    buildingColor: config.color,
    buildingIcon: config.icon,
    floor,
    type,
    displayName,
    seatCount,
  };
}

/** Sort floor strings: B2 → B1 → 1 → 2 → 3 → … → – */
export function sortFloors(floors: string[]): string[] {
  return [...floors].sort((a, b) => {
    if (a === '–') return 1;
    if (b === '–') return -1;
    const aBase = a.startsWith('B');
    const bBase = b.startsWith('B');
    const aNum = parseInt(aBase ? a.slice(1) : a, 10);
    const bNum = parseInt(bBase ? b.slice(1) : b, 10);
    if (aBase && bBase) return bNum - aNum;
    if (aBase) return -1;
    if (bBase) return 1;
    return aNum - bNum;
  });
}
