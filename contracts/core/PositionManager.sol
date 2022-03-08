// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../tokens/interfaces/IWETH.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/Address.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IRouter.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IOrderBook.sol";
import "./interfaces/IPositionManager.sol";

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract PositionManager is ReentrancyGuard, Governable, IPositionManager {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    struct IncreasePositionRequest {
        address account;
        address[] path;
        address indexToken;
        uint256 amountIn;
        uint256 minOut;
        uint256 sizeDelta;
        bool isLong;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 blockNumber;
        bool hasCollateralInETH;
    }

    struct DecreasePositionRequest {
        address account;
        address collateralToken;
        address indexToken;
        uint256 collateralDelta;
        uint256 sizeDelta;
        bool isLong;
        address receiver;
        uint256 acceptablePrice;
        uint256 executionFee;
        uint256 blockNumber;
        bool withdrawETH;
    }

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public admin;

    address public vault;
    address public router;
    address public orderBook;
    address public weth;
    uint256 public depositFee;
    uint256 public minExecutionFee;

    uint256 public minBlockDelayKeeper;
    uint256 public minBlockDelayPublic;

    // max deviation from primary price
    uint256 public maxDeviationBasisPoints;

    bool public inLegacyMode;
    bool public isLeverageEnabled;

    mapping (address => uint256) public feeReserves;

    mapping (address => bool) public isPositionKeeper;
    mapping (address => bool) public isOrderKeeper;
    mapping (address => bool) public isPartner;

    mapping (address => uint256) public increasePositionsIndex;
    mapping (bytes32 => IncreasePositionRequest) public increasePositionRequests;

    mapping (address => uint256) public decreasePositionsIndex;
    mapping (bytes32 => DecreasePositionRequest) public decreasePositionRequests;

    bytes32[] pendingIncreasePositionRequests;
    bytes32[] pendingDecreasePositionRequests;

    event CreateIncreasePosition(
        address indexed account,
        address[] path,
        address indexToken,
        uint256 amountIn,
        uint256 minOut,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice,
        uint256 executionFee,
        uint256 index,
        uint256 blockNumber
    );

    event CreateDecreasePosition(
        address indexed account,
        address collateralToken,
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        address receiver,
        uint256 acceptablePrice,
        uint256 executionFee,
        uint256 index,
        uint256 blockNumber
    );

    event SetPositionKeeper(address indexed account, bool isActive);
    event SetOrderKeeper(address indexed account, bool isActive);
    event SetDepositFee(uint256 depositFee);
    event SetMinExecutionFee(uint256 minExecutionFee);
    event SetInLegacyMode(bool inLegacyMode);
    event SetIsLeverageEnabled(bool isLeverageEnabled);
    event SetPartner(address account, bool isActive);
    event SetMinBlockDelay(uint256 minBlockDelayKeeper, uint256 minBlockDelayPublic);
    event SetAdmin(address admin);

    modifier onlyOrderKeeper() {
        require(isOrderKeeper[msg.sender], "PositionManager: forbidden");
        _;
    }

    modifier onlyPartnersOrLegacyMode() {
        require(isPartner[msg.sender] || inLegacyMode, "PositionManager: forbidden");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "PositionManager: forbidden");
        _;
    }

    constructor(
        address _vault,
        address _router,
        address _orderBook,
        address _weth,
        uint256 _depositFee,
        uint256 _minExecutionFee
    ) public {
        vault = _vault;
        router = _router;
        orderBook = _orderBook;
        weth = _weth;
        depositFee = _depositFee;
        minExecutionFee = _minExecutionFee;
    }

    function setPositionKeeper(address _account, bool _isActive) external onlyAdmin {
        isPositionKeeper[_account] = _isActive;
        emit SetPositionKeeper(_account, _isActive);
    }

    function setOrderKeeper(address _account, bool _isActive) external onlyAdmin {
        isOrderKeeper[_account] = _isActive;
        emit SetOrderKeeper(_account, _isActive);
    }

    function setDepositFee(uint256 _depositFee) external onlyAdmin {
        depositFee = _depositFee;
        emit SetDepositFee(_depositFee);
    }

    function setMinExecutionFee(uint256 _minExecutionFee) external onlyAdmin {
        minExecutionFee = _minExecutionFee;
        emit SetMinExecutionFee(_minExecutionFee);
    }

    function setInLegacyMode(bool _inLegacyMode) external onlyAdmin {
        inLegacyMode = _inLegacyMode;
        emit SetInLegacyMode(_inLegacyMode);
    }

    function setIsLeverageEnabled(bool _isLeverageEnabled) external onlyAdmin {
        isLeverageEnabled = _isLeverageEnabled;
        emit SetIsLeverageEnabled(_isLeverageEnabled);
    }

    function setPartner(address _account, bool _isActive) external onlyAdmin {
        isPartner[_account] = _isActive;
        emit SetPartner(_account, _isActive);
    }

    function setMinBlockDelay(uint256 _minBlockDelayKeeper, uint256 _minBlockDelayPublic) external onlyAdmin {
        minBlockDelayKeeper = _minBlockDelayKeeper;
        minBlockDelayPublic = _minBlockDelayPublic;
        emit SetMinBlockDelay(minBlockDelayKeeper, minBlockDelayPublic);
    }

    function setAdmin(address _admin) external onlyGov {
        admin = _admin;
        emit SetAdmin(_admin);
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyGov {
        IERC20(_token).approve(_spender, _amount);
    }

    function withdrawFees(address _token, address _receiver) external onlyGov {
        uint256 amount = feeReserves[_token];
        if (amount == 0) { return; }

        feeReserves[_token] = 0;
        IERC20(_token).safeTransfer(_receiver, amount);
    }

    function executeIncreasePositions(uint256 _count) external override {
        for (uint256 i = 0; i < _count; i++) {
            if (pendingIncreasePositionRequests.length == 0) {
                break;
            }

            uint256 index = pendingIncreasePositionRequests.length - i - 1;
            bytes32 key = pendingIncreasePositionRequests[index];
            pendingDecreasePositionRequests.pop();

            try this.executeIncreasePosition(key) {
            } catch {
                this.cancelIncreasePosition(key);
            }
        }
    }

    function executeDecreasePositions(uint256 _count) external override {
        for (uint256 i = 0; i < _count; i++) {
            if (pendingDecreasePositionRequests.length == 0) {
                break;
            }

            uint256 index = pendingDecreasePositionRequests.length - i - 1;
            bytes32 key = pendingDecreasePositionRequests[index];
            pendingDecreasePositionRequests.pop();

            try this.executeDecreasePosition(key) {
            } catch {
                this.cancelDecreasePosition(key);
            }
        }
    }

    function createIncreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionManager: invalid executionFee");
        require(msg.value == _executionFee, "PositionManager: invalid msg.value");

        if (_amountIn > 0) {
            IRouter(router).pluginTransfer(_path[0], msg.sender, address(this), _amountIn);
        }

        _createIncreasePosition(
            msg.sender,
            _path,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _acceptablePrice,
            _executionFee,
            false
        );
    }

    function createIncreasePositionETH(
        address[] memory _path,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionManager: invalid executionFee");
        require(msg.value >= _executionFee, "PositionManager: invalid msg.value");
        require(_path[0] == weth, "Router: invalid _path");

        uint256 amountIn = msg.value.sub(_executionFee);
        IWETH(weth).deposit{ value: amountIn }();

        _createIncreasePosition(
            msg.sender,
            _path,
            _indexToken,
            amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _acceptablePrice,
            _executionFee,
            true
        );
    }

    function createDecreasePosition(
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bool _withdrawETH
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionManager: invalid executionFee");
        require(msg.value == _executionFee, "PositionManager: invalid msg.value");

        _createDecreasePosition(
            msg.sender,
            _collateralToken,
            _indexToken,
            _collateralDelta,
            _sizeDelta,
            _isLong,
            _receiver,
            _acceptablePrice,
            _executionFee,
            _withdrawETH
        );
    }

    function executeIncreasePosition(bytes32 _key) public nonReentrant {
        IncreasePositionRequest memory request = increasePositionRequests[_key];
        require(request.account != address(0), "PositionManager: request does not exist");
        _validateExecution(request.blockNumber);

        delete increasePositionRequests[_key];

       if (request.amountIn > 0) {
           uint256 amountIn = request.amountIn;

           if (request.path.length == 2) {
               IERC20(request.path[0]).safeTransfer(vault, request.amountIn);
               amountIn = _swap(request.path, request.minOut, address(this));
           }

           uint256 afterFeeAmount = _getAfterFeeAmount(msg.sender, request.path, amountIn, request.indexToken, request.isLong, request.sizeDelta);
           IERC20(request.path[request.path.length - 1]).safeTransfer(vault, afterFeeAmount);
       }

       _increasePosition(request.path[request.path.length - 1], request.indexToken, request.sizeDelta, request.isLong, request.acceptablePrice);

        msg.sender.sendValue(request.executionFee);
    }

    function cancelIncreasePosition(bytes32 _key) public nonReentrant {
        IncreasePositionRequest memory request = increasePositionRequests[_key];
        require(request.account != address(0), "PositionManager: request does not exist");
        _validateCancellation(request.blockNumber);

        delete increasePositionRequests[_key];

        if (request.hasCollateralInETH) {
            _transferOutETH(request.amountIn, payable(request.account));
        } else {
            IERC20(request.path[0]).safeTransfer(request.account, request.amountIn);
        }

        msg.sender.sendValue(request.executionFee);
    }

    function executeDecreasePosition(bytes32 _key) public nonReentrant {
        DecreasePositionRequest memory request = decreasePositionRequests[_key];
        require(request.account != address(0), "PositionManager: request does not exist");
        _validateExecution(request.blockNumber);

        delete decreasePositionRequests[_key];

        if (request.withdrawETH) {
           uint256 amountOut = _decreasePosition(request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, address(this), request.acceptablePrice);
           _transferOutETH(amountOut, payable(request.receiver));
        } else {
           _decreasePosition(request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, request.receiver, request.acceptablePrice);
        }

        msg.sender.sendValue(request.executionFee);
    }

    function cancelDecreasePosition(bytes32 _key) public nonReentrant {
        DecreasePositionRequest memory request = decreasePositionRequests[_key];
        require(request.account != address(0), "PositionManager: request does not exist");
        _validateCancellation(request.blockNumber);

        delete decreasePositionRequests[_key];
        msg.sender.sendValue(request.executionFee);
    }

    function executeSwapOrder(address _account, uint256 _orderIndex, address payable _feeReceiver) external onlyOrderKeeper {
        IOrderBook(orderBook).executeSwapOrder(_account, _orderIndex, _feeReceiver);
    }

    function executeIncreaseOrder(address _address, uint256 _orderIndex, address payable _feeReceiver) external onlyOrderKeeper {
        _validateIncreaseOrder(_address, _orderIndex);

        address _vault = vault;
        address timelock = IVault(_vault).gov();

        ITimelock(timelock).enableLeverage(_vault);
        IOrderBook(orderBook).executeIncreaseOrder(_address, _orderIndex, _feeReceiver);
        ITimelock(timelock).disableLeverage(_vault);
    }

    function executeDecreaseOrder(address _address, uint256 _orderIndex, address payable _feeReceiver) external onlyOrderKeeper {
        address _vault = vault;
        address timelock = IVault(_vault).gov();

        ITimelock(timelock).enableLeverage(_vault);
        IOrderBook(orderBook).executeDecreaseOrder(_address, _orderIndex, _feeReceiver);
        ITimelock(timelock).disableLeverage(_vault);
    }

    function increasePosition(
       address[] memory _path,
       address _indexToken,
       uint256 _amountIn,
       uint256 _minOut,
       uint256 _sizeDelta,
       bool _isLong,
       uint256 _price
   ) external nonReentrant onlyPartnersOrLegacyMode {
       if (_amountIn > 0) {
           if (_path.length > 1) {
               IRouter(router).pluginTransfer(_path[0], msg.sender, vault, _amountIn);
               _amountIn = _swap(_path, _minOut, address(this));
           } else {
               IRouter(router).pluginTransfer(_path[0], msg.sender, address(this), _amountIn);
           }

           uint256 afterFeeAmount = _getAfterFeeAmount(msg.sender, _path, _amountIn, _indexToken, _isLong, _sizeDelta);
           IERC20(_path[_path.length - 1]).safeTransfer(vault, afterFeeAmount);
       }

       _increasePosition(_path[_path.length - 1], _indexToken, _sizeDelta, _isLong, _price);
   }

    function increasePositionETH(
        address[] memory _path,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price
    ) external payable nonReentrant onlyPartnersOrLegacyMode {
        require(_path[0] == weth, "PositionManager: invalid _path");

        if (msg.value > 0) {
            uint256 _amountIn = msg.value;
            if (_path.length > 1) {
                IWETH(weth).deposit{value: msg.value}();
                IERC20(weth).safeTransfer(vault, msg.value);
                _amountIn = _swap(_path, _minOut, address(this));
            } else {
                IWETH(weth).deposit{value: msg.value}();
            }

            uint256 afterFeeAmount = _getAfterFeeAmount(msg.sender, _path, _amountIn, _indexToken, _isLong, _sizeDelta);
            IERC20(_path[_path.length - 1]).safeTransfer(vault, afterFeeAmount);
        }

        _increasePosition(_path[_path.length - 1], _indexToken, _sizeDelta, _isLong, _price);
    }

    function decreasePosition(
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        uint256 _price
    ) external nonReentrant onlyPartnersOrLegacyMode {
        _decreasePosition(_collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, _receiver, _price);
    }

    function decreasePositionETH(
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address payable _receiver,
        uint256 _price
    ) external nonReentrant onlyPartnersOrLegacyMode {
        uint256 amountOut = _decreasePosition(_collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, address(this), _price);
        _transferOutETH(amountOut, _receiver);
    }

    function getRequestKey(address _account, uint256 _index) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _index));
    }

    function _validateExecution(uint256 positionBlockNumber) internal view {
        if (!isLeverageEnabled && msg.sender != address(this)) {
            revert("PositionManager: forbidden");
        }
        uint256 minBlockDelay = msg.sender == address(this) ? minBlockDelayKeeper : minBlockDelayPublic;
        require(positionBlockNumber.add(minBlockDelay) <= block.number, "PositionManager: min blocks not yet passed");
    }

    function _validateCancellation(uint256 positionBlockNumber) internal view {
        if (!isLeverageEnabled && msg.sender != address(this)) {
            revert("PositionManager: forbidden");
        }
        uint256 minBlockDelay = msg.sender == address(this) ? minBlockDelayKeeper : minBlockDelayPublic;
        require(positionBlockNumber.add(minBlockDelay) <= block.number, "PositionManager: min blocks not yet passed");
    }

    function _createIncreasePosition(
        address _account,
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bool _hasCollateralInETH
    ) internal {
        require(_path.length == 1 || _path.length == 2, "PositionManager: invalid _path");

        uint256 index = increasePositionsIndex[_account].add(1);
        increasePositionsIndex[_account] = index;

        IncreasePositionRequest memory request = IncreasePositionRequest(
            _account,
            _path,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _acceptablePrice,
            _executionFee,
            block.number,
            _hasCollateralInETH
        );

        bytes32 key = getRequestKey(_account, index);
        increasePositionRequests[key] = request;

        emit CreateIncreasePosition(
            _account,
            _path,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _acceptablePrice,
            _executionFee,
            index,
            block.number
        );
    }

    function _createDecreasePosition(
        address _account,
        address _collateralToken,
        address _indexToken,
        uint256 _collateralDelta,
        uint256 _sizeDelta,
        bool _isLong,
        address _receiver,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bool _withdrawETH
    ) internal {
        uint256 index = decreasePositionsIndex[_account].add(1);
        decreasePositionsIndex[_account] = index;

        DecreasePositionRequest memory request = DecreasePositionRequest(
            _account,
            _collateralToken,
            _indexToken,
            _collateralDelta,
            _sizeDelta,
            _isLong,
            _receiver,
            _acceptablePrice,
            _executionFee,
            block.number,
            _withdrawETH
        );

        bytes32 key = getRequestKey(_account, index);
        decreasePositionRequests[key] = request;

        emit CreateDecreasePosition(
            _account,
            _collateralToken,
            _indexToken,
            _collateralDelta,
            _sizeDelta,
            _isLong,
            _receiver,
            _acceptablePrice,
            _executionFee,
            index,
            block.number
        );
    }

    function _validateIncreaseOrder(address _account, uint256 _orderIndex) internal view {
        (
            address _purchaseToken,
            uint256 _purchaseTokenAmount,
            address _collateralToken,
            address _indexToken,
            uint256 _sizeDelta,
            bool _isLong,
            , // triggerPrice
            , // triggerAboveThreshold
            // executionFee
        ) = IOrderBook(orderBook).getIncreaseOrder(_account, _orderIndex);

        // shorts are okay
        if (!_isLong) { return; }

        // if the position size is not increasing, this is a collateral deposit
        require(_sizeDelta > 0, "OrderExecutor: long deposit");

        IVault _vault = IVault(vault);
        (uint256 size, uint256 collateral, , , , , , ) = _vault.getPosition(_account, _collateralToken, _indexToken, _isLong);

        // if there is no existing position, do not charge a fee
        if (size == 0) { return; }

        uint256 nextSize = size.add(_sizeDelta);
        uint256 collateralDelta = _vault.tokenToUsdMin(_purchaseToken, _purchaseTokenAmount);
        uint256 nextCollateral = collateral.add(collateralDelta);

        uint256 prevLeverage = size.mul(BASIS_POINTS_DIVISOR).div(collateral);
        // add 100 to allow for a maximum of a 1% decrease since there might be some swap fees taken from the collateral
        uint256 nextLeverageWithBuffer = nextSize.mul(BASIS_POINTS_DIVISOR + 100).div(nextCollateral);

        require(nextLeverageWithBuffer >= prevLeverage, "OrderExecutor: long leverage decrease");
    }

    function _increasePosition(address _collateralToken, address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _price) private {
        address _vault = vault;

        if (_isLong) {
            require(IVault(_vault).getMaxPrice(_indexToken) <= _price, "PositionManager: mark price higher than limit");
        } else {
            require(IVault(_vault).getMinPrice(_indexToken) >= _price, "PositionManager: mark price lower than limit");
        }

        address timelock = IVault(_vault).gov();

        ITimelock(timelock).setIsLeverageEnabled(_vault, true);
        IRouter(router).pluginIncreasePosition(msg.sender, _collateralToken, _indexToken, _sizeDelta, _isLong);
        ITimelock(timelock).setIsLeverageEnabled(_vault, false);
    }

    function _decreasePosition(address _collateralToken, address _indexToken, uint256 _collateralDelta, uint256 _sizeDelta, bool _isLong, address _receiver, uint256 _price) private returns (uint256) {
        address _vault = vault;

        if (_isLong) {
            require(IVault(_vault).getMinPrice(_indexToken) >= _price, "Router: mark price lower than limit");
        } else {
            require(IVault(_vault).getMaxPrice(_indexToken) <= _price, "Router: mark price higher than limit");
        }

        address timelock = IVault(vault).gov();

        ITimelock(timelock).setIsLeverageEnabled(_vault, true);
        uint256 amountOut = IVault(_vault).decreasePosition(msg.sender, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, _receiver);
        ITimelock(timelock).setIsLeverageEnabled(_vault, false);

        return amountOut;
    }

    function _swap(address[] memory _path, uint256 _minOut, address _receiver) private returns (uint256) {
        if (_path.length == 2) {
            return _vaultSwap(_path[0], _path[1], _minOut, _receiver);
        }
        revert("PositionManager: invalid _path.length");
    }

    function _vaultSwap(address _tokenIn, address _tokenOut, uint256 _minOut, address _receiver) private returns (uint256) {
        uint256 amountOut = IVault(vault).swap(_tokenIn, _tokenOut, _receiver);
        require(amountOut >= _minOut, "PositionManager: insufficient amountOut");
        return amountOut;
    }

    function _transferOutETH(uint256 _amountOut, address payable _receiver) private {
        IWETH(weth).withdraw(_amountOut);
        _receiver.sendValue(_amountOut);
    }

    function _getAfterFeeAmount(
        address _account,
        address[] memory _path,
        uint256 _amountIn,
        address _indexToken,
        bool _isLong,
        uint256 _sizeDelta
    ) internal view returns (uint256) {
        bool shouldDeductFee = _shouldDeductFee(
            _account,
            _path,
            _amountIn,
            _indexToken,
            _isLong,
            _sizeDelta
        );

        if (shouldDeductFee) {
            return _amountIn.mul(BASIS_POINTS_DIVISOR.sub(depositFee)).div(BASIS_POINTS_DIVISOR);
        }

        return _amountIn;
    }

    function _shouldDeductFee(
        address _account,
        address[] memory _path,
        uint256 _amountIn,
        address _indexToken,
        bool _isLong,
        uint256 _sizeDelta
    ) internal view returns (bool) {
        // if the position is a short, do not charge a fee
        if (!_isLong) { return false; }

        // if the position size is not increasing, this is a collateral deposit
        if (_sizeDelta == 0) { return true; }

        address collateralToken = _path[_path.length - 1];

        IVault _vault = IVault(vault);
        (uint256 size, uint256 collateral, , , , , , ) = _vault.getPosition(_account, collateralToken, _indexToken, _isLong);

        // if there is no existing position, do not charge a fee
        if (size == 0) { return false; }

        uint256 nextSize = size.add(_sizeDelta);
        uint256 collateralDelta = _vault.tokenToUsdMin(collateralToken, _amountIn);
        uint256 nextCollateral = collateral.add(collateralDelta);

        uint256 prevLeverage = size.mul(BASIS_POINTS_DIVISOR).div(collateral);
        uint256 nextLeverage = nextSize.mul(BASIS_POINTS_DIVISOR + 1).div(nextCollateral);

        return nextLeverage < prevLeverage;
    }
}
