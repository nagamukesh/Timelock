# Blockchain Lab Assignment - Problem #7: Timelock Payment Contract

- Hemang J Jamadagni (221CS129)
- Naga Mukesh (221CS132)
- Viren H K (221CS165)
- Prabhanjan Prabhu  (221CS234)

## Objective
Ensure that payments cannot be executed immediately even after approvals, enforcing a mandatory waiting period (timelock).

## Problem Statement & Requirements
This project implements a multi-signature smart contract with the following assignment requirements:
1. Members may propose and approve a payment transaction.
2. Once the required approvals are obtained, the contract must record a timelock period.
3. The payment can only be executed if: `currentTime ≥ approvalTime + delayPeriod`.
4. If execution is attempted before the delay period expires, the contract must reject the transaction.
5. Expected Output: The transaction executes successfully only after the delay period has passed, triggering a `PaymentReleased` event confirming the transfer.

## Technologies Used
* **Platform:** Ethereum
* **Language:** Solidity (^0.8.20)
* **Development Environment:** Remix IDE
* **Local Blockchain:** Geth (Go Ethereum) Developer Node

## Repository Structure
* `contracts/TimelockPayment.sol`: The main smart contract source code, fully documented using NatSpec formatting.
* `Report.pdf`: The final assignment report containing screenshots of the successful deployment, Geth logs, and Remix execution proofs.

---

## Setup & Execution Instructions

The project was built and tested using a minimal Arch Linux setup with a local Geth node and Remix IDE.

### 1. Start the Local Geth Node
Open your terminal and run the following command to start a local developer network that mines a block every second and accepts connections from Remix:
```bash
geth --dev --http --http.api eth,web3,personal,net --http.corsdomain "*" --http.vhosts "*" --dev.period 1
```

### 2. Compile in Remix IDE
1. Open https://remix.ethereum.org/.
2. Load `contracts/TimelockPayment.sol`
3. Compile using Solidity version 0.8.20.

### 3. Deploy the Contract
1. In the Deploy & Run Transactions tab, set the Environment to Dev - Geth Provider (or External HTTP Provider) and connect to http://127.0.0.1:8545.

2. Copy 3 pre-funded account addresses from the Remix dropdown to act as the multisig members.

3. Deploy the contract with the following parameters:

 - _members: ["0xAddress1", "0xAddress2", "0xAddress3"]

 - _requiredApprovals: 2

 - _delayPeriod: 120 (seconds)

 - Note: Send a small amount of ETH (e.g., 50000000000000000 wei) in the value field during deployment to fund the contract.

### 4. Testing the Timelock Workflow
1. Propose: Call `proposePayment(recipient, amount)` using a member account.

2. Approve: Switch accounts and call `approvePayment(txId)`. Repeat until the required approvals are met. This triggers the `TimelockStarted` event.

3. Enforcement Check (Rejection): Attempt to call `executePayment(txId)` immediately. The transaction will correctly revert with the error: "Timelock period not yet expired".

4. Successful Execution: Wait for the 120-second delay period to finish, then call `executePayment(txId)`. The transaction will succeed, transfer the ETH, and emit the `PaymentReleased` event.
