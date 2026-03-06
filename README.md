# Stark-Circle

GPay-style delegation app on Starknet: a **Primary** account delegates spending limits to **Secondary** users. No seed phrases (Social Login), no gas (Sponsored Transactions), native app feel.

## What’s in this repo

- **Cairo contract** (`contracts/`): `SpendingVault` — owner, members with daily limits, `spend(token, merchant, amount)` with 24h reset.
- **React frontend** (`frontend/`): StarkZap + Privy onboarding, AVNU Paymaster, and `executeDelegatedSpend` with `feeMode: "sponsored"`.

## 1. Cairo contract (SpendingVault)

- **Path:** `contracts/src/lib.cairo`
- **State:** `owner`, `members` (address → daily_limit), `member_period` / `member_spent` for 24h rolling window (block-based).
- **Calls:** `add_member`, `remove_member` (owner only), `spend(token, merchant, amount)` (member only; enforces limit and does ERC20 `transfer` from vault to merchant).

### Build & deploy

```bash
cd contracts
scarb build
# Deploy to Starknet Sepolia (e.g. with sncast or Starknet Foundry)
```

After deployment, the **owner** deposits USDC (or other ERC20) to the vault’s address and adds members with `add_member(member, daily_limit)`.

## 2. Frontend — PWA (StarkZap + Privy + WebAuthn + Paymaster)

- **Path:** `frontend/`
- **Stack:** Vite, React, TypeScript, `starkzap`, `@privy-io/react-auth`, `html5-qrcode`, `vite-plugin-pwa`.
- **PWA:** Installable on Android home screen, works offline for UI, served as standalone app.
- **Biometrics:** WebAuthn (FIDO2) via `navigator.credentials` — triggers native Android fingerprint / face ID before every payment. No native SDK needed.

### Env (see `frontend/.env.example`)

| Variable | Description |
|---|---|
| `VITE_PRIVY_APP_ID` | From Privy Dashboard |
| `VITE_PAYMASTER_API_KEY` | From AVNU Portal for sponsored gas |
| `VITE_SIGNER_CONTEXT_API` | Your backend: `POST → { walletId, publicKey, serverUrl }` |
| `VITE_RESOLVE_MEMBER_API` | Your backend: `POST { email } → { address: "0x…" }` (optional) |
| `VITE_VAULT_ADDRESS` | SpendingVault contract address after deploy |
| `VITE_USDC_ADDRESS` | USDC ERC20 address on Starknet Sepolia |
| `VITE_RPC_URL` | Starknet RPC (defaults to public Blast endpoint) |

### Run

```bash
cd frontend
cp .env.example .env   # fill in values
npm install
npm run dev
```

To install as a PWA on Android: open in Chrome → menu → "Add to Home screen".

### Views

**Owner (parent) — Circle Dashboard**
- Shows vault address (copy to share with members).
- Deposit USDC to vault (ERC20 transfer from owner wallet).
- Add member by email or `0x` address with daily USDC limit.
- Remove members. List of members with limit / spent today.
- Role detected automatically: if `wallet.address == vault.get_owner()` → owner view.

**Member (child) — Tap to Pay**
- On first load: registers a WebAuthn passkey (device biometric).
- Tap "Scan QR Code" → opens rear camera via `html5-qrcode`.
- Merchant QR encodes: `{ vault, token, merchant, amount, label? }`.
- Shows payment amount + biometric prompt (fingerprint / face ID).
- Calls `vault.spend()` with `feeMode: "sponsored"` — member pays $0 gas.

### Merchant QR payload

Merchants generate a QR containing this JSON:

```json
{ "vault": "0x…", "token": "0x…", "merchant": "0x…", "amount": "5000000", "label": "Coffee $5" }
```

`amount` is in token smallest units (USDC 6 decimals → $5.00 = `"5000000"`).

### Integration flow

1. User signs in with Privy (email / Google).
2. `onboardMember(getAccessToken)` — creates ArgentX v0.5 account, fully sponsored.
3. WebAuthn passkey registered on device (platform authenticator = fingerprint/face).
4. Child scans merchant QR → biometric prompt → `vault.spend()` on-chain.

## Links

- [Starknet Paymaster / Account Abstraction](https://www.youtube.com/watch?v=e0RuOSUxt6E)
- [StarkZap quick start](https://docs.starknet.io/build/starkzap/quick-start)
- [AVNU Paymaster](https://docs.avnu.fi/docs/paymaster/index)
