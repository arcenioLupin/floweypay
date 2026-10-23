import { btcRpcCall } from "@/app/api/_lib/bitcoinRpc";
import { chainToNetwork, type BtcNet } from "@/app/api/_lib/descriptor";
import type { BlockchainInfo } from "@/app/types/nodeBtcTypes";

/**
 * API-001 — Bitcoin Core as the authoritative engine for descriptor checksum
 * validation, canonicalization, Address #0 derivation, and node-network
 * verification. Node-level RPCs only (never wallet RPCs, never getnewaddress,
 * never private-key import). Fails closed on any node unavailability.
 */

export const WALLET_RPC_ERROR_CODES = {
  NODE_UNAVAILABLE: "WALLET_NODE_UNAVAILABLE",
  CHECKSUM_INVALID: "WALLET_CHECKSUM_INVALID",
  INPUT_INVALID: "WALLET_INPUT_INVALID",
  PRIVATE_MATERIAL_REJECTED: "WALLET_PRIVATE_MATERIAL_REJECTED",
} as const;

export type WalletRpcErrorCode =
  (typeof WALLET_RPC_ERROR_CODES)[keyof typeof WALLET_RPC_ERROR_CODES];

export class WalletRpcError extends Error {
  readonly code: WalletRpcErrorCode;
  constructor(code: WalletRpcErrorCode) {
    super(code);
    this.code = code;
    this.name = "WalletRpcError";
  }
}

interface GetDescriptorInfoResult {
  descriptor: string;
  checksum: string;
  isrange: boolean;
  issolvable: boolean;
  hasprivatekeys: boolean;
}

export interface DescriptorInfo {
  /** Core-canonical descriptor, including the authoritative checksum. */
  canonicalDescriptor: string;
  checksum: string;
}

/** Classify a raw RPC error message into a safe code without leaking details. */
function classifyRpcError(message: string): WalletRpcErrorCode {
  const m = message.toLowerCase();
  if (m.includes("checksum")) return WALLET_RPC_ERROR_CODES.CHECKSUM_INVALID;
  if (m.includes("private key")) {
    return WALLET_RPC_ERROR_CODES.PRIVATE_MATERIAL_REJECTED;
  }
  if (m.includes("invalid descriptor") || m.includes("invalid")) {
    return WALLET_RPC_ERROR_CODES.INPUT_INVALID;
  }
  // Transport / node-down / unknown => fail closed.
  return WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE;
}

/**
 * Validate a descriptor (with or without supplied checksum) via getdescriptorinfo.
 * A bad supplied checksum makes Core throw -> surfaced as CHECKSUM_INVALID.
 * @param descriptorForValidation descriptor body, optionally with "#checksum".
 */
export async function getDescriptorInfo(
  descriptorForValidation: string
): Promise<DescriptorInfo> {
  let result: GetDescriptorInfoResult;
  try {
    result = await btcRpcCall<GetDescriptorInfoResult>("getdescriptorinfo", [
      descriptorForValidation,
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new WalletRpcError(classifyRpcError(message));
  }

  if (result.hasprivatekeys) {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.PRIVATE_MATERIAL_REJECTED);
  }
  if (!result.issolvable) {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.INPUT_INVALID);
  }
  if (
    typeof result.descriptor !== "string" ||
    typeof result.checksum !== "string" ||
    !result.descriptor.endsWith(`#${result.checksum}`)
  ) {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.INPUT_INVALID);
  }

  return {
    canonicalDescriptor: result.descriptor,
    checksum: result.checksum,
  };
}

/** Derive external receive Address #0 from a canonical (ranged) descriptor. */
export async function deriveAddress0(
  canonicalDescriptor: string
): Promise<string> {
  let addresses: string[];
  try {
    addresses = await btcRpcCall<string[]>("deriveaddresses", [
      canonicalDescriptor,
      [0, 0],
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    throw new WalletRpcError(classifyRpcError(message));
  }
  const address0 = addresses?.[0];
  if (typeof address0 !== "string" || address0.length === 0) {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE);
  }
  return address0;
}

/** Authoritative node network from getblockchaininfo. Fails closed on error. */
export async function getNodeNetwork(): Promise<BtcNet> {
  let info: BlockchainInfo;
  try {
    info = await btcRpcCall<BlockchainInfo>("getblockchaininfo");
  } catch {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE);
  }
  const network = chainToNetwork(info.chain);
  if (network === null) {
    throw new WalletRpcError(WALLET_RPC_ERROR_CODES.NODE_UNAVAILABLE);
  }
  return network;
}
