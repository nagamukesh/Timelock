// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TimelockPayment
 * @dev Multi-signature timelock payment contract for decentralized treasury management
 * @notice Combines multi-signature approval with mandatory timelock delay
 */
contract TimelockPayment {
    
    // ============ State Variables ============
    
    /// @dev List of authorized members who can propose and approve payments
    address[] public members;
    
    /// @dev Number of approvals required to initiate timelock
    uint256 public requiredApprovals;
    
    /// @dev Mandatory waiting period (in seconds) after quorum is reached
    uint256 public delayPeriod;
    
    /// @dev All payment proposals stored by transaction ID
    Transaction[] public transactions;
    
    /// @dev Nested mapping: hasApproved[txId][memberAddress] = bool
    mapping(uint256 => mapping(address => bool)) public hasApproved;
    
    // ============ Data Structures ============
    
    /// @dev Represents a single payment proposal
    struct Transaction {
        address recipient;      // Where the ETH goes
        uint256 amount;         // How much (in wei)
        uint256 approvalCount;  // Votes collected so far
        uint256 approvalTime;   // Timestamp when quorum was reached
        bool executed;          // Has the payment been executed?
    }
    
    // ============ Events ============
    
    /// @dev Emitted when a member proposes a new payment
    event PaymentProposed(
        uint256 indexed txId,
        address indexed proposer,
        address indexed recipient,
        uint256 amount
    );
    
    /// @dev Emitted when a member approves a payment
    event PaymentApproved(
        uint256 indexed txId,
        address indexed approver,
        uint256 approvalCount
    );
    
    /// @dev Emitted when required approvals threshold is crossed (timelock starts)
    event TimelockStarted(
        uint256 indexed txId,
        uint256 approvalTime,
        uint256 unlockTime
    );
    
    /// @dev Emitted when a payment is successfully executed
    event PaymentReleased(
        uint256 indexed txId,
        address indexed recipient,
        uint256 amount
    );
    
    // ============ Modifiers ============
    
    /// @dev Restricts function access to authorized members only
    modifier onlyMember() {
        require(isMember(msg.sender), "Not a member");
        _;
    }
    
    /// @dev Ensures transaction ID is valid
    modifier validTxId(uint256 _txId) {
        require(_txId < transactions.length, "Invalid transaction ID");
        _;
    }
    
    // ============ Constructor ============
    
    /// @dev Initialize contract with members, approval threshold, and delay period
    /// @param _members Array of member addresses (must be non-empty)
    /// @param _requiredApprovals Minimum approvals needed (should be <= _members.length)
    /// @param _delayPeriod Timelock delay in seconds
    constructor(
        address[] memory _members,
        uint256 _requiredApprovals,
        uint256 _delayPeriod
    ) payable {
        require(_members.length > 0, "Members array cannot be empty");
        require(
            _requiredApprovals > 0 && _requiredApprovals <= _members.length,
            "Invalid required approvals count"
        );
        
        members = _members;
        requiredApprovals = _requiredApprovals;
        delayPeriod = _delayPeriod;
    }
    
    // ============ Core Functions ============
    
    /// @dev Allows a member to propose a new payment
    /// @param _recipient Address that will receive the ETH
    /// @param _amount Amount of ETH to transfer (in wei)
    function proposePayment(address _recipient, uint256 _amount) 
        external 
        onlyMember 
    {
        require(_recipient != address(0), "Cannot send to zero address");
        require(_amount > 0, "Amount must be greater than zero");
        require(
            address(this).balance >= _amount,
            "Contract balance insufficient"
        );
        
        uint256 txId = transactions.length;
        
        transactions.push(
            Transaction({
                recipient: _recipient,
                amount: _amount,
                approvalCount: 0,
                approvalTime: 0,
                executed: false
            })
        );
        
        emit PaymentProposed(txId, msg.sender, _recipient, _amount);
    }
    
    /// @dev Allows a member to approve a payment proposal
    /// @param _txId ID of the transaction to approve
    function approvePayment(uint256 _txId) 
        external 
        onlyMember 
        validTxId(_txId) 
    {
        Transaction storage txn = transactions[_txId];
        
        require(!txn.executed, "Transaction already executed");
        require(!hasApproved[_txId][msg.sender], "Already approved this transaction");
        
        hasApproved[_txId][msg.sender] = true;
        txn.approvalCount++;
        
        emit PaymentApproved(_txId, msg.sender, txn.approvalCount);
        
        // If quorum reached, record the approval time (timelock starts)
        if (txn.approvalCount == requiredApprovals && txn.approvalTime == 0) {
            txn.approvalTime = block.timestamp;
            emit TimelockStarted(_txId, txn.approvalTime, txn.approvalTime + delayPeriod);
        }
    }
    
    /// @dev Anyone can execute a payment after timelock expires
    /// @param _txId ID of the transaction to execute
    function executePayment(uint256 _txId) 
        external 
        validTxId(_txId) 
    {
        Transaction storage txn = transactions[_txId];
        
        require(!txn.executed, "Transaction already executed");
        require(
            txn.approvalCount >= requiredApprovals,
            "Insufficient approvals"
        );
        require(
            block.timestamp >= txn.approvalTime + delayPeriod,
            "Timelock period not yet expired"
        );
        require(
            address(this).balance >= txn.amount,
            "Contract balance insufficient"
        );
        
        // Prevent re-entrancy: mark as executed before transferring
        txn.executed = true;
        
        // Transfer the ETH
        (bool success, ) = txn.recipient.call{value: txn.amount}("");
        require(success, "ETH transfer failed");
        
        emit PaymentReleased(_txId, txn.recipient, txn.amount);
    }
    
    // ============ View Functions ============
    
    /// @dev Get full details of a transaction
    /// @param _txId ID of the transaction
    /// @return Transaction struct with all details
    function getTransaction(uint256 _txId) 
        external 
        view 
        validTxId(_txId) 
        returns (Transaction memory) 
    {
        return transactions[_txId];
    }
    
    /// @dev Get seconds remaining until a payment can be executed
    /// @param _txId ID of the transaction
    /// @return Seconds remaining (0 if ready to execute)
    function getTimeRemaining(uint256 _txId) 
        external 
        view 
        validTxId(_txId) 
        returns (uint256) 
    {
        Transaction memory txn = transactions[_txId];
        
        // If timelock hasn't started, return max value or a large number
        if (txn.approvalTime == 0) {
            return type(uint256).max;
        }
        
        uint256 unlockTime = txn.approvalTime + delayPeriod;
        
        if (block.timestamp >= unlockTime) {
            return 0;
        }
        
        return unlockTime - block.timestamp;
    }
    
    /// @dev Get current ETH balance held by contract
    /// @return Balance in wei
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /// @dev Get total number of transactions (proposals)
    /// @return Total transaction count
    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }
    
    /// @dev Get list of all members
    /// @return Array of member addresses
    function getMembers() external view returns (address[] memory) {
        return members;
    }
    
    /// @dev Check if address is a member
    /// @param _address Address to check
    /// @return True if address is a member
    function isMember(address _address) public view returns (bool) {
        for (uint256 i = 0; i < members.length; i++) {
            if (members[i] == _address) {
                return true;
            }
        }
        return false;
    }
    
    // ============ Fallback Functions ============
    
    /// @dev Allow contract to receive ETH deposits
    receive() external payable {}
}
