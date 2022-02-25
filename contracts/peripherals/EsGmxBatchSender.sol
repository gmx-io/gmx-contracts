// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/token/IERC20.sol";
import "../libraries/math/SafeMath.sol";

import "../staking/interfaces/IVester.sol";

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
        address[] memory _accounts,
        uint256[] memory _amounts,
        uint256[] memory _stakeAmounts
    ) external onlyAdmin {
        IERC20 token  = IERC20(esGmx);

        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            uint256 amount = _amounts[i];
            uint256 stakeAmount = _stakeAmounts[i];

            token.transferFrom(msg.sender, account, amount);

            uint256 transferredCumulativeRewards = _vester.transferredCumulativeRewards(account);
            uint256 totalTransferredCumulativeRewards = transferredCumulativeRewards.add(amount);

            uint256 transferredAverageStakedAmount = _vester.transferredAverageStakedAmounts(account);
            uint256 nextTransferredAverageStakedAmount = transferredAverageStakedAmount.mul(transferredCumulativeRewards).div(totalTransferredCumulativeRewards);
            nextTransferredAverageStakedAmount = nextTransferredAverageStakedAmount.add(
                stakeAmount.mul(amount).div(totalTransferredCumulativeRewards)
            );

            _vester.setTransferredCumulativeRewards(account, totalTransferredCumulativeRewards);

            _vester.setTransferredAverageStakedAmounts(account, nextTransferredAverageStakedAmount);
        }
    }
}
