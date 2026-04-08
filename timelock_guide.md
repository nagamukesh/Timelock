# Timelock Payment Contract

A Solidity smart contract implementing a **multi-signature timelock payment system** on Ethereum. Payments require multiple member approvals and a mandatory waiting period before funds can be released.

---

## Assignment Details

| Field | Value |
|---|---|
| **Topic** | Timelock Payment Contract |
| **Platform** | Ethereum (Solidity ^0.8.20) |
| **Tools** | Remix IDE, Geth (local node) |
| **Assignment** | Blockchain Lab – Problem #7 |

---

## What Is This Application?

The Timelock Payment Contract is a **decentralized treasury management system** built on Ethereum. It solves a fundamental problem in shared custody of funds: how do you ensure no single person can unilaterally drain a shared wallet, while also ensuring that once a group agrees on a payment, it actually goes through?

It does this by combining two mechanisms:

**Multi-signature approval** — a payment only moves forward once a minimum number of designated members have voted yes. A 2-of-3 setup means any two out of three members must agree. One rogue member or one compromised key cannot move funds alone.

**Timelock delay** — even after the required approvals are collected, the payment is frozen for a mandatory waiting period. This window exists so that if something went wrong (a member was coerced, a key was stolen, or the proposal was malicious), the group has time to notice and act before the money leaves.

The combination means an attacker needs to simultaneously compromise enough keys *and* go undetected for the entire delay period — a significantly harder bar than either mechanism alone.

---

## Who Are the Actors?

**Members** are pre-designated addresses set at deployment. Only members can propose payments and cast approval votes. Membership is fixed at constructor time.

**The Proposer** is whichever member initiates a payment. They specify the recipient address and ETH amount. Proposing does not auto-approve — the proposer must still call `approvePayment()` separately.

**The Executor** is anyone who calls `executePayment()` after the timelock expires. Intentionally permissionless — no special role needed. Once the window closes, anyone can trigger it.

---

## Application Architecture

The entire application lives in a single Solidity smart contract. No backend server, no database, no admin key.

```
┌─────────────────────────────────────────────────────────────┐
│                        ETHEREUM NODE                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │               TimelockPayment.sol                    │   │
│  │                                                      │   │
│  │  State:                                              │   │
│  │    members[]          → fixed list of addresses      │   │
│  │    requiredApprovals  → quorum threshold             │   │
│  │    delayPeriod        → seconds to wait              │   │
│  │    transactions[]     → all proposals + their state  │   │
│  │    hasApproved[][]    → who voted on what            │   │
│  │    ETH balance        → funds held by contract       │   │
│  │                                                      │   │
│  │  Logic:                                              │   │
│  │    proposePayment()   → creates transaction record   │   │
│  │    approvePayment()   → increments approval count    │   │
│  │    executePayment()   → transfers ETH if conditions  │   │
│  │                         are all met                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          ↑                    ↑                   ↑
    Member wallets       Member wallets        Anyone
    (propose/approve)    (approve)             (execute)
```

**On-chain data model:**

```solidity
struct Transaction {
    address recipient;      // where the ETH goes
    uint256 amount;         // how much (in wei)
    uint256 approvalCount;  // votes collected so far
    uint256 approvalTime;   // timestamp when quorum was reached
    bool executed;          // has the payment gone out?
}
```

---

## How It Works — State Machine

```
Member → proposePayment()  →  [PROPOSED]
Members → approvePayment() →  [APPROVED] → TimelockStarted event
                                           ↓
                               Wait delayPeriod seconds
                                           ↓
Anyone → executePayment()  →  [EXECUTED] → paymentReleased event

Core invariant:  block.timestamp >= approvalTime + delayPeriod
```

Any execution attempt before this condition is met will **revert**.

---

## Payment Lifecycle

```
Member 1                    Contract                     Member 2
   │                           │                             │
   │── proposePayment() ───────▶│                             │
   │                           │ stores Transaction{         │
   │                           │   recipient, amount,        │
   │                           │   approvalCount: 0          │
   │                           │ }                           │
   │                           │ emits PaymentProposed       │
   │                           │                             │
   │── approvePayment(0) ──────▶│                             │
   │                           │ approvalCount → 1           │
   │                           │ emits PaymentApproved       │
   │                           │                             │
   │                           │◀─── approvePayment(0) ──────│
   │                           │ approvalCount → 2           │
   │                           │ == requiredApprovals        │
   │                           │ approvalTime = now          │
   │                           │ emits TimelockStarted       │
   │                           │                             │
   │         ... 120 seconds pass ...                        │
   │                           │                             │
   │── executePayment(0) ──────▶│                             │
   │                           │ now >= approvalTime         │
   │                           │   + delayPeriod           │
   │                           │ executed = true             │
   │                           │ transfer ETH to recipient   │
   │                           │ emits paymentReleased       │
```

---

## Project Structure

```
timelock-payment/
├── TimelockPayment.sol    # Main smart contract (NatSpec documented)
└── README.md              # This file
```

---

## Gas Costs

No ZK proofs, no verifier contracts, no off-chain computation. Every operation is a straightforward ECDSA-signed Ethereum transaction.

