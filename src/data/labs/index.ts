import type { CategoryId, Lab } from '../types';
import { classicLabs } from './classic';
import { unionLabs } from './union';
import { blindLabs } from './blind';
import { advancedLabs } from './advanced';
import { bypassLabs } from './bypass';
import { realWorldLabs } from './realworld';

export const LABS: Lab[] = [
  ...classicLabs,
  ...unionLabs,
  ...blindLabs,
  ...advancedLabs,
  ...bypassLabs,
  ...realWorldLabs,
];

export const labById = new Map(LABS.map((lab) => [lab.id, lab]));

export function labsInCategory(category: CategoryId): Lab[] {
  return LABS.filter((lab) => lab.category === category);
}

export function labIndex(id: string): number {
  return LABS.findIndex((lab) => lab.id === id);
}

export function neighbours(id: string): { prev: Lab | null; next: Lab | null } {
  const i = labIndex(id);
  return {
    prev: i > 0 ? LABS[i - 1] : null,
    next: i >= 0 && i < LABS.length - 1 ? LABS[i + 1] : null,
  };
}

export function labNumber(id: string): string {
  const i = labIndex(id);
  return i < 0 ? '--' : String(i + 1).padStart(2, '0');
}
