/**
 * StarkZap SDK singleton for Stark-Circle.
 * Configure with Sepolia + AVNU Paymaster for sponsored (gasless) transactions.
 */
import { StarkZap } from "starkzap";

const PAYMASTER_NODE_URL = "https://starknet.paymaster.avnu.fi";
const paymasterApiKey = import.meta.env.VITE_PAYMASTER_API_KEY;

export const sdk = new StarkZap({
  network: "sepolia",
  ...(paymasterApiKey && {
    paymaster: {
      nodeUrl: PAYMASTER_NODE_URL,
      apiKey: paymasterApiKey,
    },
  }),
});

export type { StarkZap } from "starkzap";
