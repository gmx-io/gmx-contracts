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

    struct IncreasePosition {
        address account;
        address purchaseToken;
        address collateralToken;
        address indexToken;
        uint256 amountIn;
        uint256 minOut;
        uint256 sizeDelta;
        bool isLong;
        uint256 price;
        uint256 executionFee;
    }

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public vault;
    address public router;
    address public orderBook;
    address public weth;
    uint256 public depositFee;
    uint256 public minExecutionFee;

    bool public inLegacyMode;

    mapping (address => bool) public isPositionKeeper;
    mapping (address => bool) public isOrderKeeper;
    mapping (address => bool) public isPartner;

    mapping (address => uint256) public increasePositionsIndex;
    mapping (address => mapping(uint256 => IncreasePosition)) public increasePositions;

    event CreateIncreasePosition(
        address indexed account,
        address purchaseToken,
        address collateralToken,
        address indexToken,
        uint256 amountIn,
        uint256 minOut,
        uint256 sizeDelta,
        bool isLong,
        uint256 price,
        uint256 executionFee,
        uint256 index
    );

    modifier onlyPositionKeeper() {
        require(isPositionKeeper[msg.sender], "PositionManager: forbidden");
        _;
    }

    modifier onlyOrderKeeper() {
        require(isOrderKeeper[msg.sender], "PositionManager: forbidden");
        _;
    }

    modifier onlyPartners() {
        require(inLegacyMode || isPartner[msg.sender], "PositionManager: forbidden");
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

    function setPositionKeeper(address _account, bool _isActive) external onlyGov {
        isPositionKeeper[_account] = _isActive;
    }

    function setOrderKeeper(address _account, bool _isActive) external onlyGov {
        isOrderKeeper[_account] = _isActive;
    }

    function setDepositFee(uint256 _depositFee) external onlyGov {
        depositFee = _depositFee;
    }

    function setMinExecutionFee(uint256 _minExecutionFee) external onlyGov {
        minExecutionFee = _minExecutionFee;
    }

    function setInLegacyMode(bool _inLegacyMode) external onlyGov {
        inLegacyMode = _inLegacyMode;
    }

    function setPartner(address _account, bool _isActive) external onlyGov {
        isPartner[_account] = _isActive;
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyGov {
        IERC20(_token).approve(_spender, _amount);
    }

    function createIncreasePosition(
        address _purchaseToken,
        address _collateralToken,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price,
        uint256 _executionFee
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionManager: invalid executionFee");
        require(msg.value == _executionFee, "PositionManager: invalid msg.value");

        if (_amountIn > 0) {
            IRouter(router).pluginTransfer(_purchaseToken, msg.sender, address(this), _amountIn);
        }

        _createIncreasePosition(
            msg.sender,
            _purchaseToken,
            _collateralToken,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _price,
            _executionFee
        );
    }

    function createIncreasePositionETH(
        address _collateralToken,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price,
        uint256 _executionFee
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionManager: invalid executionFee");
        require(msg.value >= _executionFee, "PositionManager: invalid msg.value");

        uint256 amountIn = msg.value.sub(_executionFee);

        _createIncreasePosition(
            msg.sender,
            weth,
            _collateralToken,
            _indexToken,
            amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _price,
            _executionFee
        );
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
   ) external nonReentrant onlyPartners {
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
    ) external payable nonReentrant onlyPartners {
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
    ) external nonReentrant onlyPartners {
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
    ) external nonReentrant onlyPartners {
        uint256 amountOut = _decreasePosition(_collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, address(this), _price);
        _transferOutETH(amountOut, _receiver);
    }

    function _createIncreasePosition(
        address _account,
        address _purchaseToken,
        address _collateralToken,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price,
        uint256 _executionFee
    ) internal {
        uint256 index = increasePositionsIndex[_account].add(1);
        increasePositionsIndex[_account] = index;

        IncreasePosition memory position = IncreasePosition(
            _account,
            _purchaseToken,
            _collateralToken,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _price,
            _executionFee
        );

        increasePositions[_account][index] = position;

        emit CreateIncreasePosition(
            _account,
            _purchaseToken,
            _collateralToken,
            _indexToken,
            _amountIn,
            _minOut,
            _sizeDelta,
            _isLong,
            _price,
            _executionFee,
            index
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
