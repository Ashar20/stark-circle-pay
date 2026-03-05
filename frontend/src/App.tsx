import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useStarkCircle } from "./hooks/useStarkCircle";
import "./App.css";

function App() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallet, onboardMember, executeDelegatedSpend, error, loading } =
    useStarkCircle();
  const [txPending, setTxPending] = useState(false);
  const [vaultAddr, setVaultAddr] = useState("");
  const [tokenAddr, setTokenAddr] = useState("");
  const [merchantAddr, setMerchantAddr] = useState("");
  const [amount, setAmount] = useState("");

  const handleOnboard = async () => {
    try {
      await onboardMember(getAccessToken);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePay = async () => {
    if (!vaultAddr || !tokenAddr || !merchantAddr || !amount) return;
    setTxPending(true);
    try {
      await executeDelegatedSpend(vaultAddr, tokenAddr, merchantAddr, amount);
      setAmount("");
    } catch (e) {
      console.error(e);
    } finally {
      setTxPending(false);
    }
  };

  if (!ready) {
    return (
      <div className="app">
        <p>Loading…</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="app">
        <h1>Stark-Circle</h1>
        <p>GPay-style delegation on Starknet. Sign in to continue.</p>
        <button type="button" onClick={login}>
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <h1>Stark-Circle</h1>
        <button type="button" onClick={logout}>
          Sign out
        </button>
      </header>

      {error && <p className="error">{error}</p>}

      {!wallet ? (
        <section>
          <h2>Member (child) view</h2>
          <p>Connect your wallet to use delegated spend (gas sponsored).</p>
          <button
            type="button"
            onClick={handleOnboard}
            disabled={loading}
          >
            {loading ? "Connecting…" : "Connect wallet (Privy)"}
          </button>
        </section>
      ) : (
        <section>
          <h2>Tap to Pay</h2>
          <p>Wallet: {wallet.address.toString()}</p>
          <div className="pay-form">
            <input
              placeholder="Vault address"
              value={vaultAddr}
              onChange={(e) => setVaultAddr(e.target.value)}
            />
            <input
              placeholder="Token (e.g. USDC)"
              value={tokenAddr}
              onChange={(e) => setTokenAddr(e.target.value)}
            />
            <input
              placeholder="Merchant address"
              value={merchantAddr}
              onChange={(e) => setMerchantAddr(e.target.value)}
            />
            <input
              placeholder="Amount (smallest units)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              type="button"
              onClick={handlePay}
              disabled={txPending || !vaultAddr || !tokenAddr || !merchantAddr || !amount}
            >
              {txPending ? "Sending…" : "Pay (sponsored gas)"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;
