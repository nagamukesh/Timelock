const hre = require("hardhat");

async function main() {
  console.log("Deploying TimelockPayment contract...\n");

  // Get signers
  const [deployer, addr1, addr2] = await ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);

  // Contract parameters
  const members = [deployer.address, addr1.address, addr2.address];
  const requiredApprovals = 2;
  const delayPeriod = 120; // 2 minutes for testing, adjust for production

  console.log("\nDeployment parameters:");
  console.log("- Members:", members);
  console.log("- Required Approvals:", requiredApprovals);
  console.log("- Delay Period:", delayPeriod, "seconds");

  // Deploy
  const TimelockPayment = await ethers.getContractFactory("TimelockPayment");
  const timelockPayment = await TimelockPayment.deploy(
    members,
    requiredApprovals,
    delayPeriod,
    { 
      value: ethers.parseEther("1.0") // Fund with 1 ETH for testing
    }
  );

  await timelockPayment.waitForDeployment();

  console.log("\nTimelockPayment deployed to:", timelockPayment.target);
  console.log("Initial contract balance:", ethers.formatEther(await timelockPayment.getContractBalance()), "ETH");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
