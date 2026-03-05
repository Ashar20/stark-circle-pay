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

## 2. Frontend (StarkZap + Privy + Paymaster)

- **Path:** `frontend/`
- **Stack:** Vite, React, TypeScript, `starkzap`, `@privy-io/react-auth`.

### Env (see `frontend/.env.example`)

- `VITE_PRIVY_APP_ID` — from [Privy Dashboard](https://dashboard.privy.io).
- `VITE_PAYMASTER_API_KEY` — from [AVNU Portal](https://portal.avnu.fi/) for sponsored gas.
- `VITE_SIGNER_CONTEXT_API` — your backend that, for a Privy user, returns `{ walletId, publicKey, serverUrl }` (used by StarkZap’s Privy strategy).

### Run

```bash
cd frontend
cp .env.example .env   # fill in values
npm install
npm run dev
```

### Integration flow

1. **Login:** User signs in with Privy (email/social).
2. **Onboard member:** `onboardMember(getAccessToken)` uses `sdk.onboard({ strategy: OnboardStrategy.Privy, ..., feeMode: "sponsored" })` so the member gets a wallet without gas.
3. **Delegated spend:** Member calls `executeDelegatedSpend(vaultAddress, tokenAddress, merchantAddress, amount)`. The frontend uses `wallet.execute([call], { feeMode: "sponsored" })` so the **member pays $0 gas**; the paymaster pays.

The member’s Social Login identity is used to get a signer (via your backend and Privy). That signer authorizes the vault’s `spend` call; the vault contract enforces membership and daily limits and performs the ERC20 transfer from the vault to the merchant.

## 3. UI flow (from PRD)

- **Parent:** Circle Dashboard → Add Member (email) → Set limit ($50/day) → Deposit USDC to vault.
- **Child:** Tap to Pay → Scan merchant QR → Biometric/Face ID → Transaction (sponsored gas).

## Links

- [Starknet Paymaster / Account Abstraction](https://www.youtube.com/watch?v=e0RuOSUxt6E)
- [StarkZap quick start](https://docs.starknet.io/build/starkzap/quick-start)
- [AVNU Paymaster](https://docs.avnu.fi/docs/paymaster/index)
