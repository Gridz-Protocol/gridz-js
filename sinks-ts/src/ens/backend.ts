/**
 * Storage backend for the ENS sink. Swappable so the sink logic is testable
 * without a chain: tests inject a fake backend; production injects ViemEnsBackend.
 */
export interface EnsBackend {
  /** Read a text record; null when unset. */
  getText(name: string, key: string): Promise<string | null>;
  /** Write a text record. Empty string clears it. */
  setText(name: string, key: string, value: string): Promise<{ txHash: string }>;
}

/**
 * Live ENS backend over viem. Reads via the public client's ENS text resolution;
 * writes via the wallet client calling the resolver's setText. This thin adapter
 * is excluded from unit coverage and exercised only by the gated live test
 * (GRIDZ_ENS_RPC_URL + GRIDZ_ENS_TEST_KEY), per the brief's "skip, don't fake".
 */
export interface ViemEnsBackendOptions {
  // Intentionally typed loosely to avoid pinning viem client generics here;
  // the live test wires concrete PublicClient/WalletClient + resolver address.
  publicClient: {
    getEnsText(args: { name: string; key: string }): Promise<string | null>;
  };
  walletClient: {
    writeContract(args: unknown): Promise<`0x${string}`>;
  };
  resolverAddress: `0x${string}`;
  resolverAbi: unknown;
  /** namehash(name) helper, injected to keep this file dependency-light. */
  namehash: (name: string) => `0x${string}`;
}

export class ViemEnsBackend implements EnsBackend {
  constructor(private readonly opts: ViemEnsBackendOptions) {}

  async getText(name: string, key: string): Promise<string | null> {
    return this.opts.publicClient.getEnsText({ name, key });
  }

  async setText(name: string, key: string, value: string): Promise<{ txHash: string }> {
    const txHash = await this.opts.walletClient.writeContract({
      address: this.opts.resolverAddress,
      abi: this.opts.resolverAbi,
      functionName: "setText",
      args: [this.opts.namehash(name), key, value],
    });
    return { txHash };
  }
}
