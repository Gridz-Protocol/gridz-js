import { LocalEip712Signer, type AttestationFormat, type Hex, type Signer, type TypedDataParams } from "@gridz/core";

/**
 * Local stand-in for OneClawSigner, for unit tests and offline downstream work.
 *
 * SAFETY: this is NEVER a default. It throws unless GRIDZ_ONECLAW_MOCK=1 is set,
 * and warns loudly when active. It is not a real HSM — the key lives in process.
 */
export class MockOneClawSigner implements Signer {
  private local: LocalEip712Signer;

  constructor(privateKey: Hex, chainId: number) {
    if (process.env.GRIDZ_ONECLAW_MOCK !== "1") {
      throw new Error("MockOneClawSigner requires GRIDZ_ONECLAW_MOCK=1 (it is not a real HSM)");
    }
    // eslint-disable-next-line no-console
    console.warn("⚠️  MockOneClawSigner active (GRIDZ_ONECLAW_MOCK=1) — NOT a real 1claw HSM");
    this.local = LocalEip712Signer.fromPrivateKey(privateKey, chainId);
  }

  get address(): Hex {
    return this.local.address;
  }
  did(): Promise<string> {
    return this.local.did();
  }
  signTypedData(params: TypedDataParams): Promise<{ signature: Hex; signerAddress: Hex }> {
    return this.local.signTypedData(params);
  }
  signMessage(message: string | Uint8Array): Promise<Hex> {
    return this.local.signMessage(message);
  }
  format(): AttestationFormat {
    return "eip712-oneclaw";
  }
}