| Operation | Estimated Gas | Notes |
|---|---|---|
| Deploy contract | ~400K–600K | One-time, scales with member count |
| `deposit()` | ~21K–30K | Simple ETH receive |
| `proposePayment()` | ~50K–70K | Writes full Transaction struct to storage |
| `approvePayment()` | ~30K–50K | Increments counter + sets bool; ~45K on threshold crossing |
| `executePayment()` | ~35K–60K | Timestamp check + ETH transfer |
| `getTimeRemaining()` | 0 (view) | Read-only, no gas |
| `getContractBalance()` | 0 (view) | Read-only, no gas |

**What drives these numbers:**

- `proposePayment()` is the most expensive write because it allocates a new struct in storage (cold SSTORE costs 20K gas per new slot).
- `approvePayment()` is cheap for non-threshold votes (just flipping a bool + incrementing a counter). The call that crosses the threshold costs slightly more because it also writes `approvalTime`.
- `executePayment()` cost includes the ETH transfer (a 2300 gas stipend is forwarded to the recipient; if the recipient is a contract with a complex fallback, costs rise).
- View functions (`getTimeRemaining`, `getContractBalance`, `getTransaction`) are free when called off-chain. They cost gas only when called from another contract.

**Mainnet cost estimates at 20 gwei, ETH at $3,000:**

| Operation | Gas | Cost (USD) |
|---|---|---|
| Deploy | ~500K | ~$30 |
| proposePayment | ~60K | ~$3.60 |
| approvePayment | ~35K | ~$2.10 |
| executePayment | ~45K | ~$2.70 |
| Full 2-of-3 cycle | ~175K total | ~$10.50 |

**On L2 (Arbitrum / Optimism) these costs drop by ~50–100x** — a full payment cycle costs well under $0.25.

---

## Key Functions

| Function | Access | Description |
|---|---|---|
| `proposePayment(recipient, amount)` | Members only | Create a new payment proposal |
| `approvePayment(txId)` | Members only | Vote to approve a proposal |
| `executePayment(txId)` | Anyone | Execute after timelock expires |
| `getTransaction(txId)` | Public view | Get full transaction details |
| `getTimeRemaining(txId)` | Public view | Seconds left before unlock (0 = ready) |
| `getContractBalance()` | Public view | Current ETH in contract |
| `deposit()` | Anyone | Send ETH to contract |

---

## Key Events

| Event | Trigger |
|---|---|
| `PaymentProposed` | Member calls `proposePayment()` |
| `PaymentApproved` | Member calls `approvePayment()` |
| `TimelockStarted` | Required approvals threshold crossed |
| `paymentReleased` | Payment successfully executed after delay |

---

## Contract Parameters

| Parameter | Type | Description |
|---|---|---|
| `requiredApprovals` | `uint256` | Votes needed to start timelock |
| `delayPeriod` | `uint256` | Seconds to wait after approval |

---

## Security Features

- **Double-vote prevention** — each member can approve a transaction only once via `hasApproved[txId][msg.sender]`
- **Re-entrancy safe** — `executed = true` is set before the ETH transfer
- **Balance checks** — contract balance verified both at proposal time and execution time
- **Zero-address guard** — prevents proposals to `address(0)`
- **Timelock enforcement** — `require(block.timestamp >= approvalTime + delayPeriod)` is atomic and cannot be bypassed

---

## Deployment & Testing Guide

### Prerequisites

- [Geth](https://geth.ethereum.org/downloads) installed
- [Remix IDE](https://remix.ethereum.org) open in browser
- MetaMask or Geth account with test ETH

---

### Step 1 — Start a Local Geth Node

```bash
geth --dev --http --http.api eth,web3,personal,net \
     --http.corsdomain "*" --dev.period 1
```

> `--dev` creates a local chain with pre-funded accounts.
> `--dev.period 1` mines a new block every second.

---

### Step 2 — Load Contract in Remix

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new file: `TimelockPayment.sol`
3. Paste the contract code
4. In **Solidity Compiler** tab → select `0.8.20` → click **Compile**

---

### Step 3 — Connect Remix to Local Geth

1. In **Deploy & Run Transactions** tab
2. Set **Environment** → `Custom - External HTTP Provider`
3. Enter URL: `http://127.0.0.1:8545`
4. Remix should show your Geth accounts

---

### Step 4 — Deploy the Contract

Fill in constructor arguments:

| Parameter | Example Value | Description |
|---|---|---|
| `_members` | `["0xAcc1", "0xAcc2", "0xAcc3"]` | 3 member addresses |
| `_requiredApprovals` | `2` | 2-of-3 multisig |
| `_delayPeriod` | `120` | 2-minute wait (for demo) |

Send **0.05 ETH** as value during deployment to fund the contract.

Click **Deploy** → note the contract address in the console.

---

### Step 5 — Demo Walkthrough

| Step | Account | Action | Expected Result |
|---|---|---|---|
| 5a | Member 1 | `proposePayment(0xRecipient, 10000000000000000)` | `PaymentProposed` event fires |
| 5b | Member 1 | `approvePayment(txId: 0)` | `PaymentApproved` event fires |
| 5c | Member 2 | `approvePayment(txId: 0)` | `TimelockStarted` event fires  |
| 5d | Anyone | `executePayment(txId: 0)` immediately | **REVERT** — timelock not expired  |
| 5e | Anyone | Wait 120s → `executePayment(txId: 0)` | `paymentReleased`, ETH sent  |

> `10000000000000000 wei = 0.01 ETH`

---

### Step 6 — Check Time Remaining

At any point, call:

```
getTimeRemaining(txId: 0)
```

Returns seconds until unlock. Returns `0` when ready to execute.

---

## License

MIT
