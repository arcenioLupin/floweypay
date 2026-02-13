export type PaymentStatus =
  | "AWAITING_PAYMENT"
  | "SEEN_IN_MEMPOOL"
  | "CONFIRMING"
  | "CONFIRMED"
  | "EXPIRED"
  | "FAILED";

export type BtcNetwork = "MAINNET" | "TESTNET" | "SIGNET" | "REGTEST";

export type PaymentLinkVM = {
  id: string;
  title?: string;
  message?: string;

  // Fiat-first
  fiatAmountCents: number;
  currency: string;

  // BTC
  btcAmountSats: bigint;
  btcAddress: string;
  btcNetwork: BtcNetwork;

  // rate lock / expiración
  btcExpiresAt: string;
  btcRateLockedAt?: string;
  btcFxRateBtcPerFiat?: string;
  btcRateProvider?: string;

  // estado
  status: PaymentStatus;
  btcConfirmations: number;
  btcRequiredConfirmations: number;

  // tech opcional
  btcTxid?: string;
  btcDetectedAt?: string;

  paymentLinkToken?: string;
};

export type InvoiceVm = {
  id: string;
  title: string | null;
  message: string | null;

  fiatAmountCents: number;
  currency: string;

  btcAmountSats: string | null;
  btcAddress: string | null;
  btcNetwork: string | null;

  btcExpiresAt: string | null;
  btcRateLockedAt: string | null;
  btcFxRateBtcPerFiat: string | null;
  btcRateProvider: string | null;

  status: string;
  btcConfirmations: number;
  btcRequiredConfirmations: number;

  btcTxid: string | null;
  btcDetectedAt: string | null;

  paymentLinkToken: string | null;
};

export type ApiOk = { success: true; data: InvoiceVm };
export type ApiErr = { success: false; message: string };
export type ApiResp = ApiOk | ApiErr;



