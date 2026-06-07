import {
  type AttestationFormat,
  type Hex,
  type Signer,
  type TypedDataParams,
  EIP712_DOMAIN_TYPE,
} from "@gridz/core";

export const DEFAULT_ONECLAW_API_BASE = "https://api.1claw.xyz";

export class OneClawError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "OneClawError";
  }
}

export interface OneClawConfig {
  agentId: string;
  /** Agent API key (ocv_…). Never persisted by Gridz. */
  apiKey: string;
  /** The HSM key's EVM address (from provisioning). Drives did:pkh. */
  address: Hex;
  chainId: number;
  apiBase?: string;
  /** Optional TEE-backed signing host (shroud.1claw.xyz / intents.1claw.xyz). */
  signingHost?: string;
  /** 1claw vault UUID — default for oneclaw://vault/… sink credential URIs. */
  vaultId?: string;
}

export function loadOneClawConfig(env: Record<string, string | undefined> = process.env): OneClawConfig | null {
  const agentId = env.ONECLAW_AGENT_ID;
  const apiKey = env.ONECLAW_AGENT_KEY ?? env.GRIDZ_ONECLAW_API_KEY;
  const address = env.ONECLAW_ADDRESS as Hex | undefined;
  if (!agentId || !apiKey || !address) return null;
  return {
    agentId,
    apiKey,
    address,
    chainId: Number(env.ONECLAW_CHAIN_ID ?? "11155111"),
    apiBase: env.ONECLAW_API_BASE ?? DEFAULT_ONECLAW_API_BASE,
    ...(env.ONECLAW_SIGNING_HOST ? { signingHost: env.ONECLAW_SIGNING_HOST } : {}),
    ...(env.ONECLAW_VAULT_ID ? { vaultId: env.ONECLAW_VAULT_ID } : {}),
  };
}

/** Build a `oneclaw://vault/<id>/<path>` URI using config or `ONECLAW_VAULT_ID`. */
export function oneClawVaultUri(path: string, vaultId?: string): string {
  const id = vaultId ?? process.env.ONECLAW_VAULT_ID;
  if (!id) throw new OneClawError("ONECLAW_VAULT_ID required for vault URIs", "no_vault_id");
  const clean = path.replace(/^\/+/, "");
  return `oneclaw://vault/${id}/${clean}`;
}

function bigintReplacer(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? v.toString() : v;
}

/**
 * Third first-class signer: HSM-backed EIP-712 signing via 1claw's unified sign
 * endpoint. The private key never leaves the HSM. Verification is byte-identical
 * to a local EIP-712 signer — `format()` reports eip712-oneclaw only as provenance,
 * never as a trust assumption (the verifier recovers the address regardless).
 */
