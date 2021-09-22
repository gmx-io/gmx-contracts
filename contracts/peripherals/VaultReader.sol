// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../core/interfaces/IVault.sol";

contract VaultReader {
    IVault public vault;

    constructor(IVault _vault) public {
        vault = _vault;
    }

    function isInitialized() external view returns (bool) {
        return vault.isInitialized();
    }
    function isSwapEnabled() external view returns (bool) {
        return vault.isSwapEnabled();
    }
    function isLeverageEnabled() external view returns (bool) {
        return vault.isLeverageEnabled();
    }

    function router() external view returns (address) {
        return vault.router();
    }
    function usdg() external view returns (address) {
        return vault.usdg();
    }
    function gov() external view returns (address) {
        return vault.gov();
    }

    function whitelistedTokenCount() external view returns (uint256) {
        return vault.whitelistedTokenCount();
    }
    function maxLeverage() external view returns (uint256) {
        return vault.maxLeverage();
    }

    function minProfitTime() external view returns (uint256) {
        return vault.minProfitTime();
    }
    function hasDynamicFees() external view returns (bool) {
        return vault.hasDynamicFees();
    }
    function fundingInterval() external view returns (uint256) {
        return vault.fundingInterval();
    }
    function totalTokenWeights() external view returns (uint256) {
        return vault.totalTokenWeights();
    }

    function inManagerMode() external view returns (bool) {
        return vault.inManagerMode();
    }
    function inPrivateLiquidationMode() external view returns (bool) {
        return vault.inPrivateLiquidationMode();
    }

    function maxGasPrice() external view returns (uint256) {
        return vault.maxGasPrice();
    }

    function approvedRouters(address _account, address _router) external view returns (bool) {
        return vault.approvedRouters(_account, _router);
    }
    function isLiquidator(address _account) external view returns (bool) {
        return vault.isLiquidator(_account);
    }
    function isManager(address _account) external view returns (bool) {
        return vault.isManager(_account);
    }

    function minProfitBasisPoints(address _token) external view returns (uint256) {
        return vault.minProfitBasisPoints(_token);
    }
    function tokenBalances(address _token) external view returns (uint256) {
        return vault.tokenBalances(_token);
    }
    function lastFundingTimes(address _token) external view returns (uint256) {
        return vault.lastFundingTimes(_token);
    }

    function priceFeed() external view returns (address) {
        return vault.priceFeed();
    }
    function fundingRateFactor() external view returns (uint256) {
        return vault.fundingRateFactor();
    }

    function stableFundingRateFactor() external view returns (uint256) {
        return vault.stableFundingRateFactor();
    }
    function cumulativeFundingRates(address _token) external view returns (uint256) {
        return vault.cumulativeFundingRates(_token);
    }
    function getFeeBasisPoints(address _token, uint256 _usdgDelta, uint256 _feeBasisPoints, uint256 _taxBasisPoints, bool _increment) external view returns (uint256) {
        return vault.getFeeBasisPoints(_token, _usdgDelta, _feeBasisPoints, _taxBasisPoints, _increment);
    }

    function liquidationFeeUsd() external view returns (uint256) {
        return vault.liquidationFeeUsd();
    }
    function taxBasisPoints() external view returns (uint256) {
        return vault.taxBasisPoints();
    }
    function stableTaxBasisPoints() external view returns (uint256) {
        return vault.stableTaxBasisPoints();
    }
    function mintBurnFeeBasisPoints() external view returns (uint256) {
        return vault.mintBurnFeeBasisPoints();
    }
    function swapFeeBasisPoints() external view returns (uint256) {
        return vault.swapFeeBasisPoints();
    }
    function stableSwapFeeBasisPoints() external view returns (uint256) {
        return vault.stableSwapFeeBasisPoints();
    }
    function marginFeeBasisPoints() external view returns (uint256) {
        return vault.marginFeeBasisPoints();
    }

    function allWhitelistedTokensLength() external view returns (uint256) {
        return vault.allWhitelistedTokensLength();
    }
    function allWhitelistedTokens(uint256 _index) external view returns (address) {
        return vault.allWhitelistedTokens(_index);
    }
    function whitelistedTokens(address _token) external view returns (bool) {
        return vault.whitelistedTokens(_token);
    }
    function stableTokens(address _token) external view returns (bool) {
        return vault.stableTokens(_token);
    }
    function shortableTokens(address _token) external view returns (bool) {
        return vault.shortableTokens(_token);
    }
    function feeReserves(address _token) external view returns (uint256) {
        return vault.feeReserves(_token);
    }
    function globalShortSizes(address _token) external view returns (uint256) {
        return vault.globalShortSizes(_token);
    }
    function globalShortAveragePrices(address _token) external view returns (uint256) {
        return vault.globalShortAveragePrices(_token);
    }
    function tokenDecimals(address _token) external view returns (uint256) {
        return vault.tokenDecimals(_token);
    }
    function tokenWeights(address _token) external view returns (uint256) {
        return vault.tokenWeights(_token);
    }
    function guaranteedUsd(address _token) external view returns (uint256) {
        return vault.guaranteedUsd(_token);
    }
    function poolAmounts(address _token) external view returns (uint256) {
        return vault.poolAmounts(_token);
    }
    function bufferAmounts(address _token) external view returns (uint256) {
        return vault.bufferAmounts(_token);
    }
    function reservedAmounts(address _token) external view returns (uint256) {
        return vault.reservedAmounts(_token);
    }
    function usdgAmounts(address _token) external view returns (uint256) {
        return vault.usdgAmounts(_token);
    }
    function maxUsdgAmounts(address _token) external view returns (uint256) {
        return vault.maxUsdgAmounts(_token);
    }
    function getMaxPrice(address _token) external view returns (uint256) {
        return vault.getMaxPrice(_token);
    }
    function getMinPrice(address _token) external view returns (uint256) {
        return vault.getMinPrice(_token);
    }
}
