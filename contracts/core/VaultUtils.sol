// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IVaultUtils.sol";

contract Vault is IVaultUtils {
    using SafeMath for uint256;

    IVault public vault;

    uint256 public constant FUNDING_RATE_PRECISION = 1000000;

    constructor(IVault _vault) public {
        vault = _vault;
    }

    function validateIncreasePosition(address /* _account */, address /* _collateralToken */, address /* _indexToken */, uint256 /* _sizeDelta */, bool /* _isLong */) external override {
        // no-op
    }

    function validateDecreasePosition(address /* _account */, address /* _collateralToken */, address /* _indexToken */, uint256 /* _collateralDelta */, uint256 /* _sizeDelta */, bool /* _isLong */, address /* _receiver */) external override {
        // no-op
    }

    function updateCumulativeFundingRate(address /* _collateralToken */, address /* _indexToken */) public override {
        // no-op
    }

    function getEntryFundingRate(address _collateralToken, address /* _indexToken */, bool /* _isLong */) public override view returns (uint256) {
        return vault.cumulativeFundingRates(_collateralToken);
    }

    function getFundingFee(address _collateralToken, address /* _indexToken */, bool /* _isLong */, uint256 _size, uint256 _entryFundingRate) public override view returns (uint256) {
        if (_size == 0) { return 0; }

        uint256 fundingRate = vault.cumulativeFundingRates(_collateralToken).sub(_entryFundingRate);
        if (fundingRate == 0) { return 0; }

        return _size.mul(fundingRate).div(FUNDING_RATE_PRECISION);
    }

    function getBuyUsdgFeeBasisPoints(address _token, uint256 _usdgAmount) public override view returns (uint256) {
        return getFeeBasisPoints(_token, _usdgAmount, vault.mintBurnFeeBasisPoints(), vault.taxBasisPoints(), true);
    }

    function getSellUsdgFeeBasisPoints(address _token, uint256 _usdgAmount) public override view returns (uint256) {
        return getFeeBasisPoints(_token, _usdgAmount, vault.mintBurnFeeBasisPoints(), vault.taxBasisPoints(), false);
    }

    function getSwapFeeBasisPoints(address _tokenIn, address _tokenOut, uint256 _usdgAmount) public override view returns (uint256) {
        bool isStableSwap = vault.stableTokens(_tokenIn) && vault.stableTokens(_tokenOut);
        uint256 baseBps = isStableSwap ? vault.stableSwapFeeBasisPoints() : vault.swapFeeBasisPoints();
        uint256 taxBps = isStableSwap ? vault.stableTaxBasisPoints() : vault.taxBasisPoints();
        uint256 feesBasisPoints0 = getFeeBasisPoints(_tokenIn, _usdgAmount, baseBps, taxBps, true);
        uint256 feesBasisPoints1 = getFeeBasisPoints(_tokenOut, _usdgAmount, baseBps, taxBps, false);
        // use the higher of the two fee basis points
        return feesBasisPoints0 > feesBasisPoints1 ? feesBasisPoints0 : feesBasisPoints1;
    }

    // cases to consider
    // 1. initialAmount is far from targetAmount, action increases balance slightly => high rebate
    // 2. initialAmount is far from targetAmount, action increases balance largely => high rebate
    // 3. initialAmount is close to targetAmount, action increases balance slightly => low rebate
    // 4. initialAmount is far from targetAmount, action reduces balance slightly => high tax
    // 5. initialAmount is far from targetAmount, action reduces balance largely => high tax
    // 6. initialAmount is close to targetAmount, action reduces balance largely => low tax
    // 7. initialAmount is above targetAmount, nextAmount is below targetAmount and vice versa
    // 8. a large swap should have similar fees as the same trade split into multiple smaller swaps
    function getFeeBasisPoints(address _token, uint256 _usdgDelta, uint256 _feeBasisPoints, uint256 _taxBasisPoints, bool _increment) public override view returns (uint256) {
        if (!vault.hasDynamicFees()) { return _feeBasisPoints; }

        uint256 initialAmount = vault.usdgAmounts(_token);
        uint256 nextAmount = initialAmount.add(_usdgDelta);
        if (!_increment) {
            nextAmount = _usdgDelta > initialAmount ? 0 : initialAmount.sub(_usdgDelta);
        }

        uint256 targetAmount = vault.getTargetUsdgAmount(_token);
        if (targetAmount == 0) { return _feeBasisPoints; }

        uint256 initialDiff = initialAmount > targetAmount ? initialAmount.sub(targetAmount) : targetAmount.sub(initialAmount);
        uint256 nextDiff = nextAmount > targetAmount ? nextAmount.sub(targetAmount) : targetAmount.sub(nextAmount);

        // action improves relative asset balance
        if (nextDiff < initialDiff) {
            uint256 rebateBps = _taxBasisPoints.mul(initialDiff).div(targetAmount);
            return rebateBps > _feeBasisPoints ? 0 : _feeBasisPoints.sub(rebateBps);
        }

        uint256 averageDiff = initialDiff.add(nextDiff).div(2);
        if (averageDiff > targetAmount) {
            averageDiff = targetAmount;
        }
        uint256 taxBps = _taxBasisPoints.mul(averageDiff).div(targetAmount);
        return _feeBasisPoints.add(taxBps);
    }

}
