// Built-in exchange rates (base: USD) — for demo/production use a real API
export const EXCHANGE_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  RON: 4.59,
  CAD: 1.36,
  AUD: 1.53,
  JPY: 149.5,
  CHF: 0.88,
  CNY: 7.24,
  INR: 83.12,
  BRL: 4.97,
  MXN: 17.15,
  PLN: 3.98,
  HUF: 356.2,
  CZK: 22.85,
  SGD: 1.34,
  NZD: 1.63,
  SEK: 10.42,
  NOK: 10.65,
  DKK: 6.87,
  ZAR: 18.92,
  AED: 3.67,
  SAR: 3.75,
  THB: 35.2,
  PHP: 55.8,
  IDR: 15650,
  MYR: 4.72,
  VND: 24500,
  KRW: 1320,
  TRY: 32.1,
};

export interface CurrencyConversion {
  from: string;
  to: string;
  amount: number;
  rate: number;
  result: number;
  timestamp: string;
}

export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  customRates?: Record<string, number>
): CurrencyConversion {
  const rates = { ...EXCHANGE_RATES, ...(customRates || {}) };

  const fromRate = rates[fromCurrency.toUpperCase()];
  const toRate = rates[toCurrency.toUpperCase()];

  if (fromRate === undefined) {
    throw new Error(`Unknown currency: ${fromCurrency}`);
  }
  if (toRate === undefined) {
    throw new Error(`Unknown currency: ${toCurrency}`);
  }

  // Convert to USD first, then to target
  const amountInUsd = amount / fromRate;
  const result = amountInUsd * toRate;
  const rate = toRate / fromRate;

  return {
    from: fromCurrency.toUpperCase(),
    to: toCurrency.toUpperCase(),
    amount,
    rate,
    result,
    timestamp: new Date().toISOString(),
  };
}

export function listSupportedCurrencies(): Array<{ code: string; rate_to_usd: number }> {
  return Object.entries(EXCHANGE_RATES)
    .map(([code, rate]) => ({ code, rate_to_usd: rate }))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
