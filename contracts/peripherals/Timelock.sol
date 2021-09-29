// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./interfaces/ITimelockTarget.sol";
import "./interfaces/ITimelock.sol";
import "./interfaces/IHandlerTarget.sol";
import "../access/interfaces/IAdmin.sol";
import "../core/interfaces/IVault.sol";
import "../core/interfaces/IVaultPriceFeed.sol";
import "../core/interfaces/IRouter.sol";
import "../tokens/interfaces/IYieldToken.sol";
import "../tokens/interfaces/IBaseToken.sol";
import "../tokens/interfaces/IMintable.sol";
import "../staking/interfaces/IVester.sol";

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

contract Timelock is ITimelock {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;
    uint256 public constant MAX_BUFFER = 5 days;
    uint256 public constant MAX_FEE_BASIS_POINTS = 300; // 3%

    uint256 public buffer;
    address public admin;

    address public tokenManager;
    address public rewardManager;
    address public mintReceiver;
    uint256 public maxTokenSupply;

    mapping (bytes32 => uint256) public pendingActions;
    mapping (address => bool) public excludedTokens;

    event SignalPendingAction(bytes32 action);
    event SignalApprove(address token, address spender, uint256 amount, bytes32 action);
    event SignalMint(address token, address receiver, uint256 amount, bytes32 action);
    event SignalSetGov(address target, address gov, bytes32 action);
    event SignalSetHandler(address target, address handler, bool isActive, bytes32 action);
    event SignalSetPriceFeed(address vault, address priceFeed, bytes32 action);
    event SignalAddPlugin(address router, address plugin, bytes32 action);
    event SignalVaultSetTokenConfig(
        address vault,
        address token,
        uint256 tokenDecimals,
        uint256 tokenWeight,
        uint256 minProfitBps,
        uint256 maxUsdgAmount,
        bool isStable,
        bool isShortable
    );
    event ClearAction(bytes32 action);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Timelock: forbidden");
        _;
    }

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "Timelock: forbidden");
        _;
    }

    modifier onlyRewardManager() {
        require(msg.sender == rewardManager, "Timelock: forbidden");
        _;
    }

    constructor(
        address _admin,
        uint256 _buffer,
        address _rewardManager,
        address _tokenManager,
        address _mintReceiver,
        uint256 _maxTokenSupply
    ) public {
        require(_buffer <= MAX_BUFFER, "Timelock: invalid _buffer");
        admin = _admin;
        buffer = _buffer;
        rewardManager = _rewardManager;
        tokenManager = _tokenManager;
        mintReceiver = _mintReceiver;
        maxTokenSupply = _maxTokenSupply;
    }

    function setAdmin(address _admin) external override onlyTokenManager {
        admin = _admin;
    }

    function setExternalAdmin(address _target, address _admin) external onlyAdmin {
        require(_target != address(this), "Timelock: invalid _target");
        IAdmin(_target).setAdmin(_admin);
    }

    function setBuffer(uint256 _buffer) external onlyAdmin {
        require(_buffer <= MAX_BUFFER, "Timelock: invalid _buffer");
        require(_buffer > buffer, "Timelock: buffer cannot be decreased");
        buffer = _buffer;
    }

    function mint(address _token, uint256 _amount) external onlyAdmin {
        _mint(_token, mintReceiver, _amount);
    }

    function setFees(
        address _vault,
        uint256 _taxBasisPoints,
        uint256 _stableTaxBasisPoints,
        uint256 _mintBurnFeeBasisPoints,
        uint256 _swapFeeBasisPoints,
        uint256 _stableSwapFeeBasisPoints,
        uint256 _marginFeeBasisPoints,
        uint256 _liquidationFeeUsd,
        uint256 _minProfitTime,
        bool _hasDynamicFees
    ) external onlyAdmin {
        require(_taxBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _taxBasisPoints");
        require(_stableTaxBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _stableTaxBasisPoints");
        require(_mintBurnFeeBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _mintBurnFeeBasisPoints");
        require(_swapFeeBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _swapFeeBasisPoints");
        require(_stableSwapFeeBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _stableSwapFeeBasisPoints");
        require(_marginFeeBasisPoints < MAX_FEE_BASIS_POINTS, "Timelock: invalid _marginFeeBasisPoints");
        require(_liquidationFeeUsd < 10 * PRICE_PRECISION, "Timelock: invalid _liquidationFeeUsd");

        IVault(_vault).setFees(
            _taxBasisPoints,
            _stableTaxBasisPoints,
            _mintBurnFeeBasisPoints,
            _swapFeeBasisPoints,
            _stableSwapFeeBasisPoints,
            _marginFeeBasisPoints,
            _liquidationFeeUsd,
            _minProfitTime,
            _hasDynamicFees
        );
    }

    function setTokenConfig(
        address _vault,
        address _token,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdgAmount
    ) external onlyAdmin {
        require(_minProfitBps <= 500, "Timelock: invalid _minProfitBps");

        IVault vault = IVault(_vault);
        require(vault.whitelistedTokens(_token), "Timelock: token not yet whitelisted");

        uint256 tokenDecimals = vault.tokenDecimals(_token);
        bool isStable = vault.stableTokens(_token);
        bool isShortable = vault.shortableTokens(_token);

        IVault(_vault).setTokenConfig(
            _token,
            tokenDecimals,
            _tokenWeight,
            _minProfitBps,
            _maxUsdgAmount,
            isStable,
            isShortable
        );
    }

    function removeAdmin(address _token, address _account) external onlyAdmin {
        IYieldToken(_token).removeAdmin(_account);
    }

    function setBufferAmount(address _vault, address _token, uint256 _amount) external onlyAdmin {
        IVault(_vault).setBufferAmount(_token, _amount);
    }

    function setIsAmmEnabled(address _priceFeed, bool _isEnabled) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setIsAmmEnabled(_isEnabled);
    }

    function setIsSecondaryPriceEnabled(address _priceFeed, bool _isEnabled) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setIsSecondaryPriceEnabled(_isEnabled);
    }

    function setMaxStrictPriceDeviation(address _priceFeed, uint256 _maxStrictPriceDeviation) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setMaxStrictPriceDeviation(_maxStrictPriceDeviation);
    }

    function setUseV2Pricing(address _priceFeed, bool _useV2Pricing) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setUseV2Pricing(_useV2Pricing);
    }

    function setAdjustment(address _priceFeed, address _token, bool _isAdditive, uint256 _adjustmentBps) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setAdjustment(_token, _isAdditive, _adjustmentBps);
    }

    function setSpreadBasisPoints(address _priceFeed, address _token, uint256 _spreadBasisPoints) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setSpreadBasisPoints(_token, _spreadBasisPoints);
    }

    function setSpreadThresholdBasisPoints(address _priceFeed, uint256 _spreadThresholdBasisPoints) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setSpreadThresholdBasisPoints(_spreadThresholdBasisPoints);
    }

    function setFavorPrimaryPrice(address _priceFeed, bool _favorPrimaryPrice) external onlyAdmin {
        IVaultPriceFeed(_priceFeed).setFavorPrimaryPrice(_favorPrimaryPrice);
    }

    function setPriceSampleSpace(address _priceFeed,uint256 _priceSampleSpace) external onlyAdmin {
        require(_priceSampleSpace <= 5, "Invalid _priceSampleSpace");
        IVaultPriceFeed(_priceFeed).setPriceSampleSpace(_priceSampleSpace);
    }

    function setIsSwapEnabled(address _vault, bool _isSwapEnabled) external onlyAdmin {
        IVault(_vault).setIsSwapEnabled(_isSwapEnabled);
    }

    function setIsLeverageEnabled(address _vault, bool _isLeverageEnabled) external onlyAdmin {
        IVault(_vault).setIsLeverageEnabled(_isLeverageEnabled);
    }

    function setMaxGasPrice(address _vault,uint256 _maxGasPrice) external onlyAdmin {
        require(_maxGasPrice > 5000000000, "Invalid _maxGasPrice");
        IVault(_vault).setMaxGasPrice(_maxGasPrice);
    }

    function withdrawFees(address _vault,address _token, address _receiver) external onlyAdmin {
        IVault(_vault).withdrawFees(_token, _receiver);
    }

    function addExcludedToken(address _token) external onlyAdmin {
        excludedTokens[_token] = true;
    }

    function setInPrivateTransferMode(address _token, bool _inPrivateTransferMode) external onlyAdmin {
        if (excludedTokens[_token]) {
            // excludedTokens can only have their transfers enabled
            require(_inPrivateTransferMode == false, "Timelock: invalid _inPrivateTransferMode");
        }

        IBaseToken(_token).setInPrivateTransferMode(_inPrivateTransferMode);
    }

    function managedSetHandler(address _target, address _handler, bool _isActive) external override onlyRewardManager {
        IHandlerTarget(_target).setHandler(_handler, _isActive);
    }

    function managedSetMinter(address _target, address _minter, bool _isActive) external override onlyRewardManager {
        IMintable(_target).setMinter(_minter, _isActive);
    }

    function batchSetBonusRewards(address _vester, address[] memory _accounts, uint256[] memory _amounts) external onlyAdmin {
        require(_accounts.length == _amounts.length, "Timelock: invalid lengths");

        if (!IHandlerTarget(_vester).isHandler(address(this))) {
            IHandlerTarget(_vester).setHandler(address(this), true);
        }

        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            uint256 amount = _amounts[i];
            IVester(_vester).setBonusRewards(account, amount);
        }
    }

    function transferIn(address _sender, address _token, uint256 _amount) external onlyAdmin {
        IERC20(_token).transferFrom(_sender, address(this), _amount);
    }

    function signalApprove(address _token, address _spender, uint256 _amount) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("approve", _token, _spender, _amount));
        _setPendingAction(action);
        emit SignalApprove(_token, _spender, _amount, action);
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("approve", _token, _spender, _amount));
        _validateAction(action);
        _clearAction(action);
        IERC20(_token).approve(_spender, _amount);
    }

    function signalMint(address _token, address _receiver, uint256 _amount) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("mint", _token, _receiver, _amount));
        _setPendingAction(action);
        emit SignalMint(_token, _receiver, _amount, action);
    }

    function processMint(address _token, address _receiver, uint256 _amount) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("mint", _token, _receiver, _amount));
        _validateAction(action);
        _clearAction(action);

        _mint(_token, _receiver, _amount);
    }

    function signalSetGov(address _target, address _gov) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setGov", _target, _gov));
        _setPendingAction(action);
        emit SignalSetGov(_target, _gov, action);
    }

    function setGov(address _target, address _gov) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setGov", _target, _gov));
        _validateAction(action);
        _clearAction(action);
        ITimelockTarget(_target).setGov(_gov);
    }

    function signalSetHandler(address _target, address _handler, bool _isActive) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setHandler", _target, _handler, _isActive));
        _setPendingAction(action);
        emit SignalSetHandler(_target, _handler, _isActive, action);
    }

    function setHandler(address _target, address _handler, bool _isActive) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setHandler", _target, _handler, _isActive));
        _validateAction(action);
        _clearAction(action);
        IHandlerTarget(_target).setHandler(_handler, _isActive);
    }

    function signalSetPriceFeed(address _vault, address _priceFeed) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setPriceFeed", _vault, _priceFeed));
        _setPendingAction(action);
        emit SignalSetPriceFeed(_vault, _priceFeed, action);
    }

    function setPriceFeed(address _vault, address _priceFeed) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("setPriceFeed", _vault, _priceFeed));
        _validateAction(action);
        _clearAction(action);
        IVault(_vault).setPriceFeed(_priceFeed);
    }

    function signalAddPlugin(address _router, address _plugin) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("addPlugin", _router, _plugin));
        _setPendingAction(action);
        emit SignalAddPlugin(_router, _plugin, action);
    }

    function addPlugin(address _router, address _plugin) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked("addPlugin", _router, _plugin));
        _validateAction(action);
        _clearAction(action);
        IRouter(_router).addPlugin(_plugin);
    }

    function signalVaultSetTokenConfig(
        address _vault,
        address _token,
        uint256 _tokenDecimals,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdgAmount,
        bool _isStable,
        bool _isShortable
    ) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked(
            "vaultSetTokenConfig",
            _vault,
            _token,
            _tokenDecimals,
            _tokenWeight,
            _minProfitBps,
            _maxUsdgAmount,
            _isStable,
            _isShortable
        ));

        _setPendingAction(action);

        emit SignalVaultSetTokenConfig(
            _vault,
            _token,
            _tokenDecimals,
            _tokenWeight,
            _minProfitBps,
            _maxUsdgAmount,
            _isStable,
            _isShortable
        );
    }

    function vaultSetTokenConfig(
        address _vault,
        address _token,
        uint256 _tokenDecimals,
        uint256 _tokenWeight,
        uint256 _minProfitBps,
        uint256 _maxUsdgAmount,
        bool _isStable,
        bool _isShortable
    ) external onlyAdmin {
        bytes32 action = keccak256(abi.encodePacked(
            "vaultSetTokenConfig",
            _vault,
            _token,
            _tokenDecimals,
            _tokenWeight,
            _minProfitBps,
            _maxUsdgAmount,
            _isStable,
            _isShortable
        ));

        _validateAction(action);
        _clearAction(action);

        IVault(_vault).setTokenConfig(
            _token,
            _tokenDecimals,
            _tokenWeight,
            _minProfitBps,
            _maxUsdgAmount,
            _isStable,
            _isShortable
        );
    }

    function cancelAction(bytes32 _action) external onlyAdmin {
        _clearAction(_action);
    }

    function _mint(address _token, address _receiver, uint256 _amount) private {
        IMintable mintable = IMintable(_token);

        if (!mintable.isMinter(address(this))) {
            mintable.setMinter(address(this), true);
        }

        mintable.mint(_receiver, _amount);
        require(IERC20(_token).totalSupply() <= maxTokenSupply, "Timelock: maxTokenSupply exceeded");
    }

    function _setPendingAction(bytes32 _action) private {
        pendingActions[_action] = block.timestamp.add(buffer);
        emit SignalPendingAction(_action);
    }

    function _validateAction(bytes32 _action) private view {
        require(pendingActions[_action] != 0, "Timelock: action not signalled");
        require(pendingActions[_action] < block.timestamp, "Timelock: action time not yet passed");
    }

    function _clearAction(bytes32 _action) private {
        require(pendingActions[_action] != 0, "Timelock: invalid _action");
        delete pendingActions[_action];
        emit ClearAction(_action);
    }
}
