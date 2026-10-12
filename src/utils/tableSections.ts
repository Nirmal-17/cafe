// Floor-plan section grouping — single source of truth for table headings.
//
// Background: the hosted feed (/cafetable/all) carries only a numeric
// table_category_id (→ Table.sectionId) with no nested section object, so the
// old `t.section?.name || 'Main'` grouping collapsed EVERY table under one
// "Main" heading. The real names live in the sections list (built from
// /tablecategory/all when reachable), so grouping must resolve through it.
//
// Result: tables group under their backend section names — "Indoor" tables
// under Indoor only, "Roof" under Roof, "Cabin" under Cabin, "Hall" under
// Hall (Test 2 / Test Hall), "Garden" under Garden, "Pool" under Pool,
// "Room" under Room (Deluxe Room 1..5), "Outdoor" under Outdoor (O1..O6).
// When the backend sends no usable name (hosted feed placeholders
// "Section {id}"), the section is inferred from the table label itself
// (IN→Indoor, R→Roof, C→Cabin, G→Garden, P→Pool, O→Outdoor, Deluxe→Room,
// Test→Hall). A legacy "Main" label is treated as Indoor. Anything still
// unresolvable defaults to Indoor (never "Main").

import type { Section, Table } from '@/services/api';

export const INDOOR_SECTION = 'Indoor';
export const OUTDOOR_SECTION = 'Outdoor';

/** Floor-plan order matching the venue: Indoor → Roof → Cabin → Hall → Garden → Pool → Room → Outdoor. */
export const SECTION_ORDER = [
  'Indoor',
  'Roof',
  'Cabin',
  'Hall',
  'Garden',
  'Pool',
  'Room',
  'Outdoor',
] as const;

/** Legacy / placeholder labels that mean "indoor floor". */
function isMainLabel(name: string): boolean {
  return name.trim().toLowerCase() === 'main';
}

/** Unnamed bucket the old code produced ("Section {id}") — not a real name. */
function isPlaceholderLabel(name: string): boolean {
  return /^section\s+\d+$/i.test(name.trim());
}

function isOutdoorDiningArea(area: unknown): boolean {
  const v = String(area ?? '').trim().toLowerCase();
  return v === 'outdoor';
}

function diningAreaSectionName(area: unknown): string | null {
  const v = String(area ?? '').trim().toLowerCase();
  switch (v) {
    case 'indoor':
    case 'tables':
      return INDOOR_SECTION;
    case 'roof':
      return 'Roof';
    case 'cabin':
      return 'Cabin';
    case 'hall':
      return 'Hall';
    case 'garden':
      return 'Garden';
    case 'pool':
      return 'Pool';
    case 'room':
      return 'Room';
    case 'outdoor':
      return OUTDOOR_SECTION;
    default:
      return null;
  }
}

/**
 * Infer the section from the table label itself (IN1 → Indoor, R1 → Roof,
 * C1 → Cabin, Test/Hall → Hall, G1 → Garden, P1 → Pool, Deluxe/Room → Room,
 * O1 → Outdoor). The hosted feed often carries no usable category names
 * (session-gated /tablecategory/all → "Section {id}" placeholders), but the
 * venue names its tables with these prefixes, so inference keeps every area
 * under its own heading instead of collapsing everything into Indoor.
 */
export function inferSectionFromTableName(tableNumber: unknown): string | null {
  const raw = String(tableNumber ?? '').trim();
  if (!raw) return null;
  const v = raw.toLowerCase();
  // Spaceless copy so "Out Door 6" / "Out-door 6" still match full words.
  const flat = v.replace(/[\s\-_]+/g, '');

  // Room first: "Deluxe Room 1..5" (also matches a bare "room 1").
  if (v.includes('deluxe') || v.includes('room')) return 'Room';
  // Hall: "Test Hall", "Test 2", or anything carrying "hall".
  if (v.includes('hall') || v.startsWith('test')) return 'Hall';
  // Full-word labels win over single-letter prefixes.
  if (flat.startsWith('indoor')) return INDOOR_SECTION;
  if (flat.startsWith('outdoor')) return OUTDOOR_SECTION;
  if (flat.startsWith('garden')) return 'Garden';
  if (flat.startsWith('cabin')) return 'Cabin';
  if (flat.startsWith('roof')) return 'Roof';
  if (flat.startsWith('pool')) return 'Pool';

  // Prefix + number: IN1..IN5, R1..R3, C1, G1..G4, P1..P2, O1..O6
  // (optional space/dash/underscore between prefix and number).
  const prefix = v.match(/^(in|o|g|r|c|p)\s*[-_]?\s*\d+/)?.[1];
  switch (prefix) {
    case 'in':
      return INDOOR_SECTION;
    case 'r':
      return 'Roof';
    case 'c':
      return 'Cabin';
    case 'g':
      return 'Garden';
    case 'p':
      return 'Pool';
    case 'o':
      return OUTDOOR_SECTION;
    default:
      return null;
  }
}

