// Creates a burner wallet in a local env file and prints only its address.
import { existsSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAddress } from "viem/accounts";

const [, , file, name] = process.argv;
if (!file || !name) throw new Error("usage: new-wallet.mjs <env file> <VARIABLE_NAME>");
if (existsSync(file)) throw new Error(`${file} already exists; not overwriting it`);

const key = generatePrivateKey();
writeFileSync(file, `${name}=${key}\n`, { mode: 0o600 });
console.log(privateKeyToAddress(key));
