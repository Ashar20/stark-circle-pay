/**
 * Stark-Circle: onboard member (Privy) and execute delegated spend with sponsored gas.
 */
import { useCallback, useState } from "react";
import {
  OnboardStrategy,
  accountPresets,
  type WalletInterface,
} from "starkzap";
import type { Call } from "starknet";
import { sdk } from "../lib/starkzap";

const SIGNER_CONTEXT_API = import.meta.env.VITE_SIGNER_CONTEXT_API ?? "";

export function useStarkCircle() {
  const [wallet, setWallet] = useState<WalletInterface | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /**
   * Onboard a member using Privy. Requires:
   * - User already authenticated with Privy (getAccessToken() from usePrivy).
   * - Backend at VITE_SIGNER_CONTEXT_API that returns { walletId, publicKey, serverUrl } for the Privy user.
   */
  const onboardMember = useCallback(
    async (getAccessToken: () => Promise<string | null>) => {
      setLoading(true);
      setError(null);
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Not authenticated with Privy");
        }
        if (!SIGNER_CONTEXT_API) {
          throw new Error(
            "VITE_SIGNER_CONTEXT_API is not set. Configure your backend URL that returns signer context (walletId, publicKey, serverUrl) for the Privy user."
          );
        }
        const { wallet: w } = await sdk.onboard({
          strategy: OnboardStrategy.Privy,
          privy: {
            resolve: async () =>
              fetch(SIGNER_CONTEXT_API, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
              }).then((r) => {
                if (!r.ok) throw new Error("Signer context failed");
                return r.json();
              }),
          },
          accountPreset: accountPresets.argentXV050,
          feeMode: "sponsored",
          deploy: "if_needed",
        });
        setWallet(w);
        return w;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Execute a delegated spend: vault.spend(token, merchant, amount).
   * Uses feeMode: "sponsored" so the member pays $0 gas.
   */
  const executeDelegatedSpend = useCallback(
    async (
      vaultAddress: string,
      tokenAddress: string,
      merchantAddress: string,
      amount: string
    ) => {
      if (!wallet) {
        throw new Error("Not onboarded. Call onboardMember first.");
      }
      // u128 = single felt in Starknet calldata
      const call: Call = {
        contractAddress: vaultAddress,
        entrypoint: "spend",
        calldata: [tokenAddress, merchantAddress, amount],
      };
      const tx = await wallet.execute([call], { feeMode: "sponsored" });
      await tx.wait();
      return tx;
    },
    [wallet]
  );

  return {
    wallet,
    onboardMember,
    executeDelegatedSpend,
    error,
    loading,
  };
}
