# Timelock Payment Contract

A **multi-signature, timelock-based smart contract** for secure, delayed fund transfers on Ethereum. Combines multi-signature approval with mandatory waiting periods to prevent unilateral fund movements and provide a security window for fraud detection.

## Features

* **Multi-Signature Approval** — Requires N-of-M member signatures before payment processing  
* **Atomic Timelock Enforcement** — Mandatory delay after quorum, cannot be bypassed  
* **Double-Vote Prevention** — Each member can approve only once per transaction  
* **Re-entrancy Protection** — Checks-effects-interactions pattern  
* **Permissionless Execution** — Anyone can trigger payment after timelock expires  
* **Full Event Logging** — PaymentProposed, PaymentApproved, TimelockStarted, paymentReleased  
* **NatSpec Documentation** — Every function fully documented

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

```bash
git clone <repository-url>
cd timelock-payment
npm install
```

### Run Tests

```bash
npm test
```

**Expected output**:
```
24 passing (1s)
All tests pass
```

### Compile Contract

```bash
npm run compile
```

### Deploy Locally

```bash
npm run node          # Terminal 1: Start local network
npm run deploy        # Terminal 2: Deploy contract
```

## Usage Example

```javascript
// Deploy with 3 members, 2-of-3 multisig, 120-second delay
const timelock = await TimelockPayment.deploy(
  ["0xAddr1", "0xAddr2", "0xAddr3"],
  2,   // requiredApprovals
  120  // delayPeriod (seconds)
);

// Propose payment
await timelock.proposePayment("0xRecipient", ethers.parseEther("1.0"));

// Member 1 approves
await timelock.approvePayment(0);

// Member 2 approves (quorum reached → timelock starts)
await timelock.connect(member2).approvePayment(0);

// Wait 120+ seconds...
await time.increase(121);

// Execute (anyone can call)
await timelock.executePayment(0);  // Payment released
```

## Core Functions

| Function | Access | Purpose |
|----------|--------|---------|
| `proposePayment(recipient, amount)` | Members | Create payment proposal |
| `approvePayment(txId)` | Members | Vote to approve (once per member) |
| `executePayment(txId)` | Anyone | Release funds after timelock expires |
| `getTimeRemaining(txId)` | Public | Check seconds until execution allowed |
| `getTransaction(txId)` | Public | Get transaction details |
| `getContractBalance()` | Public | View contract balance |
| `deposit()` | Anyone | Send ETH to contract |

## Architecture

```
┌─────────────────────────────────────────┐
│      TimelockPayment Contract           │
├─────────────────────────────────────────┤
│ State:                                  │
│  • members[] - Fixed at deployment      │
│  • requiredApprovals - Quorum threshold │
│  • delayPeriod - Timelock duration      │
│  • transactions[] - All proposals       │
│  • hasApproved[][] - Vote tracking      │
├─────────────────────────────────────────┤
│ State Machine:                          │
│  Propose → (collect approvals)          │
│         → TimelockStarted (quorum met)  │
│         → (wait delayPeriod)            │
│         → Execute → paymentReleased     │
└─────────────────────────────────────────┘
```

## Execution Flow

```
1. Member calls proposePayment()
   └─ Creates Transaction{recipient, amount, approvalCount: 0}
   └─ Emits PaymentProposed

2. Members call approvePayment()
   └─ Increments approvalCount
   └─ Sets hasApproved[txId][member] = true
   └─ Emits PaymentApproved

3. Quorum reached (approvalCount == requiredApprovals)
   └─ Sets approvalTime = block.timestamp
   └─ Emits TimelockStarted ← TIMELOCK BEGINS

4. Wait delayPeriod seconds...
   └─ block.timestamp >= approvalTime + delayPeriod

5. Anyone calls executePayment()
   └─ Checks timelock has expired 
   └─ Sets executed = true (re-entrancy guard)
   └─ Transfers ETH to recipient
   └─ Emits paymentReleased 
```

## Timelock Enforcement

The heart of the contract — atomic timelock check:

```solidity
require(
    block.timestamp >= txn.approvalTime + delayPeriod,
    "Timelock period not yet expired"
);
```

