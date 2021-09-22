// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "./interfaces/IRewardTracker.sol";

contract RewardManager is Governable {
    function batchClaimForAccounts(
        IRewardTracker _rewardTracker,
        address[] memory _accounts,
        address _receiver
    ) external onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _rewardTracker.claimForAccount(_accounts[i], _receiver);
        }
    }
}
