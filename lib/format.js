export function formatAmount(value) {
  const num = Number(value) || 0;
  const negative = num < 0;
  const formatted = Math.abs(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return negative ? `(${formatted})` : formatted;
}
