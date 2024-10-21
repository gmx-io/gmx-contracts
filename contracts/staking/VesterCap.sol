// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../access/Governable.sol";
import "./interfaces/IRewardTracker.sol";
import "./interfaces/IVester.sol";
import "../tokens/Token.sol";

contract VesterCap is ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public immutable gmxVester;
    address public immutable stakedGmxTracker;
    address public immutable bonusGmxTracker;
    address public immutable extendedGmxTracker;
    address public immutable feeGmxTracker;
    address public immutable bnGmx;
    address public immutable esGmx;

    uint256 public immutable maxBoostBasisPoints;
    uint256 public immutable bnGmxToEsGmxConversionDivisor;

    mapping (address => bool) public isUpdateCompleted;

    constructor (
        address _gmxVester,
        address _stakedGmxTracker,
        address _bonusGmxTracker,
        address _extendedGmxTracker,
        address _feeGmxTracker,
        address _bnGmx,
        address _esGmx,
        uint256 _maxBoostBasisPoints,
        uint256 _bnGmxToEsGmxConversionDivisor
    ) public {
        gmxVester = _gmxVester;
        stakedGmxTracker = _stakedGmxTracker;
        bonusGmxTracker = _bonusGmxTracker;
        extendedGmxTracker = _extendedGmxTracker;
        feeGmxTracker = _feeGmxTracker;
        bnGmx = _bnGmx;
        esGmx = _esGmx;

        maxBoostBasisPoints = _maxBoostBasisPoints;
        bnGmxToEsGmxConversionDivisor = _bnGmxToEsGmxConversionDivisor;
    }

    function updateBnGmxForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i; i < _accounts.length; i++) {
            _updateBnGmxForAccount(_accounts[i]);
        }
    }

    function syncFeeGmxTrackerBalance(address _account) external nonReentrant onlyGov {
        uint256 stakedAmount = IRewardTracker(feeGmxTracker).stakedAmounts(_account);
        uint256 feeGmxTrackerBalance = IERC20(feeGmxTracker).balanceOf(_account);

        if (feeGmxTrackerBalance <= stakedAmount) {
            return;
        }

        uint256 amountToTransfer = feeGmxTrackerBalance.sub(stakedAmount);
        IERC20(feeGmxTracker).safeTransferFrom(_account, gmxVester, amountToTransfer);
    }

    function _updateBnGmxForAccount(address _account) internal {
        if (isUpdateCompleted[_account]) {
            return;
        }

        isUpdateCompleted[_account] = true;

        uint256 stakedBnGmxAmount = IRewardTracker(extendedGmxTracker).depositBalances(_account, bnGmx);
        uint256 claimableBnGmxAmount = IRewardTracker(bonusGmxTracker).claimable(_account);
        uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_account);
        uint256 totalBnGmxAmount = stakedBnGmxAmount.add(claimableBnGmxAmount).add(bnGmxBalance);

        uint256 esGmxToMint = totalBnGmxAmount / bnGmxToEsGmxConversionDivisor;

        // mint esGMX to account and increase vestable esGMX amount
        if (esGmxToMint > 0) {
            Token(esGmx).mint(_account, esGmxToMint);
            uint256 bonusReward = IVester(gmxVester).bonusRewards(_account);
            IVester(gmxVester).setBonusRewards(_account, bonusReward.add(esGmxToMint));
        }

        uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
        uint256 maxAllowedBnGmxAmount = baseStakedAmount.mul(maxBoostBasisPoints).div(BASIS_POINTS_DIVISOR);

        if (stakedBnGmxAmount <= maxAllowedBnGmxAmount) {
            return;
        }

        uint256 amountToUnstake = stakedBnGmxAmount.sub(maxAllowedBnGmxAmount);
        uint256 feeGmxTrackerBalance = IERC20(feeGmxTracker).balanceOf(_account);

        // a user's feeGmxTracker tokens could be transferred to the gmxVester contract
        // if the amountToUnstake is greater than the feeGmxTrackerBalance then
        // feeGmxTracker.unstakeForAccount would revert as the reduction of the user's staked
        // amount would cause an underflow
        // to avoid this issue, transfer the required amount from the feeGmxTracker back to the
        // user's account
        if (amountToUnstake > feeGmxTrackerBalance) {
            uint256 amountToUnvest = amountToUnstake.sub(feeGmxTrackerBalance);
            IERC20(feeGmxTracker).safeTransferFrom(gmxVester, _account, amountToUnvest);
        }

        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, amountToUnstake, _account);
        IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bnGmx, amountToUnstake, _account);
    }
}