**Key properties**:
- Uses immutable `block.timestamp` (can't be manipulated)
- Checked at execution entry (atomic)
- Cannot be bypassed by calling multiple times
- Clear revert if premature

## Security Analysis

| Feature | Implementation | Test Coverage |
|---------|-----------------|---|
| **Timelock** | `block.timestamp >= approvalTime + delayPeriod` | Tested |
| **Double-vote prevention** | `hasApproved[txId][member]` mapping | Tested |
| **Re-entrancy protection** | `executed = true` before transfer | Tested |
| **Access control** | `onlyMember` modifier | Tested |
| **Input validation** | Zero-address, amount, balance checks | Tested |

## Test Coverage

**File**: `test/TimelockPayment.test.js`  
**Total**: 24 tests, 100% pass rate

### Test Breakdown

- **Deployment** (3 tests) — Contract initialization
- **Proposal** (5 tests) — Creating transactions
- **Approval** (5 tests) — Member voting
- **Execution** (6 tests) — Timelock enforcement ← **KEY**
- **Time Checks** (3 tests) — Remaining time queries
- **Deposits** (1 test) — ETH transfers
- **Members** (1 test) — Access control

### Key Test: Timelock Enforcement

```javascript
// Should reject execution before timelock expires
it("Should reject execution before timelock expires", async () => {
    await timelockPayment.approvePayment(0);
    await timelockPayment.connect(addr1).approvePayment(0);
    
    await expect(
        timelockPayment.executePayment(0)
    ).to.be.revertedWith("Timelock period not yet expired");
});

// Should allow execution after timelock expires
it("Should allow execution after timelock expires", async () => {
    await timelockPayment.approvePayment(0);
    await timelockPayment.connect(addr1).approvePayment(0);
    
    await time.increase(121);  // Wait > 120 seconds
    
    await expect(
        timelockPayment.executePayment(0)
    ).to.emit(timelockPayment, "PaymentReleased");
});
```

## Gas Costs

| Operation | Gas | Mainnet Cost* |
|-----------|-----|---------------|
| Deploy | ~583K | ~$35 |
| proposePayment | ~60K | ~$3.60 |
| approvePayment | ~45K | ~$2.70 |
| executePayment | ~52K | ~$3.12 |
| **Full cycle** | ~740K | ~$44.42 |

*at 20 gwei, ETH = $3000

**On L2 (Arbitrum/Optimism)**: 50-100x cheaper

## Deployment Instructions

Run tests and deploy locally:
```bash
npm test      # Run all tests
npm run node  # Start local Hardhat network (Terminal 1)
npm run deploy # Deploy to local network (Terminal 2)
```

For details on gas costs and state changes, see [timelock_guide.md](timelock_guide.md).

## Project Structure

```
timelock-payment/
├── contracts/
│   └── TimelockPayment.sol              # Main contract (NatSpec documented)
├── test/
│   └── TimelockPayment.test.js          # 24 test cases
├── scripts/
│   └── deploy.js                        # Deployment script
├── timelock_guide.md                    # Architecture documentation
├── hardhat.config.js                    # Hardhat config
├── package.json                         # Dependencies
└── README.md                            # This file
```

## Configuration

Edit `hardhat.config.js` to customize:

```javascript
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  // Add testnet RPC URLs here for deployment to Sepolia, Goerli, etc.
};
```

## Available Commands

```bash
npm test              # Run all 24 tests
npm run compile       # Compile contract
npm run node          # Start local Hardhat network
npm run deploy        # Deploy to local network
npm run node -- --fork <url>  # Fork mainnet for testing
```

## Documentation

- **[timelock_guide.md](timelock_guide.md)** — Full architecture & design
- **[contracts/TimelockPayment.sol](contracts/TimelockPayment.sol)** — Full source with NatSpec
- **[test/TimelockPayment.test.js](test/TimelockPayment.test.js)** — Test suite with 24 tests

## Customization

### Change Timelock Duration

Edit `scripts/deploy.js`:
```javascript
const delayPeriod = 3600;  // 1 hour instead of 120 seconds
```

### Change Multisig Threshold

Edit `scripts/deploy.js`:
```javascript
const requiredApprovals = 3;  // 3-of-5 instead of 2-of-3
const members = [...5 addresses...];
```

### Add More Test Accounts

Hardhat provides 20 pre-funded accounts. Access via:
```javascript
const [deployer, ...signers] = await ethers.getSigners();
```

## License

MIT - See LICENSE file

## References

- [Solidity Docs](https://docs.soliditylang.org/)
- [Hardhat Docs](https://hardhat.org/docs)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Ethereum Dev Docs](https://ethereum.org/en/developers/docs/)

## Contributing

For improvements, please:
1. Create a feature branch
2. Add tests for new functionality
3. Ensure all tests pass (`npm test`)
4. Submit a pull request

