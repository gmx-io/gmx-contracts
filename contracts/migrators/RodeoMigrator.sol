// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./BaseMigrator.sol";
import "./RodeoCaller.sol";

contract RodeoMigrator is BaseMigrator {

    address public immutable rodeoCaller;

    constructor(
        address _admin,
        address _stakedGmxTracker,
        address _bonusGmxTracker,
        address _feeGmxTracker,
        address _stakedGlpTracker,
        address _feeGlpTracker,
        address _gmxVester,
        address _glpVester,
        address _esGmx,
        address _bnGmx,
        address _rewardRouter,
        address _rodeoCaller
    ) public BaseMigrator(
        _admin,
        _stakedGmxTracker,
        _bonusGmxTracker,
        _feeGmxTracker,
        _stakedGlpTracker,
        _feeGlpTracker,
        _gmxVester,
        _glpVester,
        _esGmx,
        _bnGmx,
        _rewardRouter
    ) {
        rodeoCaller = _rodeoCaller;
    }

    function _makeExternalCall() internal override {
        RodeoCaller(rodeoCaller).completeMigration();
    }
}
