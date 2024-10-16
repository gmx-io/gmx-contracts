// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";

import "./interfaces/IExternalHandler.sol";
import "./interfaces/IRewardTracker.sol";
import "./interfaces/IRewardRouterV2.sol";
import "./interfaces/IVester.sol";
import "../tokens/interfaces/IMintable.sol";
import "../tokens/interfaces/IWETH.sol";
import "../core/interfaces/IGlpManager.sol";
import "../access/Governable.sol";

contract RewardRouterV2 is IRewardRouterV2, ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    enum VotingPowerType {
        None,
        BaseStakedAmount,
        BaseAndBonusStakedAmount
    }

    struct InitializeParams {
        address weth;
        address gmx;
        address esGmx;
        address bnGmx;
        address glp;
        address stakedGmxTracker;
        address bonusGmxTracker;
        address extendedGmxTracker;
        address feeGmxTracker;
        address feeGlpTracker;
        address stakedGlpTracker;
        address glpManager;
        address gmxVester;
        address glpVester;
        address externalHandler;
        address govToken;
    }

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    bool public isInitialized;

    address public weth;

    address public gmx;
    address public esGmx;
    address public bnGmx;

    address public glp; // GMX Liquidity Provider token

    address public stakedGmxTracker;
    address public bonusGmxTracker;
    address public extendedGmxTracker;
    address public feeGmxTracker;

    address public override stakedGlpTracker;
    address public override feeGlpTracker;

    address public glpManager;

    address public gmxVester;
    address public glpVester;

    address public externalHandler;

    uint256 public maxBoostBasisPoints;
    bool public inStrictTransferMode;

    address public govToken;
    VotingPowerType public votingPowerType;

    bool public inRestakingMode;

    mapping (address => address) public pendingReceivers;

    event StakeGmx(address account, address token, uint256 amount);
    event UnstakeGmx(address account, address token, uint256 amount);

    event StakeGlp(address account, uint256 amount);
    event UnstakeGlp(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(InitializeParams memory _initializeParams) external onlyGov {
        require(!isInitialized, "already initialized");
        isInitialized = true;

        weth = _initializeParams.weth;

        gmx = _initializeParams.gmx;
        esGmx = _initializeParams.esGmx;
        bnGmx = _initializeParams.bnGmx;

        glp = _initializeParams.glp;

        stakedGmxTracker = _initializeParams.stakedGmxTracker;
        bonusGmxTracker = _initializeParams.bonusGmxTracker;
        extendedGmxTracker = _initializeParams.extendedGmxTracker;
        feeGmxTracker = _initializeParams.feeGmxTracker;

        feeGlpTracker = _initializeParams.feeGlpTracker;
        stakedGlpTracker = _initializeParams.stakedGlpTracker;

        glpManager = _initializeParams.glpManager;

        gmxVester = _initializeParams.gmxVester;
        glpVester = _initializeParams.glpVester;

        externalHandler = _initializeParams.externalHandler;

        govToken = _initializeParams.govToken;
    }

    function setGovToken(address _govToken) external onlyGov {
        govToken = _govToken;
    }

    function setInStrictTransferMode(bool _inStrictTransferMode) external onlyGov {
        inStrictTransferMode = _inStrictTransferMode;
    }

    function setMaxBoostBasisPoints(uint256 _maxBoostBasisPoints) external onlyGov {
        maxBoostBasisPoints = _maxBoostBasisPoints;
    }

    function setVotingPowerType(VotingPowerType _votingPowerType) external onlyGov {
        votingPowerType = _votingPowerType;
    }

    function setInRestakingMode(bool _inRestakingMode) external onlyGov {
        inRestakingMode = _inRestakingMode;
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function batchStakeGmxForAccounts(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
        address _gmx = gmx;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeGmx(msg.sender, _accounts[i], _gmx, _amounts[i]);
        }
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    function batchRestakeForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _restakeForAccount(_accounts[i]);
        }
    }

    function multicall(bytes[] memory data) external returns (bytes[] memory results) {
        results = new bytes[](data.length);

        for (uint256 i; i < data.length; i++) {
            (bool success, bytes memory result) = address(this).delegatecall(data[i]);
            
            require(success, "call failed");

            results[i] = result;
        }

        return results;
    }

    function makeExternalCalls(
        address[] memory externalCallTargets,
        bytes[] memory externalCallDataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external nonReentrant {
        IExternalHandler(externalHandler).makeExternalCalls(
            externalCallTargets,
            externalCallDataList,
            refundTokens,
            refundReceivers
        );
    }

    function stakeGmx(uint256 _amount) external nonReentrant {
        _stakeGmx(msg.sender, msg.sender, gmx, _amount);
    }

    function stakeEsGmx(uint256 _amount) external nonReentrant {
        _stakeGmx(msg.sender, msg.sender, esGmx, _amount);
    }

    function unstakeGmx(uint256 _amount) external nonReentrant {
        _restakeForAccount(msg.sender);
        
        _unstakeGmx(msg.sender, gmx, _amount, true);
    }

    function unstakeEsGmx(uint256 _amount) external nonReentrant {
        _restakeForAccount(msg.sender);
        
        _unstakeGmx(msg.sender, esGmx, _amount, true);
    }

    function mintAndStakeGlp(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external nonReentrant returns (uint256) {
        _validateAmount(_amount);

        uint256 glpAmount = _mintAndStakeGlp(msg.sender, _token, _amount, _minUsdg, _minGlp);

        emit StakeGlp(msg.sender, glpAmount);

        return glpAmount;
    }

    function mintAndStakeGlpETH(uint256 _minUsdg, uint256 _minGlp) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "invalid msg.value");

        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).approve(glpManager, msg.value);

        uint256 glpAmount = _mintAndStakeGlp(address(this), weth, msg.value, _minUsdg, _minGlp);

        emit StakeGlp(msg.sender, glpAmount);

        return glpAmount;
    }

    function unstakeAndRedeemGlp(address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) external nonReentrant returns (uint256) {
        uint256 amountOut = _unstakeAndRedeemGlp(_tokenOut, _glpAmount, _minOut, _receiver);

        emit UnstakeGlp(msg.sender, _glpAmount);

        return amountOut;
    }

    function unstakeAndRedeemGlpETH(uint256 _glpAmount, uint256 _minOut, address payable _receiver) external nonReentrant returns (uint256) {
        uint256 amountOut = _unstakeAndRedeemGlp(weth, _glpAmount, _minOut, address(this));

        IWETH(weth).withdraw(amountOut);

        _receiver.sendValue(amountOut);

        emit UnstakeGlp(msg.sender, _glpAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        _claim(stakedGmxTracker, stakedGlpTracker, msg.sender, msg.sender);
        _claimGmxFees(msg.sender, msg.sender);
        _claim(feeGmxTracker, feeGlpTracker, msg.sender, msg.sender);
    }

    function claimEsGmx() external nonReentrant {
        _claim(stakedGmxTracker, stakedGlpTracker, msg.sender, msg.sender);
    }

    function claimFees() external nonReentrant {
        _claimGmxFees(msg.sender, msg.sender);
        _claim(feeGmxTracker, feeGlpTracker, msg.sender, msg.sender);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function handleRewards(
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        uint256 gmxAmount = 0;
        if (_shouldClaimGmx) {
            uint256 gmxAmount0 = _claimVestedGmx(account, account);
            uint256 gmxAmount1 = _claimGmxFees(account, account);
            gmxAmount = gmxAmount0.add(gmxAmount1);
        }

        if (_shouldStakeGmx && gmxAmount > 0) {
            _stakeGmx(account, account, gmx, gmxAmount);
        }

        uint256 esGmxAmount = 0;
        if (_shouldClaimEsGmx) {
            esGmxAmount = _claim(stakedGmxTracker, stakedGlpTracker, account, account);
        }

        if (_shouldStakeEsGmx && esGmxAmount > 0) {
            _stakeGmx(account, account, esGmx, esGmxAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            _restakeForAccount(account);
            
            _stakeBnGmx(account);
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 wethAmount = _claim(feeGmxTracker, feeGlpTracker, account, address(this));
                _convertWethToEth(wethAmount);
            } else {
                _claim(feeGmxTracker, feeGlpTracker, account, account);
            }
        }

        _syncVotingPower(account);
    }

    function handleRewardsV2(
        address _gmxReceiver,
        bool _shouldClaimGmx,
        bool _shouldStakeGmx,
        bool _shouldClaimEsGmx,
        bool _shouldStakeEsGmx,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        uint256 gmxAmount = 0;
        if (_shouldClaimGmx) {
            uint256 gmxAmount0 = _claimVestedGmx(account, _gmxReceiver);
            uint256 gmxAmount1 = _claimGmxFees(account, _gmxReceiver);
            gmxAmount = gmxAmount0.add(gmxAmount1);
        }

        if (_shouldStakeGmx && gmxAmount > 0) {
            require(_gmxReceiver == account, "cannot stake GMX if _gmxReceiver != account");
            _stakeGmx(account, account, gmx, gmxAmount);
        }

        uint256 esGmxAmount = 0;
        if (_shouldClaimEsGmx) {
            esGmxAmount = _claim(stakedGmxTracker, stakedGlpTracker, account, account);
        }

        if (_shouldStakeEsGmx && esGmxAmount > 0) {
            _stakeGmx(account, account, esGmx, esGmxAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            _restakeForAccount(account);
            
            _stakeBnGmx(account);
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 wethAmount = _claim(feeGmxTracker, feeGlpTracker, account, address(this));
                _convertWethToEth(wethAmount);
            } else {
                _claim(feeGmxTracker, feeGlpTracker, account, account);
            }
        }

        _syncVotingPower(account);
    }

    // the _validateReceiver function checks that the averageStakedAmounts and cumulativeRewards
    // values of an account are zero, this is to help ensure that vesting calculations can be
    // done correctly
    // averageStakedAmounts and cumulativeRewards are updated if the claimable reward for an account
    // is more than zero
    // it is possible for multiple transfers to be sent into a single account, using signalTransfer and
    // acceptTransfer, if those values have not been updated yet
    // for GLP transfers it is also possible to transfer GLP into an account using the StakedGlp contract
    function signalTransfer(address _receiver) external nonReentrant {
        _validateNotVesting(msg.sender);

        _validateReceiver(_receiver);

        if (inStrictTransferMode) {
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(msg.sender);
            uint256 allowance = IERC20(feeGmxTracker).allowance(msg.sender, _receiver);
            require(allowance >= balance, "insufficient allowance");
        }

        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        _validateNotVesting(_sender);

        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        _compound(_sender);

        uint256 stakedGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, gmx);
        if (stakedGmx > 0) {
            _unstakeGmx(_sender, gmx, stakedGmx, false);
            _stakeGmx(_sender, receiver, gmx, stakedGmx);
        }

        uint256 stakedEsGmx = IRewardTracker(stakedGmxTracker).depositBalances(_sender, esGmx);
        if (stakedEsGmx > 0) {
            _unstakeGmx(_sender, esGmx, stakedEsGmx, false);
            _stakeGmx(_sender, receiver, esGmx, stakedEsGmx);
        }

        uint256 stakedBnGmx = IRewardTracker(extendedGmxTracker).depositBalances(_sender, bnGmx);
        _acceptTransferRestake(feeGmxTracker, extendedGmxTracker, _sender, receiver, bnGmx, stakedBnGmx);

        uint256 esGmxBalance = IERC20(esGmx).balanceOf(_sender);
        if (esGmxBalance > 0) {
            IERC20(esGmx).transferFrom(_sender, receiver, esGmxBalance);
        }

        uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_sender);
        if (bnGmxBalance > 0) {
            _burnToken(bnGmx, _sender, bnGmxBalance);
            _mintToken(bnGmx, receiver, bnGmxBalance);
        }

        uint256 glpAmount = IRewardTracker(feeGlpTracker).depositBalances(_sender, glp);
        _acceptTransferRestake(stakedGlpTracker, feeGlpTracker, _sender, receiver, glp, glpAmount);

        IVester(gmxVester).transferStakeValues(_sender, receiver);
        IVester(glpVester).transferStakeValues(_sender, receiver);

        _syncVotingPower(_sender);
        _syncVotingPower(receiver);
    }

    function _claim(address _rewardTracker0, address _rewardTracker1, address _account, address _receiver) private returns (uint256) {
        uint256 amount0 = IRewardTracker(_rewardTracker0).claimForAccount(_account, _receiver);
        uint256 amount1 = IRewardTracker(_rewardTracker1).claimForAccount(_account, _receiver);
        uint256 amount = amount0.add(amount1);
        return(amount);
    }

    function _claimGmxFees(address _account, address _receiver) private returns (uint256) {
        uint256 gmxAmount = IRewardTracker(extendedGmxTracker).claimForAccount(_account, _receiver);
        return(gmxAmount);
    }

    function _claimVestedGmx(address _account, address _receiver) private returns (uint256) {
        uint256 gmxAmount0 = IVester(gmxVester).claimForAccount(_account, _receiver);
        uint256 gmxAmount1 = IVester(glpVester).claimForAccount(_account, _receiver);
        uint256 gmxAmount = gmxAmount0.add(gmxAmount1);
        return (gmxAmount);
    }

    function _convertWethToEth(uint256 _amount) private {
        IWETH(weth).withdraw(_amount);
        payable(msg.sender).sendValue(_amount);
    }

    function _compound(address _account) private {
        uint256 gmxAmount = _claimGmxFees(_account, _account);
        if (gmxAmount > 0) {
            _stakeGmx(_account, _account, gmx, gmxAmount);
        }
        
        uint256 esGmxAmount = _claim(stakedGmxTracker, stakedGlpTracker, _account, _account);
        if (esGmxAmount > 0) {
            _stakeGmx(_account, _account, esGmx, esGmxAmount);
        }

        _restakeForAccount(_account);

        _stakeBnGmx(_account);

        _syncVotingPower(_account);
    }

    function _stakeGmx(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        _validateAmount(_amount);

        IRewardTracker(stakedGmxTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker(bonusGmxTracker).stakeForAccount(_account, _account, stakedGmxTracker, _amount);
        IRewardTracker(extendedGmxTracker).stakeForAccount(_account, _account, bonusGmxTracker, _amount);
        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, extendedGmxTracker, _amount);

        _syncVotingPower(_account);

        emit StakeGmx(_account, _token, _amount);
    }

    // note that _syncVotingPower is not called here, in functions which
    // call _stakeBnGmx it should be ensured that _syncVotingPower is called
    // after
    function _stakeBnGmx(address _account) private {
        IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);

        // get the bnGmx balance of the user, this would be the amount of
        // bnGmx that has not been staked
        uint256 bnGmxAmount = IERC20(bnGmx).balanceOf(_account);
        if (bnGmxAmount == 0) { return; }

        // get the baseStakedAmount which would be the sum of staked gmx and staked esGmx tokens
        uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
        uint256 maxAllowedBnGmxAmount = baseStakedAmount.mul(maxBoostBasisPoints).div(BASIS_POINTS_DIVISOR);
        uint256 currentBnGmxAmount = IRewardTracker(extendedGmxTracker).depositBalances(_account, bnGmx);
        if (currentBnGmxAmount == maxAllowedBnGmxAmount) { return; }

        // if the currentBnGmxAmount is more than the maxAllowedBnGmxAmount
        // unstake the excess tokens
        if (currentBnGmxAmount > maxAllowedBnGmxAmount) {
            uint256 amountToUnstake = currentBnGmxAmount.sub(maxAllowedBnGmxAmount);
            IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, amountToUnstake, _account);
            IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bnGmx, amountToUnstake, _account);
            return;
        }

        uint256 maxStakeableBnGmxAmount = maxAllowedBnGmxAmount.sub(currentBnGmxAmount);
        if (bnGmxAmount > maxStakeableBnGmxAmount) {
            bnGmxAmount = maxStakeableBnGmxAmount;
        }

        IRewardTracker(extendedGmxTracker).stakeForAccount(_account, _account, bnGmx, bnGmxAmount);
        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, extendedGmxTracker, bnGmxAmount);
    }

    function _unstakeGmx(address _account, address _token, uint256 _amount, bool _shouldReduceBnGmx) private {
        _validateAmount(_amount);

        uint256 balance = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);

        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, _amount, _account);
        IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bonusGmxTracker, _amount, _account);
        IRewardTracker(bonusGmxTracker).unstakeForAccount(_account, stakedGmxTracker, _amount, _account);
        IRewardTracker(stakedGmxTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnGmx) {
            IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);

            // unstake and burn staked bnGmx tokens
            uint256 stakedBnGmx = IRewardTracker(extendedGmxTracker).depositBalances(_account, bnGmx);
            if (stakedBnGmx > 0) {
                uint256 reductionAmount = stakedBnGmx.mul(_amount).div(balance);
                IRewardTracker(feeGmxTracker).unstakeForAccount(_account, extendedGmxTracker, reductionAmount, _account);
                IRewardTracker(extendedGmxTracker).unstakeForAccount(_account, bnGmx, reductionAmount, _account);
                _burnToken(bnGmx, _account, reductionAmount);
            }

            // burn bnGmx tokens from user's balance
            uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_account);
            if (bnGmxBalance > 0) {
                uint256 amountToBurn = bnGmxBalance.mul(_amount).div(balance);
                _burnToken(bnGmx, _account, amountToBurn);
            }
        }

        _syncVotingPower(_account);

        emit UnstakeGmx(_account, _token, _amount);
    }

    function _syncVotingPower(address _account) private {
        if (votingPowerType == VotingPowerType.None) {
            return;
        }

        if (votingPowerType == VotingPowerType.BaseStakedAmount) {
            uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
            _syncVotingPower(_account, baseStakedAmount);
            return;
        }

        if (votingPowerType == VotingPowerType.BaseAndBonusStakedAmount) {
            uint256 stakedAmount = IRewardTracker(feeGmxTracker).stakedAmounts(_account);
            _syncVotingPower(_account, stakedAmount);
            return;
        }

        revert("unsupported votingPowerType");
    }

    function _syncVotingPower(address _account, uint256 _amount) private {
        uint256 currentVotingPower = IERC20(govToken).balanceOf(_account);
        if (currentVotingPower == _amount) { return; }

        if (currentVotingPower > _amount) {
            uint256 amountToBurn = currentVotingPower.sub(_amount);
            _burnToken(govToken, _account, amountToBurn);
            return;
        }

        uint256 amountToMint = _amount.sub(currentVotingPower);
        _mintToken(govToken, _account, amountToMint);
    }

    function _mintAndStakeGlp(address _address, address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) private returns (uint256) {
        address account = msg.sender;
        uint256 glpAmount = IGlpManager(glpManager).addLiquidityForAccount(_address, account, _token, _amount, _minUsdg, _minGlp);
        IRewardTracker(feeGlpTracker).stakeForAccount(account, account, glp, glpAmount);
        IRewardTracker(stakedGlpTracker).stakeForAccount(account, account, feeGlpTracker, glpAmount);
        return glpAmount;
    }

    function _unstakeAndRedeemGlp(address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) private returns (uint256) {
        require(_glpAmount > 0, "invalid _glpAmount");

        address account = msg.sender;
        IRewardTracker(stakedGlpTracker).unstakeForAccount(account, feeGlpTracker, _glpAmount, account);
        IRewardTracker(feeGlpTracker).unstakeForAccount(account, glp, _glpAmount, account);
        uint256 amountOut = IGlpManager(glpManager).removeLiquidityForAccount(account, _tokenOut, _glpAmount, _minOut, _receiver);
        return amountOut;
    }

    function _restakeForAccount(address _account) private {
        if (!inRestakingMode) { return; }
        
        uint256 bonusGmxTrackerBalance = IRewardTracker(feeGmxTracker).depositBalances(_account, bonusGmxTracker);
        if (bonusGmxTrackerBalance > 0) {
            uint256 reservedForVesting = IVester(gmxVester).pairAmounts(_account);
            if (reservedForVesting > 0) {
                IERC20(feeGmxTracker).safeTransferFrom(gmxVester, _account, reservedForVesting);
                _restakeBonusGmxTracker(_account, bonusGmxTrackerBalance);
                _restakeBnGmx(_account);
                IERC20(feeGmxTracker).safeTransferFrom(_account, gmxVester, reservedForVesting);
            }
            else {
                _restakeBonusGmxTracker(_account, bonusGmxTrackerBalance);
                _restakeBnGmx(_account);
            }
        }
    }

    function _restakeBonusGmxTracker(address _account, uint256 _bonusGmxTrackerBalance) private {
        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bonusGmxTracker, _bonusGmxTrackerBalance, _account);
        IRewardTracker(extendedGmxTracker).stakeForAccount(_account, _account, bonusGmxTracker, _bonusGmxTrackerBalance);
        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, extendedGmxTracker, _bonusGmxTrackerBalance);
    }

    function _restakeBnGmx(address _account) private {
        uint256 stakedBnGmx = IRewardTracker(feeGmxTracker).depositBalances(_account, bnGmx);
        if (stakedBnGmx > 0) {
            IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bnGmx, stakedBnGmx, _account);
            _stakeBnGmx(_account);
            _syncVotingPower(_account);
        }
    }

    function _acceptTransferRestake(address _rewardTracker0, address _rewardTracker1, address _sender, address _receiver, address _token, uint256 _amount) private {
        if (_amount > 0) {
            IRewardTracker(_rewardTracker0).unstakeForAccount(_sender, _rewardTracker1, _amount, _sender);
            IRewardTracker(_rewardTracker1).unstakeForAccount(_sender, _token, _amount, _sender);
            IRewardTracker(_rewardTracker1).stakeForAccount(_sender, _receiver, _token, _amount);
            IRewardTracker(_rewardTracker0).stakeForAccount(_receiver, _receiver, _rewardTracker1, _amount);
        }
    }

    function _mintToken(address _token, address _account, uint256 _amountToMint) private {
        IMintable(_token).mint(_account, _amountToMint);
    }

    function _burnToken(address _token, address _account, uint256 _amountToBurn) private {
        IMintable(_token).burn(_account, _amountToBurn);
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker(stakedGmxTracker).averageStakedAmounts(_receiver) == 0, "stakedGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedGmxTracker).cumulativeRewards(_receiver) == 0, "stakedGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(bonusGmxTracker).averageStakedAmounts(_receiver) == 0, "bonusGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(bonusGmxTracker).cumulativeRewards(_receiver) == 0, "bonusGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(extendedGmxTracker).averageStakedAmounts(_receiver) == 0, "extendedGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(extendedGmxTracker).cumulativeRewards(_receiver) == 0, "extendedGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeGmxTracker).averageStakedAmounts(_receiver) == 0, "feeGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeGmxTracker).cumulativeRewards(_receiver) == 0, "feeGmxTracker.cumulativeRewards > 0");

        require(IVester(gmxVester).transferredAverageStakedAmounts(_receiver) == 0, "gmxVester.transferredAverageStakedAmounts > 0");
        require(IVester(gmxVester).transferredCumulativeRewards(_receiver) == 0, "gmxVester.transferredCumulativeRewards > 0");

        require(IRewardTracker(stakedGlpTracker).averageStakedAmounts(_receiver) == 0, "stakedGlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedGlpTracker).cumulativeRewards(_receiver) == 0, "stakedGlpTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeGlpTracker).averageStakedAmounts(_receiver) == 0, "feeGlpTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeGlpTracker).cumulativeRewards(_receiver) == 0, "feeGlpTracker.cumulativeRewards > 0");

        require(IVester(glpVester).transferredAverageStakedAmounts(_receiver) == 0, "gmxVester.transferredAverageStakedAmounts > 0");
        require(IVester(glpVester).transferredCumulativeRewards(_receiver) == 0, "gmxVester.transferredCumulativeRewards > 0");

        require(IERC20(gmxVester).balanceOf(_receiver) == 0, "gmxVester.balance > 0");
        require(IERC20(glpVester).balanceOf(_receiver) == 0, "glpVester.balance > 0");
    }

    function _validateNotVesting(address _sender) private view {
        require(IERC20(gmxVester).balanceOf(_sender) == 0 && IERC20(glpVester).balanceOf(_sender) == 0, "sender has vested tokens");
    }

    function _validateAmount(uint256 _amount) private pure {
        require(_amount > 0, "invalid _amount");
    }
}