// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/token/IERC20.sol"; 

import "./interfaces/IExternalHandler.sol";
import "./interfaces/IRewardTracker.sol";
import "./interfaces/IVester.sol";

library RewardRouterUtils {
    function makeExternalCalls(
        address _externalHandler,
        address _target0,
        address _target1,
        bytes calldata _data0,
        bytes calldata _data1,
        address _refundToken0,
        address _refundToken1,
        address _refundReceiver0,
        address _refundReceiver1
    ) public {
        uint256 arrayLength = (_target1 == address(0)) ? 1 : 2;

        address[] memory targets = new address[](arrayLength);
        bytes[] memory data = new bytes[](arrayLength);
        address[] memory refundTokens = new address[](arrayLength);
        address[] memory refundReceivers = new address[](arrayLength);

        targets[0] = _target0;
        data[0] = _data0;
        refundTokens[0] = _refundToken0;
        refundReceivers[0] = _refundReceiver0;

        if (arrayLength == 2) {
            targets[1] = _target1;
            data[1] = _data1;
            refundTokens[1] = _refundToken1;
            refundReceivers[1] = _refundReceiver1;
        }

        IExternalHandler(_externalHandler).makeExternalCalls(targets, data, refundTokens, refundReceivers);
    }
    
    function validateReceiver(
        address _receiver,
        address _stakedGmxTracker,
        address _bonusGmxTracker,
        address _extendedGmxTracker,
        address _feeGmxTracker,
        address _gmxVester,
        address _stakedGlpTracker,
        address _feeGlpTracker,
        address _glpVester
    ) public view {
        require(IRewardTracker(_stakedGmxTracker).averageStakedAmounts(_receiver) == 0, "stakedGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_stakedGmxTracker).cumulativeRewards(_receiver) == 0, "stakedGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(_bonusGmxTracker).averageStakedAmounts(_receiver) == 0, "bonusGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_bonusGmxTracker).cumulativeRewards(_receiver) == 0, "bonusGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(_extendedGmxTracker).averageStakedAmounts(_receiver) == 0, "extendedGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_extendedGmxTracker).cumulativeRewards(_receiver) == 0, "extendedGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(_feeGmxTracker).averageStakedAmounts(_receiver) == 0, "feeGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_feeGmxTracker).cumulativeRewards(_receiver) == 0, "feeGmxTracker.cumulativeRewards > 0");

        require(IVester(_gmxVester).transferredAverageStakedAmounts(_receiver) == 0, "gmxVester.transferredAverageStakedAmounts > 0");
        require(IVester(_gmxVester).transferredCumulativeRewards(_receiver) == 0, "gmxVester.transferredCumulativeRewards > 0");

        require(IRewardTracker(_stakedGlpTracker).averageStakedAmounts(_receiver) == 0, "stakedGlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_stakedGlpTracker).cumulativeRewards(_receiver) == 0, "stakedGlpTracker.cumulativeRewards > 0");

        require(IRewardTracker(_feeGlpTracker).averageStakedAmounts(_receiver) == 0, "feeGlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(_feeGlpTracker).cumulativeRewards(_receiver) == 0, "feeGlpTracker.cumulativeRewards > 0");

        require(IVester(_glpVester).transferredAverageStakedAmounts(_receiver) == 0, "gmxVester.transferredAverageStakedAmounts > 0");
        require(IVester(_glpVester).transferredCumulativeRewards(_receiver) == 0, "gmxVester.transferredCumulativeRewards > 0");

        require(IERC20(_gmxVester).balanceOf(_receiver) == 0, "gmxVester.balance > 0");
        require(IERC20(_glpVester).balanceOf(_receiver) == 0, "glpVester.balance > 0");
    }
}