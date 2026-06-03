/**
 * Basis-point utilities for OKR cascade arithmetic.
 *
 * A basis point (bp) is 1/100th of a percent.
 * 0 bp = 0%, 10000 bp = 100%.
 *
 * RN-22: conversion from percent to bp uses truncation (Math.trunc), not rounding.
 * Example: 33.3333% → Math.trunc(33.3333 * 100) = Math.trunc(3333.33) = 3333 bp.
 */

/**
 * Convert a percentage value to basis points using truncation (RN-22).
 *
 * @param pct - Percentage in [0, 100] (floating-point).
 * @returns Integer basis points in [0, 10000].
 * @throws RangeError if pct is NaN, non-finite, or outside [0, 100].
 */
export function truncateBpFromPct(pct: number): number {
  if (!Number.isFinite(pct)) {
    throw new RangeError(`truncateBpFromPct: pct must be a finite number, got ${pct}`);
  }
  if (pct < 0 || pct > 100) {
    throw new RangeError(
      `truncateBpFromPct: pct must be in [0, 100], got ${pct}`,
    );
  }
  return Math.trunc(pct * 100);
}

/**
 * Convert basis points to a percentage for presentation purposes only.
 * This function is NOT used in cascade arithmetic — it is only for display.
 *
 * @param bp - Integer basis points in [0, 10000].
 * @param decimals - Number of decimal places to truncate to (default 2).
 * @returns Percentage as a number (e.g., 8200 bp → 82.00, 3333 bp → 33.33).
 * @throws RangeError if bp is outside [0, 10000].
 */
export function bpToPct(bp: number, decimals = 2): number {
  if (bp < 0 || bp > 10000) {
    throw new RangeError(`bpToPct: bp must be in [0, 10000], got ${bp}`);
  }
  const factor = Math.pow(10, decimals);
  return Math.trunc((bp / 100) * factor) / factor;
}
