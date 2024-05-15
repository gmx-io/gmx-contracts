// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../access/Governable.sol";
import "./interfaces/IRewardTracker.sol";

contract VesterCap is ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public gmxVester;
    address public stakedGmxTracker;
    address public feeGmxTracker;
    address public bnGmx;

    uint256 public maxBoostBasisPoints;

    constructor (
        address _gmxVester,
        address _stakedGmxTracker,
        address _feeGmxTracker,
        address _bnGmx,
        uint256 _maxBoostBasisPoints
    ) public {
        gmxVester = _gmxVester;
        stakedGmxTracker = _stakedGmxTracker;
        feeGmxTracker = _feeGmxTracker;
        bnGmx = _bnGmx;
        maxBoostBasisPoints = _maxBoostBasisPoints;
    }

    function unstakeBnGmx(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i; i < _accounts.length; i++) {
            _unstakeBnGmx(_accounts[i]);
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

    function _unstakeBnGmx(address _account) internal {
        uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
        uint256 maxAllowedBnGmxAmount = baseStakedAmount.mul(maxBoostBasisPoints).div(BASIS_POINTS_DIVISOR);
        uint256 currentBnGmxAmount = IRewardTracker(feeGmxTracker).depositBalances(_account, bnGmx);

        if (currentBnGmxAmount <= maxAllowedBnGmxAmount) {
            return;
        }

        uint256 amountToUnstake = currentBnGmxAmount.sub(maxAllowedBnGmxAmount);
        uint256 feeGmxTrackerBalance = IERC20(feeGmxTracker).balanceOf(_account);

        if (amountToUnstake > feeGmxTrackerBalance) {
            uint256 amountToUnvest = amountToUnstake.sub(feeGmxTrackerBalance);
            IERC20(feeGmxTracker).safeTransferFrom(gmxVester, _account, amountToUnvest);
        }

        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bnGmx, amountToUnstake, _account);
    }
}
