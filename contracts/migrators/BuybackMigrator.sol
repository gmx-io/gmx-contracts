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

    address public rewardRouterTarget;
    
    bool public isEnabled;
    bool public isRestakingCompleted;

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
    ) public {
        admin = _admin;
        stakedGmxTracker = _stakedGmxTracker;
        bonusGmxTracker = _bonusGmxTracker;
        extendedGmxTracker = _extendedGmxTracker;
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
        require(rewardRouterTarget == address(0), "invalid rewardRouterTarget");
        
        address gov = Governable(stakedGmxTracker).gov();
        expectedGovGrantedCaller = gov;

        rewardRouterTarget = newRewardRouter;
        isEnabled = true;

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

    function disableOldRewardRouter() external onlyAdmin {
        require(rewardRouterTarget == address(0), "invalid rewardRouterTarget");
        
        address gov = Governable(stakedGmxTracker).gov();
        expectedGovGrantedCaller = gov;

        rewardRouterTarget = oldRewardRouter;
        isEnabled = false;

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

    function setHandlerAndDepositToken() external onlyAdmin {
        require(rewardRouterTarget == address(0), "invalid rewardRouterTarget");
        
        address gov = Governable(stakedGmxTracker).gov();
        expectedGovGrantedCaller = gov;

        isRestakingCompleted = true;

        address[] memory targets = new address[](3);
        
        targets[0] = bonusGmxTracker;
        targets[1] = bnGmx;
        targets[2] = feeGmxTracker;

        ITimelock(gov).requestGov(targets);
    }

    function afterGovGranted() external override {
        address mainGov = msg.sender;
        require(mainGov == expectedGovGrantedCaller, "forbidden");

        if (isRestakingCompleted) {
            IHandlerTarget(bonusGmxTracker).setHandler(feeGmxTracker, false);
            IHandlerTarget(bnGmx).setHandler(feeGmxTracker, false);
            IHandlerTarget(feeGmxTracker).setDepositToken(bonusGmxTracker, false);
            IHandlerTarget(feeGmxTracker).setDepositToken(bnGmx, false);
            
            Governable(bonusGmxTracker).setGov(mainGov);
            Governable(bnGmx).setGov(mainGov);
            Governable(feeGmxTracker).setGov(mainGov);

            delete isRestakingCompleted;
        }

        else {
            require(rewardRouterTarget != address(0), "invalid rewardRouterTarget");
            _toggleRewardRouter();

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

            delete rewardRouterTarget;
            delete isEnabled;
        }

        expectedGovGrantedCaller = address(0);
    }

    function _toggleRewardRouter() private {
        IHandlerTarget(stakedGmxTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(bonusGmxTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(extendedGmxTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(feeGmxTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(feeGlpTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(stakedGlpTracker).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(gmxVester).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(glpVester).setHandler(rewardRouterTarget, isEnabled);
        IHandlerTarget(esGmx).setHandler(rewardRouterTarget, isEnabled);
        IMintable(bnGmx).setMinter(rewardRouterTarget, isEnabled);
        
        if (isEnabled) {
            IHandlerTarget(bonusGmxTracker).setHandler(extendedGmxTracker, true);
            IHandlerTarget(bnGmx).setHandler(extendedGmxTracker, true);
            IHandlerTarget(extendedGmxTracker).setHandler(feeGmxTracker, true);
            IHandlerTarget(feeGmxTracker).setDepositToken(extendedGmxTracker, true);
        }
    }
}