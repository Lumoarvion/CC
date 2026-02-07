import { isPlainObject } from './objectUtils.js';
import { INTEREST_KEYWORDS } from '../config/interestKeywords.js';

function ensureUniqueStrings(items = [], fallbackLabel = 'interest:general') {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  if (result.length === 0 && fallbackLabel) {
    result.push(fallbackLabel);
  }
  return result;
}

function deriveContentInterests(text) {
  if (typeof text !== 'string') return [];
  const normalized = text.toLowerCase();
  if (!normalized.trim()) return [];

  const matches = [];
  for (const entry of INTEREST_KEYWORDS) {
    const { tag, keywords } = entry || {};
    if (typeof tag !== 'string' || !Array.isArray(keywords)) continue;
    for (const keyword of keywords) {
      if (typeof keyword !== 'string') continue;
      const needle = keyword.toLowerCase();
      if (!needle) continue;
      if (normalized.includes(needle)) {
        matches.push(tag);
        break;
      }
    }
  }
  return matches;
}

export function normalizeAudienceScope(raw) {
  const fallback = { target: { scope: 'global' }, interests: ['interest:general'] };
  if (!isPlainObject(raw)) return fallback;

  const targetRaw = raw.target;
  const target = isPlainObject(targetRaw) ? { ...targetRaw } : {};
  if (typeof target.scope !== 'string' || !target.scope.trim()) {
    target.scope = 'custom';
  } else {
    target.scope = target.scope.trim();
  }

  const interests = ensureUniqueStrings(Array.isArray(raw.interests) ? raw.interests : []);
  return { target, interests };
}

export function buildAnnouncementScope({ announcementType, content } = {}) {
  const target = { scope: 'global' };
  const interestSeeds = [];
  if (announcementType) {
    if (typeof announcementType.typeKey === 'string') {
      interestSeeds.push(`announcement:${announcementType.typeKey}`);
    }
    if (typeof announcementType.displayName === 'string') {
      interestSeeds.push(`announcement:${announcementType.displayName.trim().toLowerCase()}`);
    }
  }
  interestSeeds.push(...deriveContentInterests(content));
  return {
    target,
    interests: ensureUniqueStrings(interestSeeds, 'announcement:general'),
  };
}

export function buildStandardPostScope({ user, roleKey, content }) {
  const target = { scope: 'profile' };
  const interestSeeds = deriveContentInterests(content);

  if (user) {
    if (user.departmentId) {
      target.departmentId = user.departmentId;
      interestSeeds.push(`department:${user.departmentId}`);
    }
    if (user.degreeId) {
      target.degreeId = user.degreeId;
      interestSeeds.push(`degree:${user.degreeId}`);
    }
    if (user.roleId) {
      target.roleId = user.roleId;
      interestSeeds.push(`role:${user.roleId}`);
    }
  }

  if (roleKey !== undefined && roleKey !== null) {
    const numericRoleKey = Number.isFinite(Number(roleKey)) ? Number(roleKey) : roleKey;
    target.roleKey = numericRoleKey;
    interestSeeds.push(`roleKey:${numericRoleKey}`);
  }

  return { target, interests: ensureUniqueStrings(interestSeeds, 'profile:general') };
}
