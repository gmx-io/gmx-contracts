// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../access/interfaces/IGovRequester.sol";

import "../peripherals/interfaces/ITimelock.sol";
import "../peripherals/interfaces/IHandlerTarget.sol";
import "../tokens/interfaces/IMintable.sol";

contract BaseMigrator is IGovRequester {
    address public immutable admin;
    address public immutable stakedGmxTracker;
    address public immutable bonusGmxTracker;
    address public immutable feeGmxTracker;
    address public immutable stakedGlpTracker;
    address public immutable feeGlpTracker;
    address public immutable gmxVester;
    address public immutable glpVester;
    address public immutable esGmx;
    address public immutable bnGmx;
    address public immutable rewardRouter;

    address public expectedGovGrantedCaller;

    modifier onlyAdmin() {
        require(msg.sender == admin, "forbidden");
        _;
    }

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
        address _rewardRouter
    ) public {
        admin = _admin;

        stakedGmxTracker = _stakedGmxTracker;
        bonusGmxTracker = _bonusGmxTracker;
        feeGmxTracker = _feeGmxTracker;
        stakedGlpTracker = _stakedGlpTracker;
        feeGlpTracker = _feeGlpTracker;
        gmxVester = _gmxVester;
        glpVester = _glpVester;
        esGmx = _esGmx;
        bnGmx = _bnGmx;

        rewardRouter = _rewardRouter;
    }

    function migrate() external onlyAdmin {
        address gov = Governable(stakedGmxTracker).gov();
        expectedGovGrantedCaller = gov;

        address[] memory targets = new address[](9);
        targets[0] = stakedGmxTracker;
        targets[1] = bonusGmxTracker;
        targets[2] = feeGmxTracker;
        targets[3] = stakedGlpTracker;
        targets[4] = feeGlpTracker;
        targets[5] = gmxVester;
        targets[6] = glpVester;
        targets[7] = esGmx;
        targets[8] = bnGmx;

        ITimelock(gov).requestGov(targets);
    }

    function afterGovGranted() external override {
        require(msg.sender == expectedGovGrantedCaller, "forbidden");

        _toggleRewardRouter(true);

        _makeExternalCall();

        _toggleRewardRouter(false);

        address mainGov = msg.sender;

        Governable(stakedGmxTracker).setGov(mainGov);
        Governable(bonusGmxTracker).setGov(mainGov);
        Governable(feeGmxTracker).setGov(mainGov);
        Governable(stakedGlpTracker).setGov(mainGov);
        Governable(feeGlpTracker).setGov(mainGov);
        Governable(gmxVester).setGov(mainGov);
        Governable(glpVester).setGov(mainGov);
        Governable(esGmx).setGov(mainGov);
        Governable(bnGmx).setGov(mainGov);

        expectedGovGrantedCaller = address(0);
    }

    function _makeExternalCall() internal virtual {}

    function _toggleRewardRouter(bool isEnabled) internal {
        IHandlerTarget(stakedGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(bonusGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(feeGmxTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(stakedGlpTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(feeGlpTracker).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(gmxVester).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(glpVester).setHandler(rewardRouter, isEnabled);
        IHandlerTarget(esGmx).setHandler(rewardRouter, isEnabled);
        IMintable(bnGmx).setMinter(rewardRouter, isEnabled);
    }
}
