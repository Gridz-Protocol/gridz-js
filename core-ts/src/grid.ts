import type { Cell, CellPosition, Grid, Hex, Subject, Theme } from "./types.js";
import { SCHEMA_VERSION } from "./types.js";
import { algoForFormat } from "./hash.js";
import { merkleRoot } from "./merkle.js";
import { buildCellAttestation, buildRootAttestation } from "./attest.js";
import type { Signer } from "./signer.js";

export interface CellDraft {
  id: string;
  key: string;
  value: unknown;
  widget_type?: string;
  position: CellPosition;
  size: string;
  is_visible?: boolean;
  expires_at?: Date;
  nonce?: bigint;
}

export interface BuildGridInput {
  subject: Subject;
  theme: Theme;
  cells: CellDraft[];
  /** Required when the signer is EIP-712. */
  chainId?: number;
  verifyingContract?: Hex;
  /** Override "now" for deterministic builds/tests. */
  now?: Date;
}

/**
 * Sign every cell, build the sorted merkle root over their attestation UIDs, and
 * sign the root. The output is a fully self-verifying Grid (see verifyGrid).
 */
export async function buildGrid(signer: Signer, input: BuildGridInput): Promise<Grid> {
  const subjectDid = input.subject.did;
  const algo = algoForFormat(signer.format());

  const cells: Cell[] = [];
  for (const d of input.cells) {
    const attestation = await buildCellAttestation(signer, {
      subjectDid,
      key: d.key,
      value: d.value,
      widgetType: d.widget_type,
      expiresAt: d.expires_at,
      nonce: d.nonce,
      chainId: input.chainId,
      verifyingContract: input.verifyingContract,
      now: input.now,
    });
    cells.push({
      id: d.id,
      key: d.key,
      value: d.value,
      ...(d.widget_type ? { widget_type: d.widget_type } : {}),
      position: d.position,
      size: d.size,
      is_visible: d.is_visible ?? true,
      attestation,
      ...(d.expires_at ? { expires_at: d.expires_at.toISOString() } : {}),
    });
  }

  const root = merkleRoot(
    algo,
    cells.map((c) => c.attestation.uid),
  );
  const root_attestation = await buildRootAttestation(signer, {
    subjectDid,
    merkleRoot: root,
    cellCount: cells.length,
    chainId: input.chainId,
    verifyingContract: input.verifyingContract,
    now: input.now,
  });

  return {
    schema_version: SCHEMA_VERSION,
    subject: input.subject,
    theme: input.theme,
    cells,
    root_attestation,
  };
}
