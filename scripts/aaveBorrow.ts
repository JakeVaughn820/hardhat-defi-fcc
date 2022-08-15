import { BigNumber } from "ethers"
import { ethers, getNamedAccounts, network } from "hardhat"
import { getWeth, AMOUNT } from "../scripts/getWeth"
import {
    ILendingPoolAddressesProvider,
    IERC20,
    ILendingPool,
    IPriceOracleGetter,
} from "../typechain-types"
import { networkConfig } from "../helper-hardhat-config"
import { Address } from "hardhat-deploy/dist/types"

async function main() {
    await getWeth()
    const { deployer } = await getNamedAccounts()

    // Lending Pool Address Provider: 0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5
    const lendingPool: ILendingPool = await getLendingPool(deployer)
    console.log(`lendingPool address ${lendingPool.address}`)

    // deposit!
    const wethTokenAddress: string = networkConfig[network.config!.chainId!].wethToken!
    // approve
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited!")
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)

    // Conversion Rate token / ETH
    const daiTokenAddress: string = networkConfig[network.config!.chainId!].daiToken!
    const daiPriceEth: BigNumber = await getOraclePriceETH(daiTokenAddress)
    const amountDaiToBorrow = availableBorrowsETH.div(daiPriceEth)
    console.log(`You can borrow ${amountDaiToBorrow} DAI`)
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())

    // Time to Borrow
    await borrowDai(
        networkConfig[network.config!.chainId!].daiToken!,
        lendingPool,
        amountDaiToBorrowWei.toString(),
        deployer
    )
    await getBorrowUserData(lendingPool, deployer)
    await repay(
        amountDaiToBorrowWei,
        networkConfig[network.config!.chainId!].daiToken!,
        lendingPool,
        deployer
    )
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(
    amount: BigNumber,
    daiAddress: string,
    lendingPool: ILendingPool,
    account: Address
) {
    await approveErc20(daiAddress, lendingPool.address, amount, account)
    const repayTx = await lendingPool.repay(daiAddress, amount, 1, account)
    await repayTx.wait(1)
    console.log("Repaid!")
}

async function borrowDai(
    daiAddress: string,
    lendingPool: ILendingPool,
    amountDaiToBorrow: string,
    account: Address
) {
    const borrowTx = await lendingPool.borrow(daiAddress, amountDaiToBorrow, 1, 0, account)
    await borrowTx.wait(1)
    console.log("You've borrowed!")
}

async function getOraclePriceETH(assetAddr: string) {
    const priceOracleGetter: IPriceOracleGetter = await ethers.getContractAt(
        "IPriceOracleGetter",
        networkConfig[network.config!.chainId!].daiEthPriceFeed!
    )
    return await priceOracleGetter.getAssetPrice(assetAddr)
}

async function getBorrowUserData(lendingPool: ILendingPool, account: Address) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } =
        await lendingPool.getUserAccountData(account)
    console.log(
        `You have ${ethers.utils.formatEther(totalCollateralETH.toString())} of ETH deposited.`
    )
    console.log(`You have ${ethers.utils.formatEther(totalDebtETH.toString())} of ETH in debt.`)
    console.log(
        `You can borrow ${ethers.utils.formatEther(availableBorrowsETH.toString())} worth of ETH.`
    )
    return { availableBorrowsETH, totalDebtETH }
}
async function getLendingPool(account: Address) {
    const lendingPoolAddressProvider: ILendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config!.chainId!].lendingPoolAddressesProvider!,
        account
    )

    const lendingPoolAddress = await lendingPoolAddressProvider.getLendingPool()
    const lendingPool: ILendingPool = await ethers.getContractAt(
        "ILendingPool",
        lendingPoolAddress,
        account
    )
    return lendingPool
}

async function approveErc20(
    contractAddress: string,
    spenderAddress: string,
    amountToSpend: BigNumber,
    account: Address
) {
    const erc20Token: IERC20 = await ethers.getContractAt("IERC20", contractAddress, account)
    const tx = await erc20Token.approve(spenderAddress, amountToSpend)
    await tx.wait(1)
    console.log("Approved!")
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error)
    process.exitCode = 1
})
