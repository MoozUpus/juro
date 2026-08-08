export const BASIS_POINTS_SCALE = 10_000;

function safeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label.toUpperCase()}_MUST_BE_A_SAFE_INTEGER`);
  }
  return value;
}

export function nonNegativeMinor(value: number, label = "amount"): number {
  safeInteger(value, label);
  if (value < 0) throw new RangeError(`${label.toUpperCase()}_MUST_BE_NON_NEGATIVE`);
  return value;
}

export function basisPoints(value: number, label = "rate"): number {
  safeInteger(value, label);
  if (value < 0 || value > BASIS_POINTS_SCALE) {
    throw new RangeError(`${label.toUpperCase()}_BASIS_POINTS_OUT_OF_RANGE`);
  }
  return value;
}

function safeBigIntToNumber(value: bigint, label: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label.toUpperCase()}_OVERFLOW`);
  return result;
}

/** Integer half-up calculation. No binary floating-point amount arithmetic. */
export function applyBasisPoints(amountMinor: number, rateBasisPoints: number): number {
  const amount = BigInt(nonNegativeMinor(amountMinor));
  const rate = BigInt(basisPoints(rateBasisPoints));
  const scale = BigInt(BASIS_POINTS_SCALE);
  return safeBigIntToNumber((amount * rate + scale / 2n) / scale, "basis_points_result");
}

export type TwoPartyAllocation = Readonly<{
  lawyerMinor: number;
  platformMinor: number;
}>;

/**
 * Deterministic pro-rata allocation. The platform receives the indivisible
 * remainder so both shares always equal the original amount.
 */
export function allocateProRata(
  amountMinor: number,
  lawyerBaseMinor: number,
  platformBaseMinor: number,
): TwoPartyAllocation {
  const amount = BigInt(nonNegativeMinor(amountMinor));
  const lawyerBase = BigInt(nonNegativeMinor(lawyerBaseMinor, "lawyer_base"));
  const platformBase = BigInt(nonNegativeMinor(platformBaseMinor, "platform_base"));
  const totalBase = lawyerBase + platformBase;
  if (amount > 0n && totalBase === 0n) throw new RangeError("ALLOCATION_BASE_REQUIRED");
  if (amount === 0n) return Object.freeze({ lawyerMinor: 0, platformMinor: 0 });

  const lawyer = amount * lawyerBase / totalBase;
  const platform = amount - lawyer;
  return Object.freeze({
    lawyerMinor: safeBigIntToNumber(lawyer, "lawyer_allocation"),
    platformMinor: safeBigIntToNumber(platform, "platform_allocation"),
  });
}

