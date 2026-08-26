// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IVester.sol";
import "./interfaces/IRewardTracker.sol";
import "../access/Guardable.sol";

contract VesterCapZeroer is ReentrancyGuard, Guardable {
    using SafeMath for uint256;

    address public vester;
    address public rewardTracker;

    mapping (address => bool) public isKeeper;

    event CapZeroed(address account, uint256 deduction);

    constructor(address _vester) public {
        vester = _vester;
        rewardTracker = IVester(_vester).rewardTracker();
    }

    function setKeeper(address _keeper, bool _isActive) external onlyCapsAdmin {
        isKeeper[_keeper] = _isActive;
    }

    function zeroCaps(address[] calldata _accounts) external nonReentrant {
        require(isKeeper[msg.sender], "VesterCapZeroer: forbidden");
        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            if (IVester(vester).getMaxVestableAmount(account) == 0) { continue; }
            uint256 deduction = getPositiveTerms(account);
            IVester(vester).setCumulativeRewardDeductions(account, deduction);
            emit CapZeroed(account, deduction);
        }
    }

    function getPositiveTerms(address _account) public view returns (uint256) {
        // claimable() includes accrual not yet materialized into cumulativeRewards; counting it
        // over-deducts by the already-materialized part, which only adds margin to a permanent closure
        return IRewardTracker(rewardTracker).cumulativeRewards(_account)
            .add(IRewardTracker(rewardTracker).claimable(_account))
            .add(IVester(vester).transferredCumulativeRewards(_account))
            .add(IVester(vester).bonusRewards(_account));
    }

    function isZeroed(address _account) external view returns (bool) {
        return IVester(vester).getMaxVestableAmount(_account) == 0;
    }
}
