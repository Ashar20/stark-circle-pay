This **Product Requirements Document (PRD)** is optimized for an AI developer (like Claude) to generate the production-ready code for your **Stark-Circle** delegation app.

---

# PRD: Stark-Circle (GPay Delegation on Starknet)

## 1. Objectives

* **Target:** Build a "Circle Pay" style application where a **Primary** account owner delegates spending limits to **Secondary** users.
* **User Experience:** No seed phrases (Social Login), No Gas (Sponsored Transactions), and Native App feel.
* **Hackathon Track:** Wildcard (Innovation/UX) or Bitcoin (if using BTC-backed assets).

---

## 2. Technical Stack

* **Contract:** Cairo 2.x (Starknet native).
* **Frontend:** TypeScript, React (Vite) or React Native (Expo).
* **SDK:** `starkzap` (Core orchestration).
* **Onboarding:** Privy (Social Login) + Cartridge (Account Controller).
* **Gas:** AVNU Paymaster (Integration via Starkzap `feeMode: "sponsored"`).

---

## 3. Core Logic Requirements (The "Prompt" for Claude)

### Part A: The Cairo Smart Contract (`circle_vault.cairo`)

The contract must manage "delegated spending."

* **State:**
* `owner`: The primary account address.
* `members`: A map of member addresses to their `daily_limit`.
* `spent_today`: A map tracking current 24h spending per member.


* **Key Functions:**
* `add_member(member: ContractAddress, limit: u128)`: Only callable by owner.
* `remove_member(member: ContractAddress)`: Only callable by owner.
* `spend(token: ContractAddress, merchant: ContractAddress, amount: u128)`:
* Validates caller is a member.
* Checks `amount` + `spent_today` <= `daily_limit`.
* Executes `ERC20.transfer` from the vault to the merchant.





### Part B: Frontend Integration (TypeScript)

The frontend must use `starkzap` to bridge the Web2 login to the Cairo contract.

* **Setup:** Initialize `StarkSDK` with a Sepolia/Mainnet RPC and AVNU Paymaster URL.
* **Login:** Implement `sdk.onboard` using `OnboardStrategy.Privy`.
* **Transaction:** * Implement a `handlePurchase` function.
* Use `wallet.tx().call(...)` to trigger the vault's `spend` function.
* **Crucial:** Set `feeMode: "sponsored"` so the Secondary user pays $0 gas.



---

## 4. Implementation Prompt for Claude

**Copy and paste the following block into Claude:**

> "I am building **Stark-Circle**, a GPay-like delegation app on Starknet. I need you to generate two parts of the codebase using the **Starkzap SDK**:
> **1. Cairo Contract:** Write a `SpendingVault` contract in Cairo 2.x. It should allow an `owner` to deposit USDC and set a `daily_limit` for specific `member` addresses. Include a `spend` function that verified members call to pay merchants directly from the vault's balance.
> **2. TypeScript Frontend:** > - Show me how to initialize `StarkSDK` from `starkzap` with a Paymaster URL.
> * Write a React function `onboardMember()` using `OnboardStrategy.Privy`.
> * Write a function `executeDelegatedSpend(merchant, amount)` that uses `wallet.tx()` to call the vault's `spend` method with `feeMode: "sponsored"`.
> 
> 
> **3. Integration Logic:** Ensure the secondary user (the member) does not need to hold STRK or ETH for gas. Explain how the signature from the member's Social Login account is used to authorize the vault to pay."

---

## 5. UI/UX Flow

1. **Parent View:** "Circle Dashboard" -> Add Member (Email) -> Set Limit ($50/day) -> Deposit USDC.
2. **Child View:** "Tap to Pay" -> Scans Merchant QR -> Biometric/FaceID confirmation -> Transaction complete ($0 gas).

### **Next Step for You:**

Once Claude gives you the contract code, would you like me to help you set up the **Scarb** (Cairo package manager) environment to deploy it to the Starknet Sepolia testnet?

[Starknet Paymaster and Account Abstraction Guide](https://www.youtube.com/watch?v=e0RuOSUxt6E)
This video explains the underlying "Paymaster" infrastructure from AVNU that allows your app to sponsor gas fees, making the experience feel like Google Pay.