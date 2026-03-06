const express = require("express");
const cors = require("cors");
const { PrivyClient } = require("@privy-io/server-auth");
require("dotenv").config();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const PORT = process.env.PORT || 3001;
const PRIVY_API = "https://api.privy.io";

const privy = new PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET);
const userWalletCache = new Map();

function privyBasicAuth() {
  return "Basic " + Buffer.from(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`).toString("base64");
}

/**
 * POST /api/signer-context
 * Authorization: Bearer <privy access token>
 *
 * 1. Verifies the Privy access token.
 * 2. Finds or creates a Starknet wallet for the user.
 * 3. Returns { walletId, publicKey, serverUrl } for StarkZap's PrivySigner.
 */
app.post("/api/signer-context", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Missing access token" });
    }
    const accessToken = authHeader.slice(7);

    const claims = await privy.verifyAuthToken(accessToken);
    const userId = claims.userId;

    // Use userId as idempotency key so repeated calls return the same wallet.
    // Privy deduplicates within 24h, so we also cache in memory.
    let wallet = userWalletCache.get(userId);

    if (!wallet) {
      // Create a server-managed Starknet wallet (no user owner, so rawSign works with Basic Auth only).
      const createRes = await fetch(`${PRIVY_API}/v1/wallets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "privy-app-id": PRIVY_APP_ID,
          "privy-idempotency-key": `starknet-${userId}`,
          Authorization: privyBasicAuth(),
        },
        body: JSON.stringify({ chain_type: "starknet" }),
      });
      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("Failed to create wallet:", createRes.status, err);
        return res.status(500).json({ error: "Failed to create Starknet wallet", detail: err });
      }
      wallet = await createRes.json();
      userWalletCache.set(userId, wallet);
      console.log(`Wallet for ${userId}: ${wallet.id} (${wallet.address})`);
    }

    const serverUrl = `http://localhost:${PORT}/api/wallet/sign`;

    return res.json({
      walletId: wallet.id,
      publicKey: wallet.public_key,
      serverUrl,
    });
  } catch (err) {
    console.error("signer-context error:", err);
    return res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

/**
 * POST /api/wallet/sign
 * Body: { walletId, hash }
 *
 * Relays rawSign to Privy's API using app secret. Returns { signature }.
 */
app.post("/api/wallet/sign", async (req, res) => {
  try {
    const { walletId, hash } = req.body;
    if (!walletId || !hash) {
      return res.status(400).json({ error: "walletId and hash are required" });
    }

    const signRes = await fetch(`${PRIVY_API}/v1/wallets/${walletId}/raw_sign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": PRIVY_APP_ID,
        Authorization: privyBasicAuth(),
      },
      body: JSON.stringify({
        params: { hash },
      }),
    });

    if (!signRes.ok) {
      const err = await signRes.text();
      console.error("rawSign error:", signRes.status, err);
      return res.status(500).json({ error: "Signing failed", detail: err });
    }

    const signBody = await signRes.json();
    return res.json({ signature: signBody.data.signature });
  } catch (err) {
    console.error("sign error:", err);
    return res.status(500).json({ error: err.message ?? "Internal error" });
  }
});

const http = require("http");
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`Stark-Circle backend running on http://localhost:${PORT}`);
});
