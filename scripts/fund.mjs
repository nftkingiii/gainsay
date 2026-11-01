// One-off testnet setup: sends gas to the Pecos wallet and mints test USDC to the buyer.
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseAbi, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const PECOS = "0x3dAE755A6340Ce351c22Ce6440B8209CdC0D0572";
const USDC = "0xcc194e1a843B658526D0D5C431f670028582Ae17";
const RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const abi = parseAbi([
  "function mint(address to, uint256 amount)",
  "function balanceOf(address) view returns (uint256)",
]);

const account = privateKeyToAccount(process.env.GAINSAY_EVM_PRIVATE_KEY);
const transport = http(RPC);
const pub = createPublicClient({ chain: sepolia, transport });
const wallet = createWalletClient({ account, chain: sepolia, transport });

const sendTx = await wallet.sendTransaction({ to: PECOS, value: parseEther("0.01") });
const sendReceipt = await pub.waitForTransactionReceipt({ hash: sendTx });
console.log("eth transfer", sendReceipt.status, sendTx);

const mintTx = await wallet.writeContract({
  address: USDC,
  abi,
  functionName: "mint",
  args: [account.address, 10_000_000n],
});
const mintReceipt = await pub.waitForTransactionReceipt({ hash: mintTx });
console.log("usdc mint", mintReceipt.status, mintTx);

console.log("buyer eth", formatEther(await pub.getBalance({ address: account.address })));
console.log("pecos eth", formatEther(await pub.getBalance({ address: PECOS })));
console.log(
  "buyer usdc",
  formatUnits(await pub.readContract({ address: USDC, abi, functionName: "balanceOf", args: [account.address] }), 6),
);