export class OneClawSigner implements Signer {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly config: OneClawConfig,
    opts: { fetch?: typeof fetch } = {},
  ) {
    this.base = (config.signingHost ?? config.apiBase ?? DEFAULT_ONECLAW_API_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }

  format(): AttestationFormat {
    return "eip712-oneclaw";
  }

  async did(): Promise<string> {
    return `did:pkh:eip155:${this.config.chainId}:${this.config.address.toLowerCase()}`;
  }

  private async sign(intent: Record<string, unknown>): Promise<{ signature: Hex; from: Hex }> {
    const res = await this.fetchImpl(`${this.base}/v1/agents/${this.config.agentId}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify(intent, bigintReplacer),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = String(body.error ?? body.message ?? `1claw sign failed (${res.status})`);
      if (res.status === 403 || /allowlist|domain/i.test(msg)) {
        throw new OneClawError(
          msg,
          "eip712_domain_allowlist",
          "Add the Gridz EIP-712 domain to this agent's eip712_domain_allowlist on dashboard.1claw.xyz (see eip712DomainAllowlistSnippet).",
        );
      }
      throw new OneClawError(msg, "sign_failed");
    }
    return { signature: body.signature as Hex, from: body.from as Hex };
  }

  async signTypedData(params: TypedDataParams): Promise<{ signature: Hex; signerAddress: Hex }> {
    const { signature, from } = await this.sign({
      intent_type: "typed_data",
      typed_data: {
        domain: params.domain,
        types: { EIP712Domain: EIP712_DOMAIN_TYPE, ...params.types },
        primaryType: params.primaryType,
        message: params.message,
      },
    });
    return { signature, signerAddress: from ?? this.config.address };
  }

  async signMessage(message: string | Uint8Array): Promise<Hex> {
    const hex = typeof message === "string" ? `0x${Buffer.from(message).toString("hex")}` : `0x${Buffer.from(message).toString("hex")}`;
    const { signature } = await this.sign({ intent_type: "personal_sign", message: hex });
    return signature;
  }
}

export interface ProvisionResult {
  address: Hex;
  public_key: string;
}

/** Provisions a per-chain HSM signing key. Human-only on 1claw (agents get 403). */
export class OneClawKeyProvisioner {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  constructor(
    private readonly config: Pick<OneClawConfig, "agentId" | "apiKey" | "apiBase">,
    opts: { fetch?: typeof fetch } = {},
  ) {
    this.base = (config.apiBase ?? DEFAULT_ONECLAW_API_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }
  async provision(chain: "ethereum" | "solana" | "bitcoin" | "xrp" | "cardano" | "tron"): Promise<ProvisionResult> {
    const res = await this.fetchImpl(`${this.base}/v1/agents/${this.config.agentId}/signing-keys`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.config.apiKey}` },
      body: JSON.stringify({ chain }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new OneClawError(String(body.error ?? "provision failed"), "provision_failed");
    return { address: body.address as Hex, public_key: String(body.public_key) };
  }
}

/**
 * Resolve oneclaw://vault/<vaultId>/<path> sink-credential URIs to a short-lived
 * secret. Cached in-process only — NEVER written to disk.
 */
export class OneClawResolver {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private cache = new Map<string, string>();
  constructor(
    private readonly config: Pick<OneClawConfig, "apiKey" | "apiBase">,
    opts: { fetch?: typeof fetch } = {},
  ) {
    this.base = (config.apiBase ?? DEFAULT_ONECLAW_API_BASE).replace(/\/$/, "");
    this.fetchImpl = opts.fetch ?? fetch;
  }
  static isOneClawUri(uri: string): boolean {
    return uri.startsWith("oneclaw://vault/");
  }
  async resolve(uri: string): Promise<string> {
    const m = /^oneclaw:\/\/vault\/([^/]+)\/(.+)$/.exec(uri);
    if (!m) throw new OneClawError(`not a oneclaw vault URI: ${uri}`, "bad_uri");
    if (this.cache.has(uri)) return this.cache.get(uri)!;
    const [, vaultId, path] = m;
    const res = await this.fetchImpl(`${this.base}/v1/vaults/${vaultId}/secrets/${path}`, {
      headers: { authorization: `Bearer ${this.config.apiKey}` },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new OneClawError(String(body.error ?? "secret fetch failed"), "secret_failed");
    const secret = String(body.value ?? body.secret);
    this.cache.set(uri, secret);
    return secret;
  }
}

export interface Eip712Domain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Hex;
}

/**
 * The exact domain the operator must add to their agent's eip712_domain_allowlist.
 * Surfaced by `gridz identity import --from oneclaw` (human-approval step — Gridz
 * never edits the allowlist programmatically).
 */
export function eip712DomainAllowlistSnippet(verifyingContract: Hex, chainId: number): {
  domain: Eip712Domain;
  instructions: string;
  json: string;
} {
  const domain: Eip712Domain = { name: "Gridz", version: "1", chainId, verifyingContract };
  return {
    domain,
    instructions:
      "On dashboard.1claw.xyz → your agent → EIP-712 domain allowlist, add the following entry, then press enter to continue:",
    json: JSON.stringify(domain, null, 2),
  };
}
