// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../access/interfaces/IGovRequester.sol";

import "../peripherals/interfaces/ITimelock.sol";
import "../peripherals/interfaces/IHandlerTarget.sol";
import "../tokens/interfaces/IMintable.sol";

contract BuybackMigrator is IGovRequester {
    address public immutable admin;
    address public immutable stakedGmxTracker;
    address public immutable bonusGmxTracker;
    address public immutable extendedGmxTracker;
    address public immutable feeGmxTracker;
    address public immutable feeGlpTracker;
    address public immutable stakedGlpTracker;
    address public immutable gmxVester;
    address public immutable glpVester;
    address public immutable esGmx;
    address public immutable bnGmx;
    address public immutable oldRewardRouter;
    address public immutable newRewardRouter;

    address public expectedGovGrantedCaller;

    modifier onlyAdmin() {
        require(msg.sender == admin, "forbidden");
        _;
    }

    constructor(
        address _admin,
        address _stakedGmxTracker,
        address _bonusGmxTracker,
        address _extendedGmxTracker,
        address _feeGmxTracker,
        address _feeGlpTracker,
        address _stakedGlpTracker,
        address _gmxVester,
        address _glpVester,
        address _esGmx,
        address _bnGmx,
        address _oldRewardRouter,
        address _newRewardRouter
    ) public (
        
    ) {
        admin = _admin;
        stakedGmxTracker = _stakedGmxTracker;
        bonusGmxTracker _bonusGmxTracker;
        extendedGmxTracker _extendedGmxTracker;
        feeGmxTracker = _feeGmxTracker;
        feeGlpTracker = _feeGlpTracker;
        stakedGlpTracker = _stakedGlpTracker;
        gmxVester = _gmxVester;
        glpVester = _glpVester;
        esGmx = _esGmx;
        bnGmx = _bnGmx;
        oldRewardRouter = _oldRewardRouter;
        newRewardRouter = _newRewardRouter;
    }

    function enableNewRewardRouter() external onlyAdmin {
        address gov = Governable(stakedGmxTracker).gov();
        expectedGovGrantedCaller = gov;

        address[] memory targets = new address[](10);
        targets[0] = stakedGmxTracker;
        targets[1] = bonusGmxTracker;
        targets[2] = extendedGmxTracker;
        targets[3] = feeGmxTracker;
        targets[4] = feeGlpTracker;
        targets[5] = stakedGlpTracker;
        targets[6] = gmxVester;
        targets[7] = glpVester;
        targets[8] = esGmx;
        targets[9] = bnGmx;

        ITimelock(gov).requestGov(targets);
    }

    function afterGovGranted() external override {
        require(msg.sender == expectedGovGrantedCaller, "forbidden");

        _toggleRewardRouter(oldRewardRouter, false);

        _toggleRewardRouter(newRewardRouter, true);

        address mainGov = msg.sender;

        Governable(stakedGmxTracker).setGov(mainGov);
        Governable(bonusGmxTracker).setGov(mainGov);
        Governable(extendedGmxTracker).setGov(mainGov);
        Governable(feeGmxTracker).setGov(mainGov);
        Governable(feeGlpTracker).setGov(mainGov);
        Governable(stakedGlpTracker).setGov(mainGov);
        Governable(gmxVester).setGov(mainGov);
        Governable(glpVester).setGov(mainGov);
        Governable(esGmx).setGov(mainGov);
        Governable(bnGmx).setGov(mainGov);

        expectedGovGrantedCaller = address(0);
    }

    function _toggleRewardRouter(address rewardRouter, bool isEnabled) internal {
        IHandlerTarget(stakedGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(bonusGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(extendedGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(feeGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(feeGlpTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(stakedGlpTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(gmxVester).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(glpVester).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(esGmx).setHandler(rewardRouter, isEnabled);
        IMintable(bnGmx).setMinter(rewardRouter, isEnabled);
    }
}
