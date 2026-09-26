const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })
export function formatVnd(amount: number): string { return formatter.format(amount) }
