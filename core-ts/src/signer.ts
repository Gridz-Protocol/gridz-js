import { privateKeyToAccount } from "viem/accounts";
import { bytesToHex, stringToBytes, type LocalAccount } from "viem";
import { ed25519 } from "@noble/curves/ed25519";
import { base58, base64urlnopad } from "@scure/base";
import type { AttestationFormat, Hex } from "./types.js";
import { GridzError } from "./errors.js";

export interface TypedDataDomain {
  name?: string;
  version?: string;
  chainId?: number;
  verifyingContract?: Hex;
  salt?: Hex;
}

export interface TypedDataParams {
  domain: TypedDataDomain;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * The framework's Signer interface (§5). Gridz never custodies a private key;
 * implementations wrap an external signing capability (local key, passkey, HSM).
 *
 * Note: signTypedData takes a single params object including primaryType (viem
 * requires it); the brief's three-arg shape is folded into this object. See
 * DESIGN_NOTES.md.
 */
export interface Signer {
  did(): Promise<string>;
  signTypedData(
    params: TypedDataParams,
  ): Promise<{ signature: Hex; signerAddress: Hex }>;
  signMessage(message: string | Uint8Array): Promise<Hex>;
  format(): AttestationFormat;
}

/**
 * Local EIP-712 signer backed by a raw secp256k1 private key (viem account).
 * This is the substrate EthersSigner / ViemSigner / KeystoreSigner all reduce to.
 * Produces did:pkh:eip155 identities (CAIP-10), the interoperable default.
 */
export class LocalEip712Signer implements Signer {
  private readonly account: LocalAccount;
  readonly chainId: number;

  constructor(account: LocalAccount, chainId: number) {
    this.account = account;
    this.chainId = chainId;
  }

  static fromPrivateKey(privateKey: Hex, chainId: number): LocalEip712Signer {
    return new LocalEip712Signer(privateKeyToAccount(privateKey), chainId);
  }

  get address(): Hex {
    return this.account.address;
  }

  async did(): Promise<string> {
    return `did:pkh:eip155:${this.chainId}:${this.account.address.toLowerCase()}`;
  }

  async signTypedData(
    params: TypedDataParams,
  ): Promise<{ signature: Hex; signerAddress: Hex }> {
    const signature = await this.account.signTypedData(params as never);
    return { signature, signerAddress: this.account.address };
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    return this.account.signMessage({
      message: typeof message === "string" ? message : { raw: message },
    });
  }

  format(): AttestationFormat {
    return "eip712-raw";
  }
}

const MULTICODEC_ED25519 = Uint8Array.from([0xed, 0x01]);

/** Concatenate byte arrays. */
function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/**
 * Ed25519 signer for Solana / did:key contexts. Produces compact JWS (EdDSA).
 * The 32-byte secret is held by the caller; Gridz does not persist it.
 */
export class Ed25519Signer implements Signer {
  private readonly secretKey: Uint8Array;

  constructor(secretKey: Uint8Array) {
    if (secretKey.length !== 32) {
      throw new GridzError("ed25519/bad-seed", "ed25519 seed must be 32 bytes");
    }
    this.secretKey = secretKey;
  }

  get publicKey(): Uint8Array {
    return ed25519.getPublicKey(this.secretKey);
  }

  async did(): Promise<string> {
    return `did:key:z${base58.encode(concatBytes(MULTICODEC_ED25519, this.publicKey))}`;
  }

  async signTypedData(): Promise<{ signature: Hex; signerAddress: Hex }> {
    throw new GridzError(
      "ed25519/no-eip712",
      "Ed25519Signer cannot produce EIP-712 signatures; use the jws-ed25519 path",
    );
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    const bytes = typeof message === "string" ? stringToBytes(message) : message;
    const sig = ed25519.sign(bytes, this.secretKey);
    return bytesToHex(sig);
  }

  /** Build a compact JWS (EdDSA) over the given claims. */
  async signJWS(claims: Record<string, unknown>): Promise<string> {
    const header = { alg: "EdDSA", typ: "JWT", kid: await this.did() };
    const enc = (o: unknown) => base64urlnopad.encode(stringToBytes(JSON.stringify(o)));
    const signingInput = `${enc(header)}.${enc(claims)}`;
    const sig = ed25519.sign(stringToBytes(signingInput), this.secretKey);
    return `${signingInput}.${base64urlnopad.encode(sig)}`;
  }

  format(): AttestationFormat {
    return "jws-ed25519";
  }
}

/** Parse the ed25519 public key out of a did:key string. */
export function publicKeyFromDidKey(did: string): Uint8Array {
  const m = /^did:key:z([1-9A-HJ-NP-Za-km-z]+)$/.exec(did);
  if (!m) throw new GridzError("didkey/parse", `not a did:key: ${did}`);
  const decoded = base58.decode(m[1]!);
  if (decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new GridzError("didkey/codec", "did:key is not ed25519 (expected 0xed01 multicodec)");
  }
  return decoded.slice(2);
}
