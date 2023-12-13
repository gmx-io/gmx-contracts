// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";
import "../libraries/utils/Address.sol";

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

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    bool public isInitialized;

    address public weth;

    address public gmx;
    address public esGmx;
    address public bnGmx;

    address public glp; // GMX Liquidity Provider token

    address public stakedGmxTracker;
    address public bonusGmxTracker;
    address public feeGmxTracker;

    address public override stakedGlpTracker;
    address public override feeGlpTracker;

    address public glpManager;

    address public gmxVester;
    address public glpVester;

    uint256 public maxBoostBasisPoints;
    bool public inStrictTransferMode;

    address public govToken;
    VotingPowerType public votingPowerType;

    mapping (address => address) public pendingReceivers;

    event StakeGmx(address account, address token, uint256 amount);
    event UnstakeGmx(address account, address token, uint256 amount);

    event StakeGlp(address account, uint256 amount);
    event UnstakeGlp(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        address _gmx,
        address _esGmx,
        address _bnGmx,
        address _glp,
        address _stakedGmxTracker,
        address _bonusGmxTracker,
        address _feeGmxTracker,
        address _feeGlpTracker,
        address _stakedGlpTracker,
        address _glpManager,
        address _gmxVester,
        address _glpVester,
        address _govToken
    ) external onlyGov {
        require(!isInitialized, "already initialized");
        isInitialized = true;

        weth = _weth;

        gmx = _gmx;
        esGmx = _esGmx;
        bnGmx = _bnGmx;

        glp = _glp;

        stakedGmxTracker = _stakedGmxTracker;
        bonusGmxTracker = _bonusGmxTracker;
        feeGmxTracker = _feeGmxTracker;

        feeGlpTracker = _feeGlpTracker;
        stakedGlpTracker = _stakedGlpTracker;

        glpManager = _glpManager;

        gmxVester = _gmxVester;
        glpVester = _glpVester;

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

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function batchStakeGmxForAccount(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
        address _gmx = gmx;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeGmx(msg.sender, _accounts[i], _gmx, _amounts[i]);
        }
    }

    function stakeGmxForAccount(address _account, uint256 _amount) external nonReentrant onlyGov {
        _stakeGmx(msg.sender, _account, gmx, _amount);
    }

    function stakeGmx(uint256 _amount) external nonReentrant {
        _stakeGmx(msg.sender, msg.sender, gmx, _amount);
    }

    function stakeEsGmx(uint256 _amount) external nonReentrant {
        _stakeGmx(msg.sender, msg.sender, esGmx, _amount);
    }

    function unstakeGmx(uint256 _amount) external nonReentrant {
        _unstakeGmx(msg.sender, gmx, _amount, true);
    }

    function unstakeEsGmx(uint256 _amount) external nonReentrant {
        _unstakeGmx(msg.sender, esGmx, _amount, true);
    }

    function mintAndStakeGlp(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minGlp) external nonReentrant returns (uint256) {
        require(_amount > 0, "invalid _amount");

        address account = msg.sender;
        uint256 glpAmount = IGlpManager(glpManager).addLiquidityForAccount(account, account, _token, _amount, _minUsdg, _minGlp);
        IRewardTracker(feeGlpTracker).stakeForAccount(account, account, glp, glpAmount);
        IRewardTracker(stakedGlpTracker).stakeForAccount(account, account, feeGlpTracker, glpAmount);

        emit StakeGlp(account, glpAmount);

        return glpAmount;
    }

    function mintAndStakeGlpETH(uint256 _minUsdg, uint256 _minGlp) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "invalid msg.value");

        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).approve(glpManager, msg.value);

        address account = msg.sender;
        uint256 glpAmount = IGlpManager(glpManager).addLiquidityForAccount(address(this), account, weth, msg.value, _minUsdg, _minGlp);

        IRewardTracker(feeGlpTracker).stakeForAccount(account, account, glp, glpAmount);
        IRewardTracker(stakedGlpTracker).stakeForAccount(account, account, feeGlpTracker, glpAmount);

        emit StakeGlp(account, glpAmount);

        return glpAmount;
    }

    function unstakeAndRedeemGlp(address _tokenOut, uint256 _glpAmount, uint256 _minOut, address _receiver) external nonReentrant returns (uint256) {
        require(_glpAmount > 0, "invalid _glpAmount");

        address account = msg.sender;
        IRewardTracker(stakedGlpTracker).unstakeForAccount(account, feeGlpTracker, _glpAmount, account);
        IRewardTracker(feeGlpTracker).unstakeForAccount(account, glp, _glpAmount, account);
        uint256 amountOut = IGlpManager(glpManager).removeLiquidityForAccount(account, _tokenOut, _glpAmount, _minOut, _receiver);

        emit UnstakeGlp(account, _glpAmount);

        return amountOut;
    }

    function unstakeAndRedeemGlpETH(uint256 _glpAmount, uint256 _minOut, address payable _receiver) external nonReentrant returns (uint256) {
        require(_glpAmount > 0, "invalid _glpAmount");

        address account = msg.sender;
        IRewardTracker(stakedGlpTracker).unstakeForAccount(account, feeGlpTracker, _glpAmount, account);
        IRewardTracker(feeGlpTracker).unstakeForAccount(account, glp, _glpAmount, account);
        uint256 amountOut = IGlpManager(glpManager).removeLiquidityForAccount(account, weth, _glpAmount, _minOut, address(this));

        IWETH(weth).withdraw(amountOut);

        _receiver.sendValue(amountOut);

        emit UnstakeGlp(account, _glpAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeGmxTracker).claimForAccount(account, account);
        IRewardTracker(feeGlpTracker).claimForAccount(account, account);

        IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
        IRewardTracker(stakedGlpTracker).claimForAccount(account, account);
    }

    function claimEsGmx() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
        IRewardTracker(stakedGlpTracker).claimForAccount(account, account);
    }

    function claimFees() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeGmxTracker).claimForAccount(account, account);
        IRewardTracker(feeGlpTracker).claimForAccount(account, account);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
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
            uint256 gmxAmount0 = IVester(gmxVester).claimForAccount(account, account);
            uint256 gmxAmount1 = IVester(glpVester).claimForAccount(account, account);
            gmxAmount = gmxAmount0.add(gmxAmount1);
        }

        if (_shouldStakeGmx && gmxAmount > 0) {
            _stakeGmx(account, account, gmx, gmxAmount);
        }

        uint256 esGmxAmount = 0;
        if (_shouldClaimEsGmx) {
            uint256 esGmxAmount0 = IRewardTracker(stakedGmxTracker).claimForAccount(account, account);
            uint256 esGmxAmount1 = IRewardTracker(stakedGlpTracker).claimForAccount(account, account);
            esGmxAmount = esGmxAmount0.add(esGmxAmount1);
        }

        if (_shouldStakeEsGmx && esGmxAmount > 0) {
            _stakeGmx(account, account, esGmx, esGmxAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            _stakeBnGmx(account);
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 weth0 = IRewardTracker(feeGmxTracker).claimForAccount(account, address(this));
                uint256 weth1 = IRewardTracker(feeGlpTracker).claimForAccount(account, address(this));

                uint256 wethAmount = weth0.add(weth1);
                IWETH(weth).withdraw(wethAmount);

                payable(account).sendValue(wethAmount);
            } else {
                IRewardTracker(feeGmxTracker).claimForAccount(account, account);
                IRewardTracker(feeGlpTracker).claimForAccount(account, account);
            }
        }

        _syncVotingPower(account);
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
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
        require(IERC20(gmxVester).balanceOf(msg.sender) == 0, "sender has vested tokens");
        require(IERC20(glpVester).balanceOf(msg.sender) == 0, "sender has vested tokens");

        _validateReceiver(_receiver);

        if (inStrictTransferMode) {
            uint256 balance = IRewardTracker(feeGmxTracker).stakedAmounts(msg.sender);
            uint256 allowance = IERC20(feeGmxTracker).allowance(msg.sender, _receiver);
            require(allowance >= balance, "insufficient allowance");
        }

        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        require(IERC20(gmxVester).balanceOf(_sender) == 0, "sender has vested tokens");
        require(IERC20(glpVester).balanceOf(_sender) == 0, "sender has vested tokens");

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

        uint256 stakedBnGmx = IRewardTracker(feeGmxTracker).depositBalances(_sender, bnGmx);
        if (stakedBnGmx > 0) {
            IRewardTracker(feeGmxTracker).unstakeForAccount(_sender, bnGmx, stakedBnGmx, _sender);
            IRewardTracker(feeGmxTracker).stakeForAccount(_sender, receiver, bnGmx, stakedBnGmx);
        }

        uint256 esGmxBalance = IERC20(esGmx).balanceOf(_sender);
        if (esGmxBalance > 0) {
            IERC20(esGmx).transferFrom(_sender, receiver, esGmxBalance);
        }

        uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_sender);
        if (bnGmxBalance > 0) {
            IMintable(bnGmx).burn(_sender, bnGmxBalance);
            IMintable(bnGmx).mint(receiver, bnGmxBalance);
        }

        uint256 glpAmount = IRewardTracker(feeGlpTracker).depositBalances(_sender, glp);
        if (glpAmount > 0) {
            IRewardTracker(stakedGlpTracker).unstakeForAccount(_sender, feeGlpTracker, glpAmount, _sender);
            IRewardTracker(feeGlpTracker).unstakeForAccount(_sender, glp, glpAmount, _sender);

            IRewardTracker(feeGlpTracker).stakeForAccount(_sender, receiver, glp, glpAmount);
            IRewardTracker(stakedGlpTracker).stakeForAccount(receiver, receiver, feeGlpTracker, glpAmount);
        }

        IVester(gmxVester).transferStakeValues(_sender, receiver);
        IVester(glpVester).transferStakeValues(_sender, receiver);

        _syncVotingPower(_sender);
        _syncVotingPower(receiver);
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker(stakedGmxTracker).averageStakedAmounts(_receiver) == 0, "stakedGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedGmxTracker).cumulativeRewards(_receiver) == 0, "stakedGmxTracker.cumulativeRewards > 0");

        require(IRewardTracker(bonusGmxTracker).averageStakedAmounts(_receiver) == 0, "bonusGmxTracker.averageStakedAmounts > 0");
        require(IRewardTracker(bonusGmxTracker).cumulativeRewards(_receiver) == 0, "bonusGmxTracker.cumulativeRewards > 0");

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

    function _compound(address _account) private {
        _compoundGmx(_account);
        _compoundGlp(_account);
        _syncVotingPower(_account);
    }

    function _compoundGmx(address _account) private {
        uint256 esGmxAmount = IRewardTracker(stakedGmxTracker).claimForAccount(_account, _account);
        if (esGmxAmount > 0) {
            _stakeGmx(_account, _account, esGmx, esGmxAmount);
        }

        _stakeBnGmx(_account);
    }

    function _compoundGlp(address _account) private {
        uint256 esGmxAmount = IRewardTracker(stakedGlpTracker).claimForAccount(_account, _account);
        if (esGmxAmount > 0) {
            _stakeGmx(_account, _account, esGmx, esGmxAmount);
        }
    }

    function _stakeGmx(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        require(_amount > 0, "invalid _amount");

        IRewardTracker(stakedGmxTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker(bonusGmxTracker).stakeForAccount(_account, _account, stakedGmxTracker, _amount);
        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, bonusGmxTracker, _amount);

        _syncVotingPower(_account);

        emit StakeGmx(_account, _token, _amount);
    }

    // note that _syncVotingPower is not called here, it should be ensured that
    // in functions which call _stakeBnGmx it should be ensured that
    // _syncVotingPower is called after
    function _stakeBnGmx(address _account) private {
        IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);

        // get the bnGmx balance of the user, this would be the amount of
        // bnGmx that has not been staked
        uint256 bnGmxAmount = IERC20(bnGmx).balanceOf(_account);
        if (bnGmxAmount == 0) { return; }

        // get the baseStakedAmount which would be the sum of staked gmx and staked esGmx tokens
        uint256 baseStakedAmount = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);
        uint256 maxAllowedBnGmxAmount = baseStakedAmount.mul(maxBoostBasisPoints).div(BASIS_POINTS_DIVISOR);
        uint256 currentBnGmxAmount = IRewardTracker(feeGmxTracker).depositBalances(_account, bnGmx);
        if (currentBnGmxAmount == maxAllowedBnGmxAmount) { return; }

        // if the currentBnGmxAmount is more than the maxAllowedBnGmxAmount
        // unstake the excess tokens
        if (currentBnGmxAmount > maxAllowedBnGmxAmount) {
            uint256 amountToUnstake = currentBnGmxAmount.sub(maxAllowedBnGmxAmount);
            IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bnGmx, amountToUnstake, _account);
            return;
        }

        uint256 maxStakeableBnGmxAmount = maxAllowedBnGmxAmount.sub(currentBnGmxAmount);
        if (bnGmxAmount > maxStakeableBnGmxAmount) {
            bnGmxAmount = maxStakeableBnGmxAmount;
        }

        IRewardTracker(feeGmxTracker).stakeForAccount(_account, _account, bnGmx, bnGmxAmount);
    }

    function _unstakeGmx(address _account, address _token, uint256 _amount, bool _shouldReduceBnGmx) private {
        require(_amount > 0, "invalid _amount");

        uint256 balance = IRewardTracker(stakedGmxTracker).stakedAmounts(_account);

        IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bonusGmxTracker, _amount, _account);
        IRewardTracker(bonusGmxTracker).unstakeForAccount(_account, stakedGmxTracker, _amount, _account);
        IRewardTracker(stakedGmxTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnGmx) {
            IRewardTracker(bonusGmxTracker).claimForAccount(_account, _account);

            // unstake and burn staked bnGmx tokens
            uint256 stakedBnGmx = IRewardTracker(feeGmxTracker).depositBalances(_account, bnGmx);
            if (stakedBnGmx > 0) {
                uint256 reductionAmount = stakedBnGmx.mul(_amount).div(balance);
                IRewardTracker(feeGmxTracker).unstakeForAccount(_account, bnGmx, reductionAmount, _account);
                IMintable(bnGmx).burn(_account, reductionAmount);
            }

            // burn bnGmx tokens from user's balance
            uint256 bnGmxBalance = IERC20(bnGmx).balanceOf(_account);
            if (bnGmxBalance > 0) {
                uint256 amountToBurn = bnGmxBalance.mul(_amount).div(balance);
                IMintable(bnGmx).burn(_account, amountToBurn);
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
            IMintable(govToken).burn(_account, amountToBurn);
            return;
        }

        uint256 amountToMint = _amount.sub(currentVotingPower);
        IMintable(govToken).mint(_account, amountToMint);
    }
}