/**
 * Resolve the display section name for one table.
 * Priority: nested section object → sections list by sectionId → diningArea
 * (each area keeps its own name — Roof stays Roof, never Indoor) → table-name
 * prefix inference (IN/R/C/G/P/O/Deluxe/Test) → Indoor fallback.
 * "Main" is only a legacy default label, so a table whose own name clearly
 * says otherwise (e.g. O6 under a "Main" category) follows its name.
 */
export function resolveTableSectionName(
  table: Pick<Table, 'section' | 'sectionId' | 'diningArea'> & {
    tableNumber?: unknown;
  },
  sections?: readonly Pick<Section, 'id' | 'name'>[],
): string {
  const inferFromName = (): string | null =>
    inferSectionFromTableName((table as { tableNumber?: unknown }).tableNumber);

  /** A table whose own label clearly names another area (O6, R2, …) follows
   *  its name even when its backend category says otherwise — the venue names
   *  tables by area, so the label is the more specific signal. Custom backend
   *  names ("First Floor", …) are still respected. */
  const preferTableName = (label: string): string => {
    const isKnownArea = SECTION_ORDER.some((s) => s.toLowerCase() === label.trim().toLowerCase());
    if (!isKnownArea) return label;
    const inferred = inferFromName();
    return inferred ?? label;
  };

  const nested = table.section?.name?.trim();
  if (nested && !isPlaceholderLabel(nested)) {
    if (!isMainLabel(nested)) return preferTableName(nested);
    return inferFromName() ?? INDOOR_SECTION;
  }

  if (sections && Array.isArray(sections)) {
    const found = sections.find(
      (s) => String(s.id) === String((table as { sectionId?: unknown }).sectionId),
    );
    const label = found?.name?.trim();
    if (label && !isPlaceholderLabel(label)) {
      if (!isMainLabel(label)) return preferTableName(label);
      return inferFromName() ?? INDOOR_SECTION;
    }
  }

  // Distinct dining areas keep their own headings (no collapsing to Indoor).
  const areaName = diningAreaSectionName((table as { diningArea?: unknown }).diningArea);
  if (areaName) return areaName;

  // Backend gave no usable name — infer from the table label (IN1, R2, …).
  // Pool/outdoor dining areas without a label also land here via the P/O prefix.
  const inferred = inferSectionFromTableName(
    (table as { tableNumber?: unknown }).tableNumber,
  );
  if (inferred) return inferred;

  // A bare outdoor/pool flag with an unparseable name still groups outdoors.
  if (isOutdoorDiningArea((table as { diningArea?: unknown }).diningArea)) {
    return OUTDOOR_SECTION;
  }
  return INDOOR_SECTION;
}

/** Sort order: Indoor → Roof → Cabin → Hall → Garden → Pool → Room → Outdoor, then alphabetical. */
function sectionRank(name: string): number {
  const idx = SECTION_ORDER.findIndex((s) => s.toLowerCase() === name.trim().toLowerCase());
  return idx === -1 ? SECTION_ORDER.length : idx;
}

/** Group (already filtered/sorted) tables by resolved section name. */
export function groupTablesBySection<
  T extends Pick<Table, 'section' | 'sectionId' | 'diningArea'> & {
    tableNumber?: unknown;
  },
>(
  tables: readonly T[],
  sections?: readonly Pick<Section, 'id' | 'name'>[],
): [string, T[]][] {
  const map = new Map<string, T[]>();
  tables.forEach((t) => {
    const key = resolveTableSectionName(t, sections);
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  });
  return [...map.entries()].sort(([a], [b]) => {
    const rank = sectionRank(a) - sectionRank(b);
    if (rank !== 0) return rank;
    return a.localeCompare(b);
  });
}
