/**
 * Server-only TRON BIP-44 HD wallet helpers.
 *
 * Path: m/44'/195'/{account}'/0/{index}
 *   account 0 → per-payment-intent deposit addresses
 *   account 1 → per-vendor deposit addresses
 *
 * The mnemonic / private keys NEVER leave the server. DB stores only
 * public addresses + derivation metadata.
 */

import { randomBytes } from "crypto";
import { HDNodeWallet, Mnemonic, getBytes } from "ethers";
import TronWeb from "tronweb";

/** SLIP-44 coin type for TRON. */
export const TRON_BIP44_COIN_TYPE = 195;

export const HD_ACCOUNT_PAYMENT_INTENTS = 0;
export const HD_ACCOUNT_VENDORS = 1;

export type DerivedTronAddress = {
  address: string;
  derivationPath: string;
  account: number;
  index: number;
};

function requireServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("TRON HD wallet helpers are server-only.");
  }
}

function getMnemonicPhrase(): string | null {
  const phrase =
    process.env.USDT_TRC20_HD_MNEMONIC?.trim() ||
    process.env.USDT_TRC20_HD_SEED_PHRASE?.trim() ||
    null;
  return phrase && phrase.split(/\s+/).length >= 12 ? phrase : null;
}

export function isHdWalletConfigured(): boolean {
  return Boolean(getMnemonicPhrase());
}

/**
 * Generate a fresh 12-word BIP-39 mnemonic (128-bit entropy).
 * Callers must persist it securely (env / secret manager) — never in the DB.
 */
export function generateHdMnemonic(): string {
  requireServerOnly();
  const mnemonic = Mnemonic.fromEntropy(getBytes(randomBytes(16)));
  return mnemonic.phrase;
}

export function validateHdMnemonic(phrase: string): boolean {
  try {
    Mnemonic.fromPhrase(phrase.trim());
    return phrase.trim().split(/\s+/).length >= 12;
  } catch {
    return false;
  }
}

export function tronDerivationPath(account: number, index: number): string {
  if (!Number.isInteger(account) || account < 0) {
    throw new Error("HD account must be a non-negative integer.");
  }
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("HD index must be a non-negative integer.");
  }
  return `m/44'/${TRON_BIP44_COIN_TYPE}'/${account}'/0/${index}`;
}

function walletAtPath(phrase: string, path: string): HDNodeWallet {
  return HDNodeWallet.fromPhrase(phrase, undefined, path);
}

function tronAddressFromPrivateKey(privateKeyHex: string): string {
  // tronweb CJS export is the constructor function itself.
  const TronWebCtor = TronWeb as unknown as {
    new (options: { fullHost: string }): {
      address: {
        fromPrivateKey: (key: string) => string;
      };
      isAddress: (address: string) => boolean;
    };
  };
  const tw = new TronWebCtor({
    fullHost: process.env.TRONGRID_API_BASE?.trim() || "https://api.trongrid.io",
  });
  const key = privateKeyHex.replace(/^0x/i, "");
  const address = tw.address.fromPrivateKey(key);
  if (!address || !tw.isAddress(address)) {
    throw new Error("Failed to derive a valid TRON address from HD key.");
  }
  return address;
}

/**
 * Recover / load the master mnemonic and derive a child TRON address.
 * Does not return the private key.
 */
export function deriveTronAddress(options: {
  account?: number;
  index: number;
  mnemonic?: string;
}): DerivedTronAddress {
  requireServerOnly();
  const phrase = options.mnemonic?.trim() || getMnemonicPhrase();
  if (!phrase) {
    throw new Error(
      "USDT HD wallet is not configured. Set USDT_TRC20_HD_MNEMONIC.",
    );
  }
  if (!validateHdMnemonic(phrase)) {
    throw new Error("USDT_TRC20_HD_MNEMONIC is not a valid BIP-39 phrase.");
  }

  const account = options.account ?? HD_ACCOUNT_PAYMENT_INTENTS;
  const path = tronDerivationPath(account, options.index);
  const wallet = walletAtPath(phrase, path);
  const address = tronAddressFromPrivateKey(wallet.privateKey);

  return {
    address,
    derivationPath: path,
    account,
    index: options.index,
  };
}

/**
 * Derive the child private key for signing (sweeps). Never log or expose.
 */
export function deriveTronPrivateKey(options: {
  account?: number;
  index: number;
  mnemonic?: string;
}): { privateKeyHex: string; address: string; derivationPath: string } {
  requireServerOnly();
  const phrase = options.mnemonic?.trim() || getMnemonicPhrase();
  if (!phrase) {
    throw new Error(
      "USDT HD wallet is not configured. Set USDT_TRC20_HD_MNEMONIC.",
    );
  }
  const account = options.account ?? HD_ACCOUNT_PAYMENT_INTENTS;
  const path = tronDerivationPath(account, options.index);
  const wallet = walletAtPath(phrase, path);
  const privateKeyHex = wallet.privateKey.replace(/^0x/i, "");
  const address = tronAddressFromPrivateKey(wallet.privateKey);
  return { privateKeyHex, address, derivationPath: path };
}

/** Account-0 / index-0 master receive address (useful as settings fallback). */
export function getHdMasterDepositAddress(mnemonic?: string): string {
  return deriveTronAddress({ account: 0, index: 0, mnemonic }).address;
}

export function derivePaymentIntentDepositAddress(index: number): DerivedTronAddress {
  return deriveTronAddress({
    account: HD_ACCOUNT_PAYMENT_INTENTS,
    index,
  });
}

export function deriveVendorDepositAddress(index: number): DerivedTronAddress {
  return deriveTronAddress({
    account: HD_ACCOUNT_VENDORS,
    index,
  });
}
