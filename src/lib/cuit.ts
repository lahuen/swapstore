/** Validate CUIT/CUIL format using modulo 11 algorithm */
export function validateCuit(raw: string): { valid: boolean; formatted: string } {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 11) return { valid: false, formatted: raw };

  const multipliers = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(digits[i]) * multipliers[i];
  }
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;

  const valid = check === parseInt(digits[10]);
  const formatted = `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  return { valid, formatted };
}
