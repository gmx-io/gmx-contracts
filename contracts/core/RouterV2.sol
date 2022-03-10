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
import "./interfaces/IRouterV2.sol";

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract RouterV2 is ReentrancyGuard, Governable, IRouterV2 {
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
        uint256 blockTime;
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
        uint256 blockTime;
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

    uint256 public maxTimeDelay;
    uint256 public minBlockDelayKeeper;
    uint256 public minTimeDelayPublic;

    bool public inLegacyMode;
    bool public isLeverageEnabled;

    bytes32[] increasePositionRequestKeys;
    bytes32[] decreasePositionRequestKeys;

    mapping (address => uint256) public feeReserves;

    mapping (address => bool) public isPositionKeeper;

    mapping (address => uint256) public increasePositionsIndex;
    mapping (bytes32 => IncreasePositionRequest) public increasePositionRequests;

    mapping (address => uint256) public decreasePositionsIndex;
    mapping (bytes32 => DecreasePositionRequest) public decreasePositionRequests;

    mapping (address => uint256) public maxGlobalLongSizes;
    mapping (address => uint256) public maxGlobalShortSizes;

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
        uint256 blockNumber,
        uint256 blockTime,
        uint256 gasPrice
    );

    event ExecuteIncreasePosition(
        address indexed account,
        address[] path,
        address indexToken,
        uint256 amountIn,
        uint256 minOut,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice,
        uint256 blockGap,
        uint256 timeGap
    );

    event CancelIncreasePosition(
        address indexed account,
        address[] path,
        address indexToken,
        uint256 amountIn,
        uint256 minOut,
        uint256 sizeDelta,
        bool isLong,
        uint256 acceptablePrice,
        uint256 blockGap,
        uint256 timeGap
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
        uint256 blockNumber,
        uint256 blockTime
    );

    event ExecuteDecreasePosition(
        address indexed account,
        address collateralToken,
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        address receiver,
        uint256 acceptablePrice,
        uint256 blockGap,
        uint256 timeGap
    );

    event CancelDecreasePosition(
        address indexed account,
        address collateralToken,
        address indexToken,
        uint256 collateralDelta,
        uint256 sizeDelta,
        bool isLong,
        address receiver,
        uint256 acceptablePrice,
        uint256 blockGap,
        uint256 timeGap
    );

    event SetPositionKeeper(address indexed account, bool isActive);
    event SetDepositFee(uint256 depositFee);
    event SetMinExecutionFee(uint256 minExecutionFee);
    event SetInLegacyMode(bool inLegacyMode);
    event SetIsLeverageEnabled(bool isLeverageEnabled);
    event SetPartner(address account, bool isActive);
    event SetDelayValues(uint256 maxTimeDelay, uint256 minBlockDelayKeeper, uint256 minTimeDelayPublic);
    event SetAdmin(address admin);

    event SetMaxGlobalSizes(
        address[] tokens,
        uint256[] longSizes,
        uint256[] shortSizes
    );

    modifier onlyPositionKeeper() {
        require(isPositionKeeper[msg.sender], "RouterV2: forbidden");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "RouterV2: forbidden");
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

    function setDelayValues(uint256 _maxTimeDelay, uint256 _minBlockDelayKeeper, uint256 _minTimeDelayPublic) external onlyAdmin {
        maxTimeDelay = _maxTimeDelay;
        minBlockDelayKeeper = _minBlockDelayKeeper;
        minTimeDelayPublic = _minTimeDelayPublic;
        emit SetDelayValues(_maxTimeDelay, _minBlockDelayKeeper, _minTimeDelayPublic);
    }

    function setMaxGlobalSizes(
        address[] memory _tokens,
        uint256[] memory _longSizes,
        uint256[] memory _shortSizes
    ) external onlyAdmin {
        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            maxGlobalLongSizes[token] = _longSizes[i];
            maxGlobalShortSizes[token] = _shortSizes[i];
        }

        emit SetMaxGlobalSizes(_tokens, _longSizes, _shortSizes);
    }

    function withdrawFees(address _token, address _receiver) external onlyAdmin {
        uint256 amount = feeReserves[_token];
        if (amount == 0) { return; }

        feeReserves[_token] = 0;
        IERC20(_token).safeTransfer(_receiver, amount);
    }

    function setAdmin(address _admin) external onlyGov {
        admin = _admin;
        emit SetAdmin(_admin);
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyGov {
        IERC20(_token).approve(_spender, _amount);
    }

    function sendValue(address payable _receiver, uint256 _amount) external onlyGov {
        _receiver.sendValue(_amount);
    }

    function executeIncreasePositions(uint256 _count, address payable _executionFeeReceiver) external override onlyPositionKeeper {
        uint256 index = increasePositionRequestKeys.length;

        if (index == 0) { return ; }

        for (uint256 i = 0; i < _count; i++) {
            index--;

            bytes32 key = increasePositionRequestKeys[index];

            try this.executeIncreasePosition(key, _executionFeeReceiver) returns (bool _wasExecuted) {
                if (_wasExecuted) {
                    increasePositionRequestKeys.pop();
                }
            } catch {
                this.cancelIncreasePosition(key, _executionFeeReceiver);
                increasePositionRequestKeys.pop();
            }

            if (index == 0) { break; }
        }
    }

    function executeDecreasePositions(uint256 _count, address payable _executionFeeReceiver) external override onlyPositionKeeper {
        uint256 index = decreasePositionRequestKeys.length;

        if (index == 0) { return; }

        for (uint256 i = 0; i < _count; i++) {
            index--;

            bytes32 key = decreasePositionRequestKeys[index];

            // if the request was executed then remove the key from the array
            // _wasExecuted can be false if the minimum number of blocks has not yet passed
            // in that case, the key is not removed and the length of the array is not changed
            // an error could be thrown if the request is too old or if the slippage is higher than what the user specified
            // in case an error was thrown, cancel the request
            try this.executeDecreasePosition(key, _executionFeeReceiver) returns (bool _wasExecuted) {
                if (_wasExecuted) {
                    decreasePositionRequestKeys.pop();
                }
            } catch {
                this.cancelDecreasePosition(key, _executionFeeReceiver);
                decreasePositionRequestKeys.pop();
            }

            if (index == 0) { break; }
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
        require(_executionFee >= minExecutionFee, "RouterV2: invalid executionFee");
        require(msg.value == _executionFee, "RouterV2: invalid msg.value");

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
        require(_executionFee >= minExecutionFee, "RouterV2: invalid executionFee");
        require(msg.value >= _executionFee, "RouterV2: invalid msg.value");
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
        require(_executionFee >= minExecutionFee, "RouterV2: invalid executionFee");
        require(msg.value == _executionFee, "RouterV2: invalid msg.value");

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

    function executeIncreasePosition(bytes32 _key, address payable _executionFeeReceiver) public nonReentrant returns (bool) {
        IncreasePositionRequest memory request = increasePositionRequests[_key];
        require(request.account != address(0), "RouterV2: request does not exist");

        bool shouldExecute = _validateExecution(request.blockNumber, request.blockTime);
        if (!shouldExecute) { return false; }

        delete increasePositionRequests[_key];

       if (request.amountIn > 0) {
           uint256 amountIn = request.amountIn;

           if (request.path.length == 2) {
               IERC20(request.path[0]).safeTransfer(vault, request.amountIn);
               amountIn = _swap(request.path, request.minOut, address(this));
           }

           uint256 afterFeeAmount = _collectFees(msg.sender, request.path, amountIn, request.indexToken, request.isLong, request.sizeDelta);
           IERC20(request.path[request.path.length - 1]).safeTransfer(vault, afterFeeAmount);
       }

       _increasePosition(request.path[request.path.length - 1], request.indexToken, request.sizeDelta, request.isLong, request.acceptablePrice);

        _executionFeeReceiver.sendValue(request.executionFee);

        emit ExecuteIncreasePosition(
            request.account,
            request.path,
            request.indexToken,
            request.amountIn,
            request.minOut,
            request.sizeDelta,
            request.isLong,
            request.acceptablePrice,
            block.number.sub(request.blockNumber),
            block.timestamp.sub(request.blockTime)
        );

        return true;
    }

    function cancelIncreasePosition(bytes32 _key, address payable _executionFeeReceiver) public nonReentrant {
        IncreasePositionRequest memory request = increasePositionRequests[_key];
        require(request.account != address(0), "RouterV2: request does not exist");

        bool shouldExecute = _validateCancellation(request.blockNumber, request.blockTime, request.account);
        if (!shouldExecute) { return; }

        delete increasePositionRequests[_key];

        if (request.hasCollateralInETH) {
            _transferOutETH(request.amountIn, payable(request.account));
        } else {
            IERC20(request.path[0]).safeTransfer(request.account, request.amountIn);
        }

        _executionFeeReceiver.sendValue(request.executionFee);

        emit CancelIncreasePosition(
            request.account,
            request.path,
            request.indexToken,
            request.amountIn,
            request.minOut,
            request.sizeDelta,
            request.isLong,
            request.acceptablePrice,
            block.number.sub(request.blockNumber),
            block.timestamp.sub(request.blockTime)
        );
    }

    function executeDecreasePosition(bytes32 _key, address payable _executionFeeReceiver) public nonReentrant returns (bool) {
        DecreasePositionRequest memory request = decreasePositionRequests[_key];
        require(request.account != address(0), "RouterV2: request does not exist");

        bool shouldExecute = _validateExecution(request.blockNumber, request.blockTime);
        if (!shouldExecute) { return false; }

        delete decreasePositionRequests[_key];

        if (request.withdrawETH) {
           uint256 amountOut = _decreasePosition(request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, address(this), request.acceptablePrice);
           _transferOutETH(amountOut, payable(request.receiver));
        } else {
           _decreasePosition(request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, request.receiver, request.acceptablePrice);
        }

        _executionFeeReceiver.sendValue(request.executionFee);

        emit ExecuteDecreasePosition(
            request.account,
            request.collateralToken,
            request.indexToken,
            request.collateralDelta,
            request.sizeDelta,
            request.isLong,
            request.receiver,
            request.acceptablePrice,
            block.number.sub(request.blockNumber),
            block.timestamp.sub(request.blockTime)
        );

        return true;
    }

    function cancelDecreasePosition(bytes32 _key, address payable _executionFeeReceiver) public nonReentrant {
        DecreasePositionRequest memory request = decreasePositionRequests[_key];
        require(request.account != address(0), "RouterV2: request does not exist");

        bool shouldExecute = _validateCancellation(request.blockNumber, request.blockTime, request.account);
        if (!shouldExecute) { return; }

        delete decreasePositionRequests[_key];
        _executionFeeReceiver.sendValue(request.executionFee);

        emit CancelDecreasePosition(
            request.account,
            request.collateralToken,
            request.indexToken,
            request.collateralDelta,
            request.sizeDelta,
            request.isLong,
            request.receiver,
            request.acceptablePrice,
            block.number.sub(request.blockNumber),
            block.timestamp.sub(request.blockTime)
        );
    }

    function getRequestKey(address _account, uint256 _index) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(_account, _index));
    }

    function getPendingRequestLenghts() public view returns (uint256, uint256) {
        return (increasePositionRequestKeys.length, decreasePositionRequestKeys.length);
    }

    function _validateExecution(uint256 _positionBlockNumber, uint256 _positionBlockTime) internal view returns (bool) {
        if (!isLeverageEnabled && msg.sender != address(this)) {
            revert("RouterV2: forbidden");
        }

        if (_positionBlockTime.add(maxTimeDelay) <= block.timestamp) {
            revert("RouterV2: request has expired");
        }

        if (msg.sender == address(this) || isPositionKeeper[msg.sender]) {
            return _positionBlockNumber.add(minBlockDelayKeeper) <= block.number;
        }

        return _positionBlockTime.add(minTimeDelayPublic) <= block.timestamp;
    }

    function _validateCancellation(uint256 _positionBlockNumber, uint256 _positionBlockTime, address _account) internal view returns (bool) {
        if (!isLeverageEnabled && msg.sender != address(this)) {
            revert("RouterV2: forbidden");
        }

        if (msg.sender == address(this) || isPositionKeeper[msg.sender]) {
            return _positionBlockNumber.add(minBlockDelayKeeper) <= block.number;
        }

        require(msg.sender == _account, "RouterV2: forbidden");

        return _positionBlockTime.add(minTimeDelayPublic) <= block.timestamp;
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
        require(_path.length == 1 || _path.length == 2, "RouterV2: invalid _path");

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
            block.timestamp,
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
            block.number,
            block.timestamp,
            tx.gasprice
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
            block.timestamp,
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
            block.number,
            block.timestamp
        );
    }

    function _increasePosition(address _collateralToken, address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _price) private {
        address _vault = vault;

        if (_isLong) {
            require(IVault(_vault).getMaxPrice(_indexToken) <= _price, "RouterV2: mark price higher than limit");
        } else {
            require(IVault(_vault).getMinPrice(_indexToken) >= _price, "RouterV2: mark price lower than limit");
        }

        if (_isLong) {
            uint256 maxGlobalLongSize = maxGlobalLongSizes[_indexToken];
            if (maxGlobalLongSize > 0 && IVault(_vault).guaranteedUsd(_indexToken).add(_sizeDelta) > maxGlobalLongSize) {
                revert("PositionManager: max global longs exceeded");
            }
        } else {
            uint256 maxGlobalShortSize = maxGlobalShortSizes[_indexToken];
            if (maxGlobalShortSize > 0 && IVault(_vault).globalShortSizes(_indexToken).add(_sizeDelta) >= maxGlobalShortSize) {
                revert("PositionManager: max global shorts exceeded");
            }
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

        address timelock = IVault(_vault).gov();

        ITimelock(timelock).setIsLeverageEnabled(_vault, true);
        uint256 amountOut = IVault(_vault).decreasePosition(msg.sender, _collateralToken, _indexToken, _collateralDelta, _sizeDelta, _isLong, _receiver);
        ITimelock(timelock).setIsLeverageEnabled(_vault, false);

        return amountOut;
    }

    function _swap(address[] memory _path, uint256 _minOut, address _receiver) private returns (uint256) {
        if (_path.length == 2) {
            return _vaultSwap(_path[0], _path[1], _minOut, _receiver);
        }
        revert("RouterV2: invalid _path.length");
    }

    function _vaultSwap(address _tokenIn, address _tokenOut, uint256 _minOut, address _receiver) private returns (uint256) {
        uint256 amountOut = IVault(vault).swap(_tokenIn, _tokenOut, _receiver);
        require(amountOut >= _minOut, "RouterV2: insufficient amountOut");
        return amountOut;
    }

    function _transferOutETH(uint256 _amountOut, address payable _receiver) private {
        IWETH(weth).withdraw(_amountOut);
        _receiver.sendValue(_amountOut);
    }

    function _collectFees(
        address _account,
        address[] memory _path,
        uint256 _amountIn,
        address _indexToken,
        bool _isLong,
        uint256 _sizeDelta
    ) internal returns (uint256) {
        bool shouldDeductFee = _shouldDeductFee(
            _account,
            _path,
            _amountIn,
            _indexToken,
            _isLong,
            _sizeDelta
        );

        if (shouldDeductFee) {
            uint256 afterFeeAmount = _amountIn.mul(BASIS_POINTS_DIVISOR.sub(depositFee)).div(BASIS_POINTS_DIVISOR);
            uint256 feeAmount = _amountIn.sub(afterFeeAmount);
            address feeToken = _path[0];
            feeReserves[feeToken] = feeReserves[feeToken].add(feeAmount);
            return afterFeeAmount;
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
