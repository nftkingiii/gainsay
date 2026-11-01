import { decodeEventLog, keccak256, parseAbi, type Hex } from "viem";

export const MANAGED_ORACLE = "0x2c0367a9db231ddebd88a94b4f6461a6e47c58b1";
export const LEGACY_ORACLE = "0xee3afe347d5c74317041e2618c49534daf887c24";

const abi = parseAbi([
  "event ProposePrice(address indexed requester, address indexed proposer, bytes32 identifier, uint256 timestamp, bytes ancillaryData, int256 proposedPrice, uint256 expirationTimestamp, address currency)",
]);

export const PROPOSE_TOPIC =
  "0x6e51dd00371aabffa82cd401592f76ed51e98a9ea4b58751c70463a2c78b5ca1";

export interface RawLog {
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
}

export interface Proposal {
  requester: string;
  proposer: string;
  ancillaryHash: string;
  ancillaryText: string;
  /** 1 = p2 (usually Yes), 0 = p1 (usually No), 0.5 = unknown. */
  proposedValue: number;
  /** Unix seconds; the challenge window closes here. */
  expiresAt: number;
  block: number;
  tx: string;
}

export function decodeProposal(log: RawLog): Proposal {
  const { args } = decodeEventLog({
    abi,
    eventName: "ProposePrice",
    topics: log.topics as [Hex, ...Hex[]],
    data: log.data as Hex,
  });
  const ancillary = args.ancillaryData;
  return {
    requester: args.requester.toLowerCase(),
    proposer: args.proposer.toLowerCase(),
    ancillaryHash: keccak256(ancillary),
    ancillaryText: Buffer.from(ancillary.slice(2), "hex").toString("utf8"),
    proposedValue: Number(args.proposedPrice) / 1e18,
    expiresAt: Number(args.expirationTimestamp),
    block: Number(BigInt(log.blockNumber)),
    tx: log.transactionHash,
  };
}
