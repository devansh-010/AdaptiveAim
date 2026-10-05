/**
 * Client-side unique identifier generator utilities for telemetry tracking.
 * Uses Web Crypto API crypto.randomUUID() when available, with a fallback UUID generator.
 */

export function generateUniqueId(prefix?: string): string {
  let uuid: string;

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    uuid = crypto.randomUUID();
  } else {
    // Standard RFC4122 v4 fallback
    uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const r = (Math.random() * 16) | 0;
      const v = char === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  return prefix ? `${prefix}_${uuid}` : uuid;
}

export function generatePlayerId(): string {
  return generateUniqueId('player');
}

export function generateSessionId(): string {
  return generateUniqueId('session');
}

export function generateRoundId(): string {
  return generateUniqueId('round');
}

export function generateTargetId(): string {
  return generateUniqueId('target');
}

export function generateShotId(): string {
  return generateUniqueId('shot');
}
