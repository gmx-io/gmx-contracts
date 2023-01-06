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

    bool public isInitialized;

    address public weth;

    address public open;
    address public esOpen;
    address public bnOpen;

    address public oap; // OPEN Assets Pools token

    address public stakedOpenTracker;
    address public bonusOpenTracker;
    address public feeOpenTracker;

    address public override stakedOapTracker;
    address public override feeOapTracker;

    address public oapManager;

    address public openVester;
    address public oapVester;

    mapping (address => address) public pendingReceivers;

    event StakeOpen(address account, address token, uint256 amount);
    event UnstakeOpen(address account, address token, uint256 amount);

    event StakeOap(address account, uint256 amount);
    event UnstakeOap(address account, uint256 amount);

    receive() external payable {
        require(msg.sender == weth, "Router: invalid sender");
    }

    function initialize(
        address _weth,
        address _open,
        address _esOpen,
        address _bnOpen,
        address _oap,
        address _stakedOpenTracker,
        address _bonusOpenTracker,
        address _feeOpenTracker,
        address _feeOapTracker,
        address _stakedOapTracker,
        address _oapManager,
        address _openVester,
        address _oapVester
    ) external onlyGov {
        require(!isInitialized, "RewardRouter: already initialized");
        isInitialized = true;

        weth = _weth;

        open = _open;
        esOpen = _esOpen;
        bnOpen = _bnOpen;

        oap = _oap;

        stakedOpenTracker = _stakedOpenTracker;
        bonusOpenTracker = _bonusOpenTracker;
        feeOpenTracker = _feeOpenTracker;

        feeOapTracker = _feeOapTracker;
        stakedOapTracker = _stakedOapTracker;

        oapManager = _oapManager;

        openVester = _openVester;
        oapVester = _oapVester;
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function batchStakeOpenForAccount(address[] memory _accounts, uint256[] memory _amounts) external nonReentrant onlyGov {
        address _open = open;
        for (uint256 i = 0; i < _accounts.length; i++) {
            _stakeOpen(msg.sender, _accounts[i], _open, _amounts[i]);
        }
    }

    function stakeOpenForAccount(address _account, uint256 _amount) external nonReentrant onlyGov {
        _stakeOpen(msg.sender, _account, open, _amount);
    }

    function stakeOpen(uint256 _amount) external nonReentrant {
        _stakeOpen(msg.sender, msg.sender, open, _amount);
    }

    function stakeEsOpen(uint256 _amount) external nonReentrant {
        _stakeOpen(msg.sender, msg.sender, esOpen, _amount);
    }

    function unstakeOpen(uint256 _amount) external nonReentrant {
        _unstakeOpen(msg.sender, open, _amount, true);
    }

    function unstakeEsOpen(uint256 _amount) external nonReentrant {
        _unstakeOpen(msg.sender, esOpen, _amount, true);
    }

    function mintAndStakeOap(address _token, uint256 _amount, uint256 _minUsdg, uint256 _minOap) external nonReentrant returns (uint256) {
        require(_amount > 0, "RewardRouter: invalid _amount");

        address account = msg.sender;
        uint256 oapAmount = IGlpManager(oapManager).addLiquidityForAccount(account, account, _token, _amount, _minUsdg, _minOap);
        IRewardTracker(feeOapTracker).stakeForAccount(account, account, oap, oapAmount);
        IRewardTracker(stakedOapTracker).stakeForAccount(account, account, feeOapTracker, oapAmount);

        emit StakeOap(account, oapAmount);

        return oapAmount;
    }

    function mintAndStakeOapETH(uint256 _minUsdo, uint256 _minOap) external payable nonReentrant returns (uint256) {
        require(msg.value > 0, "RewardRouter: invalid msg.value");

        IWETH(weth).deposit{value: msg.value}();
        IERC20(weth).approve(oapManager, msg.value);

        address account = msg.sender;
        uint256 oapAmount = IGlpManager(oapManager).addLiquidityForAccount(address(this), account, weth, msg.value, _minUsdo, _minOap);

        IRewardTracker(feeOapTracker).stakeForAccount(account, account, oap, oapAmount);
        IRewardTracker(stakedOapTracker).stakeForAccount(account, account, feeOapTracker, oapAmount);

        emit StakeOap(account, oapAmount);

        return oapAmount;
    }

    function unstakeAndRedeemOap(address _tokenOut, uint256 _oapAmount, uint256 _minOut, address _receiver) external nonReentrant returns (uint256) {
        require(_oapAmount > 0, "RewardRouter: invalid _oapAmount");

        address account = msg.sender;
        IRewardTracker(stakedOapTracker).unstakeForAccount(account, feeOapTracker, _oapAmount, account);
        IRewardTracker(feeOapTracker).unstakeForAccount(account, oap, _oapAmount, account);
        uint256 amountOut = IGlpManager(oapManager).removeLiquidityForAccount(account, _tokenOut, _oapAmount, _minOut, _receiver);

        emit UnstakeOap(account, _oapAmount);

        return amountOut;
    }

    function unstakeAndRedeemOapETH(uint256 _oapAmount, uint256 _minOut, address payable _receiver) external nonReentrant returns (uint256) {
        require(_oapAmount > 0, "RewardRouter: invalid _oapAmount");

        address account = msg.sender;
        IRewardTracker(stakedOapTracker).unstakeForAccount(account, feeOapTracker, _oapAmount, account);
        IRewardTracker(feeOapTracker).unstakeForAccount(account, oap, _oapAmount, account);
        uint256 amountOut = IGlpManager(oapManager).removeLiquidityForAccount(account, weth, _oapAmount, _minOut, address(this));

        IWETH(weth).withdraw(amountOut);

        _receiver.sendValue(amountOut);

        emit UnstakeOap(account, _oapAmount);

        return amountOut;
    }

    function claim() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeOpenTracker).claimForAccount(account, account);
        IRewardTracker(feeOapTracker).claimForAccount(account, account);

        IRewardTracker(stakedOpenTracker).claimForAccount(account, account);
        IRewardTracker(stakedOapTracker).claimForAccount(account, account);
    }

    function claimEsOpen() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(stakedOpenTracker).claimForAccount(account, account);
        IRewardTracker(stakedOapTracker).claimForAccount(account, account);
    }

    function claimFees() external nonReentrant {
        address account = msg.sender;

        IRewardTracker(feeOpenTracker).claimForAccount(account, account);
        IRewardTracker(feeOapTracker).claimForAccount(account, account);
    }

    function compound() external nonReentrant {
        _compound(msg.sender);
    }

    function compoundForAccount(address _account) external nonReentrant onlyGov {
        _compound(_account);
    }

    function handleRewards(
        bool _shouldClaimOpen,
        bool _shouldStakeOpen,
        bool _shouldClaimEsOpen,
        bool _shouldStakeEsOpen,
        bool _shouldStakeMultiplierPoints,
        bool _shouldClaimWeth,
        bool _shouldConvertWethToEth
    ) external nonReentrant {
        address account = msg.sender;

        uint256 openAmount = 0;
        if (_shouldClaimOpen) {
            uint256 openAmount0 = IVester(openVester).claimForAccount(account, account);
            uint256 openAmount1 = IVester(oapVester).claimForAccount(account, account);
            openAmount = openAmount0.add(openAmount1);
        }

        if (_shouldStakeOpen && openAmount > 0) {
            _stakeOpen(account, account, open, openAmount);
        }

        uint256 esOpenAmount = 0;
        if (_shouldClaimEsOpen) {
            uint256 esOpenAmount0 = IRewardTracker(stakedOpenTracker).claimForAccount(account, account);
            uint256 esOpenAmount1 = IRewardTracker(stakedOapTracker).claimForAccount(account, account);
            esOpenAmount = esOpenAmount0.add(esOpenAmount1);
        }

        if (_shouldStakeEsOpen && esOpenAmount > 0) {
            _stakeOpen(account, account, esOpen, esOpenAmount);
        }

        if (_shouldStakeMultiplierPoints) {
            uint256 bnOpenAmount = IRewardTracker(bonusOpenTracker).claimForAccount(account, account);
            if (bnOpenAmount > 0) {
                IRewardTracker(feeOpenTracker).stakeForAccount(account, account, bnOpen, bnOpenAmount);
            }
        }

        if (_shouldClaimWeth) {
            if (_shouldConvertWethToEth) {
                uint256 weth0 = IRewardTracker(feeOpenTracker).claimForAccount(account, address(this));
                uint256 weth1 = IRewardTracker(feeOapTracker).claimForAccount(account, address(this));

                uint256 wethAmount = weth0.add(weth1);
                IWETH(weth).withdraw(wethAmount);

                payable(account).sendValue(wethAmount);
            } else {
                IRewardTracker(feeOpenTracker).claimForAccount(account, account);
                IRewardTracker(feeOapTracker).claimForAccount(account, account);
            }
        }
    }

    function batchCompoundForAccounts(address[] memory _accounts) external nonReentrant onlyGov {
        for (uint256 i = 0; i < _accounts.length; i++) {
            _compound(_accounts[i]);
        }
    }

    function signalTransfer(address _receiver) external nonReentrant {
        require(IERC20(openVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(oapVester).balanceOf(msg.sender) == 0, "RewardRouter: sender has vested tokens");

        _validateReceiver(_receiver);
        pendingReceivers[msg.sender] = _receiver;
    }

    function acceptTransfer(address _sender) external nonReentrant {
        require(IERC20(openVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");
        require(IERC20(oapVester).balanceOf(_sender) == 0, "RewardRouter: sender has vested tokens");

        address receiver = msg.sender;
        require(pendingReceivers[_sender] == receiver, "RewardRouter: transfer not signalled");
        delete pendingReceivers[_sender];

        _validateReceiver(receiver);
        _compound(_sender);

        uint256 stakedOpen = IRewardTracker(stakedOpenTracker).depositBalances(_sender, open);
        if (stakedOpen > 0) {
            _unstakeOpen(_sender, open, stakedOpen, false);
            _stakeOpen(_sender, receiver, open, stakedOpen);
        }

        uint256 stakedEsOpen = IRewardTracker(stakedOpenTracker).depositBalances(_sender, esOpen);
        if (stakedEsOpen > 0) {
            _unstakeOpen(_sender, esOpen, stakedEsOpen, false);
            _stakeOpen(_sender, receiver, esOpen, stakedEsOpen);
        }

        uint256 stakedBnOpen = IRewardTracker(feeOpenTracker).depositBalances(_sender, bnOpen);
        if (stakedBnOpen > 0) {
            IRewardTracker(feeOpenTracker).unstakeForAccount(_sender, bnOpen, stakedBnOpen, _sender);
            IRewardTracker(feeOpenTracker).stakeForAccount(_sender, receiver, bnOpen, stakedBnOpen);
        }

        uint256 esOpenBalance = IERC20(esOpen).balanceOf(_sender);
        if (esOpenBalance > 0) {
            IERC20(esOpen).transferFrom(_sender, receiver, esOpenBalance);
        }

        uint256 oapAmount = IRewardTracker(feeOapTracker).depositBalances(_sender, oap);
        if (oapAmount > 0) {
            IRewardTracker(stakedOapTracker).unstakeForAccount(_sender, feeOapTracker, oapAmount, _sender);
            IRewardTracker(feeOapTracker).unstakeForAccount(_sender, oap, oapAmount, _sender);

            IRewardTracker(feeOapTracker).stakeForAccount(_sender, receiver, oap, oapAmount);
            IRewardTracker(stakedOapTracker).stakeForAccount(receiver, receiver, feeOapTracker, oapAmount);
        }

        IVester(openVester).transferStakeValues(_sender, receiver);
        IVester(oapVester).transferStakeValues(_sender, receiver);
    }

    function _validateReceiver(address _receiver) private view {
        require(IRewardTracker(stakedOpenTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedOpenTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedOpenTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedOpenTracker.cumulativeRewards > 0");

        require(IRewardTracker(bonusOpenTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: bonusOpenTracker.averageStakedAmounts > 0");
        require(IRewardTracker(bonusOpenTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: bonusOpenTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeOpenTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeOpenTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeOpenTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeOpenTracker.cumulativeRewards > 0");

        require(IVester(openVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: openVester.transferredAverageStakedAmounts > 0");
        require(IVester(openVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: openVester.transferredCumulativeRewards > 0");

        require(IRewardTracker(stakedOapTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: stakedOapTracker.averageStakedAmounts > 0");
        require(IRewardTracker(stakedOapTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: stakedOapTracker.cumulativeRewards > 0");

        require(IRewardTracker(feeOapTracker).averageStakedAmounts(_receiver) == 0, "RewardRouter: feeOapTracker.averageStakedAmounts > 0");
        require(IRewardTracker(feeOapTracker).cumulativeRewards(_receiver) == 0, "RewardRouter: feeOapTracker.cumulativeRewards > 0");

        require(IVester(oapVester).transferredAverageStakedAmounts(_receiver) == 0, "RewardRouter: openVester.transferredAverageStakedAmounts > 0");
        require(IVester(oapVester).transferredCumulativeRewards(_receiver) == 0, "RewardRouter: openVester.transferredCumulativeRewards > 0");

        require(IERC20(openVester).balanceOf(_receiver) == 0, "RewardRouter: openVester.balance > 0");
        require(IERC20(oapVester).balanceOf(_receiver) == 0, "RewardRouter: oapVester.balance > 0");
    }

    function _compound(address _account) private {
        _compoundOpen(_account);
        _compoundOap(_account);
    }

    function _compoundOpen(address _account) private {
        uint256 esOpenAmount = IRewardTracker(stakedOpenTracker).claimForAccount(_account, _account);
        if (esOpenAmount > 0) {
            _stakeOpen(_account, _account, esOpen, esOpenAmount);
        }

        uint256 bnOpenAmount = IRewardTracker(bonusOpenTracker).claimForAccount(_account, _account);
        if (bnOpenAmount > 0) {
            IRewardTracker(feeOpenTracker).stakeForAccount(_account, _account, bnOpen, bnOpenAmount);
        }
    }

    function _compoundOap(address _account) private {
        uint256 esOpenAmount = IRewardTracker(stakedOapTracker).claimForAccount(_account, _account);
        if (esOpenAmount > 0) {
            _stakeOpen(_account, _account, esOpen, esOpenAmount);
        }
    }

    function _stakeOpen(address _fundingAccount, address _account, address _token, uint256 _amount) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        IRewardTracker(stakedOpenTracker).stakeForAccount(_fundingAccount, _account, _token, _amount);
        IRewardTracker(bonusOpenTracker).stakeForAccount(_account, _account, stakedOpenTracker, _amount);
        IRewardTracker(feeOpenTracker).stakeForAccount(_account, _account, bonusOpenTracker, _amount);

        emit StakeOpen(_account, _token, _amount);
    }

    function _unstakeOpen(address _account, address _token, uint256 _amount, bool _shouldReduceBnOpen) private {
        require(_amount > 0, "RewardRouter: invalid _amount");

        uint256 balance = IRewardTracker(stakedOpenTracker).stakedAmounts(_account);

        IRewardTracker(feeOpenTracker).unstakeForAccount(_account, bonusOpenTracker, _amount, _account);
        IRewardTracker(bonusOpenTracker).unstakeForAccount(_account, stakedOpenTracker, _amount, _account);
        IRewardTracker(stakedOpenTracker).unstakeForAccount(_account, _token, _amount, _account);

        if (_shouldReduceBnOpen) {
            uint256 bnOpenAmount = IRewardTracker(bonusOpenTracker).claimForAccount(_account, _account);
            if (bnOpenAmount > 0) {
                IRewardTracker(feeOpenTracker).stakeForAccount(_account, _account, bnOpen, bnOpenAmount);
            }

            uint256 stakedBnOpen = IRewardTracker(feeOpenTracker).depositBalances(_account, bnOpen);
            if (stakedBnOpen > 0) {
                uint256 reductionAmount = stakedBnOpen.mul(_amount).div(balance);
                IRewardTracker(feeOpenTracker).unstakeForAccount(_account, bnOpen, reductionAmount, _account);
                IMintable(bnOpen).burn(_account, reductionAmount);
            }
        }

        emit UnstakeOpen(_account, _token, _amount);
    }
}
