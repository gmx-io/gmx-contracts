// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/token/IERC20.sol";
import "../libraries/math/SafeMath.sol";

import "../staking/interfaces/IVester.sol";
import "../staking/interfaces/IRewardTracker.sol";

contract EsGmxBatchSender {
    using SafeMath for uint256;

    address public admin;
    address public esGmx;

    constructor(address _esGmx) public {
        admin = msg.sender;
        esGmx = _esGmx;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "EsGmxBatchSender: forbidden");
        _;
    }

    function send(
        IVester _vester,
        uint256 _minRatio,
        address[] memory _accounts,
        uint256[] memory _amounts
    ) external onlyAdmin {
        IERC20 token  = IERC20(esGmx);
        IRewardTracker rewardTracker = IRewardTracker(_vester.rewardTracker());

        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            uint256 amount = _amounts[i];

            token.transferFrom(msg.sender, account, amount);

            uint256 transferredCumulativeReward = _vester.transferredCumulativeRewards(account);
            uint256 nextTransferrredCumulativeReward = transferredCumulativeReward.add(amount);
            _vester.setTransferredCumulativeRewards(account, nextTransferrredCumulativeReward);

            uint256 cumulativeReward = rewardTracker.cumulativeRewards(account);
            uint256 totalCumulativeReward = cumulativeReward.add(nextTransferrredCumulativeReward);

            uint256 combinedAverageStakedAmount = _vester.getCombinedAverageStakedAmount(account);

            if (combinedAverageStakedAmount > totalCumulativeReward.mul(_minRatio)) {
                continue;
            }

            uint256 nextTransferredAverageStakedAmount = _minRatio.mul(totalCumulativeReward);
            nextTransferredAverageStakedAmount = nextTransferredAverageStakedAmount.sub(
                rewardTracker.averageStakedAmounts(account).mul(cumulativeReward).div(totalCumulativeReward)
            );

            nextTransferredAverageStakedAmount = nextTransferredAverageStakedAmount.mul(totalCumulativeReward).div(nextTransferrredCumulativeReward);

            _vester.setTransferredAverageStakedAmounts(account, nextTransferredAverageStakedAmount);
        }
    }
}
