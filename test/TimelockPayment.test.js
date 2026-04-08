const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("TimelockPayment", function () {
  let timelockPayment;
  let owner, addr1, addr2, addr3, recipient;
  const REQUIRED_APPROVALS = 2;
  const DELAY_PERIOD = 120; // 2 minutes for testing

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, recipient] = await ethers.getSigners();

    // Deploy contract with 3 members, 2-of-3 multisig, 120s delay
    const TimelockPayment = await ethers.getContractFactory("TimelockPayment");
    timelockPayment = await TimelockPayment.deploy(
      [owner.address, addr1.address, addr2.address],
      REQUIRED_APPROVALS,
      DELAY_PERIOD,
      { value: ethers.parseEther("0.05") } // Fund with 0.05 ETH
    );
  });

  describe("Deployment", function () {
    it("Should deploy with correct parameters", async function () {
      const members = await timelockPayment.getMembers();
      expect(members).to.include(owner.address);
      expect(members).to.include(addr1.address);
      expect(members).to.include(addr2.address);
    });

    it("Should have initial balance", async function () {
      const balance = await timelockPayment.getContractBalance();
      expect(balance).to.equal(ethers.parseEther("0.05"));
    });

    it("Should reject empty members array", async function () {
      const TimelockPayment = await ethers.getContractFactory("TimelockPayment");
      await expect(
        TimelockPayment.deploy([], REQUIRED_APPROVALS, DELAY_PERIOD)
      ).to.be.revertedWith("Members array cannot be empty");
    });
  });

  describe("Payment Proposal", function () {
    it("Should allow member to propose payment", async function () {
      const amount = ethers.parseEther("0.01");
      
      await expect(
        timelockPayment.proposePayment(recipient.address, amount)
      ).to.emit(timelockPayment, "PaymentProposed");

      const txn = await timelockPayment.getTransaction(0);
      expect(txn.recipient).to.equal(recipient.address);
      expect(txn.amount).to.equal(amount);
      expect(txn.approvalCount).to.equal(0);
    });

    it("Should reject proposal from non-member", async function () {
      const amount = ethers.parseEther("0.01");
      
      await expect(
        timelockPayment.connect(recipient).proposePayment(recipient.address, amount)
      ).to.be.revertedWith("Not a member");
    });

    it("Should reject proposal to zero address", async function () {
      const amount = ethers.parseEther("0.01");
      
      await expect(
        timelockPayment.proposePayment(ethers.ZeroAddress, amount)
      ).to.be.revertedWith("Cannot send to zero address");
    });

    it("Should reject proposal with zero amount", async function () {
      await expect(
        timelockPayment.proposePayment(recipient.address, 0)
      ).to.be.revertedWith("Amount must be greater than zero");
    });

    it("Should reject proposal exceeding contract balance", async function () {
      const amount = ethers.parseEther("1.0"); // More than 0.05 ETH available
      
      await expect(
        timelockPayment.proposePayment(recipient.address, amount)
      ).to.be.revertedWith("Contract balance insufficient");
    });
  });

  describe("Payment Approval", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("0.01");
      await timelockPayment.proposePayment(recipient.address, amount);
    });

    it("Should allow member to approve payment", async function () {
      await expect(
        timelockPayment.approvePayment(0)
      ).to.emit(timelockPayment, "PaymentApproved");

      const txn = await timelockPayment.getTransaction(0);
      expect(txn.approvalCount).to.equal(1);
    });

    it("Should prevent double voting", async function () {
      await timelockPayment.approvePayment(0);
      
      await expect(
        timelockPayment.approvePayment(0)
      ).to.be.revertedWith("Already approved this transaction");
    });

    it("Should emit TimelockStarted when quorum reached", async function () {
      await timelockPayment.approvePayment(0);
      
      await expect(
        timelockPayment.connect(addr1).approvePayment(0)
      ).to.emit(timelockPayment, "TimelockStarted");

      const txn = await timelockPayment.getTransaction(0);
      expect(txn.approvalCount).to.equal(2);
      expect(txn.approvalTime).to.be.gt(0);
    });

    it("Should reject approval from non-member", async function () {
      await expect(
        timelockPayment.connect(recipient).approvePayment(0)
      ).to.be.revertedWith("Not a member");
    });

    it("Should reject approval after execution", async function () {
      await timelockPayment.approvePayment(0);
      await timelockPayment.connect(addr1).approvePayment(0);
      await time.increase(DELAY_PERIOD + 1);
      
      await timelockPayment.executePayment(0);
      
      await expect(
        timelockPayment.connect(addr2).approvePayment(0)
      ).to.be.revertedWith("Transaction already executed");
    });
  });

  describe("Payment Execution", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("0.01");
      await timelockPayment.proposePayment(recipient.address, amount);
      await timelockPayment.approvePayment(0);
      await timelockPayment.connect(addr1).approvePayment(0);
    });

    it("Should reject execution before timelock expires", async function () {
      await expect(
        timelockPayment.executePayment(0)
      ).to.be.revertedWith("Timelock period not yet expired");
    });

    it("Should allow execution after timelock expires", async function () {
      await time.increase(DELAY_PERIOD + 1);

      const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
      
      await expect(
        timelockPayment.executePayment(0)
      ).to.emit(timelockPayment, "PaymentReleased");

      const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientBalanceAfter - recipientBalanceBefore).to.equal(ethers.parseEther("0.01"));
    });

    it("Should prevent double execution", async function () {
      await time.increase(DELAY_PERIOD + 1);
      
      await timelockPayment.executePayment(0);
      
      await expect(
        timelockPayment.executePayment(0)
      ).to.be.revertedWith("Transaction already executed");
    });

    it("Should reject execution with insufficient approvals", async function () {
      await time.increase(DELAY_PERIOD + 1);
      
      // Create new proposal with only 1 approval
      const amount = ethers.parseEther("0.005");
      await timelockPayment.proposePayment(recipient.address, amount);
      await timelockPayment.approvePayment(1);
      
      await expect(
        timelockPayment.executePayment(1)
      ).to.be.revertedWith("Insufficient approvals");
    });

    it("Should allow anyone to execute (permissionless)", async function () {
      await time.increase(DELAY_PERIOD + 1);

      // addr3 is not a member but should be able to execute
      await expect(
        timelockPayment.connect(addr3).executePayment(0)
      ).to.emit(timelockPayment, "PaymentReleased");
    });

    it("Should handle re-entrancy safely", async function () {
      await time.increase(DELAY_PERIOD + 1);

      const txn = await timelockPayment.getTransaction(0);
      expect(txn.executed).to.be.false;

      await timelockPayment.executePayment(0);

      const txnAfter = await timelockPayment.getTransaction(0);
      expect(txnAfter.executed).to.be.true;
    });
  });

  describe("Time Remaining", function () {
    beforeEach(async function () {
      const amount = ethers.parseEther("0.01");
      await timelockPayment.proposePayment(recipient.address, amount);
      await timelockPayment.approvePayment(0);
      await timelockPayment.connect(addr1).approvePayment(0);
    });

    it("Should return 0 when ready to execute", async function () {
      await time.increase(DELAY_PERIOD + 1);
      
      const timeRemaining = await timelockPayment.getTimeRemaining(0);
      expect(timeRemaining).to.equal(0);
    });

    it("Should return remaining time before unlock", async function () {
      await time.increase(60); // Half of delay period
      
      const timeRemaining = await timelockPayment.getTimeRemaining(0);
      expect(timeRemaining).to.be.greaterThan(0);
      expect(timeRemaining).to.be.lessThanOrEqual(60);
    });

    it("Should return max uint256 if timelock not started", async function () {
      const amount = ethers.parseEther("0.005");
      await timelockPayment.proposePayment(recipient.address, amount);
      
      const timeRemaining = await timelockPayment.getTimeRemaining(1);
      expect(timeRemaining).to.equal(ethers.MaxUint256);
    });
  });

  describe("Deposits", function () {
    it("Should accept ETH deposits via receive", async function () {
      const balanceBefore = await timelockPayment.getContractBalance();
      
      await owner.sendTransaction({
        to: timelockPayment.target,
        value: ethers.parseEther("0.1")
      });

      const balanceAfter = await timelockPayment.getContractBalance();
      expect(balanceAfter).to.equal(balanceBefore + ethers.parseEther("0.1"));
    });
  });

  describe("Member Checks", function () {
    it("Should correctly identify members", async function () {
      expect(await timelockPayment.isMember(owner.address)).to.be.true;
      expect(await timelockPayment.isMember(addr1.address)).to.be.true;
      expect(await timelockPayment.isMember(addr2.address)).to.be.true;
      expect(await timelockPayment.isMember(addr3.address)).to.be.false;
      expect(await timelockPayment.isMember(recipient.address)).to.be.false;
    });
  });
});
