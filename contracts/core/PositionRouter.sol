// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "./interfaces/IRouter.sol";
import "./interfaces/IVault.sol";
import "./interfaces/IPositionRouter.sol";

import "../peripherals/interfaces/ITimelock.sol";
import "./BasePositionManager.sol";

contract PositionRouter is BasePositionManager, IPositionRouter {

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

    uint256 public minExecutionFee;

    uint256 public minBlockDelayKeeper;
    uint256 public minTimeDelayPublic;
    uint256 public maxTimeDelay;

    bool public isLeverageEnabled = true;

    bytes32[] public increasePositionRequestKeys;
    bytes32[] public decreasePositionRequestKeys;

    uint256 public increasePositionRequestKeysStart;
    uint256 public decreasePositionRequestKeysStart;

    mapping (address => bool) public isPositionKeeper;

    mapping (address => uint256) public increasePositionsIndex;
    mapping (bytes32 => IncreasePositionRequest) public increasePositionRequests;

    mapping (address => uint256) public decreasePositionsIndex;
    mapping (bytes32 => DecreasePositionRequest) public decreasePositionRequests;

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
    event SetMinExecutionFee(uint256 minExecutionFee);
    event SetIsLeverageEnabled(bool isLeverageEnabled);
    event SetDelayValues(uint256 minBlockDelayKeeper, uint256 minTimeDelayPublic, uint256 maxTimeDelay);

    modifier onlyPositionKeeper() {
        require(isPositionKeeper[msg.sender], "PositionRouter: forbidden");
        _;
    }

    constructor(
        address _vault,
        address _router,
        address _weth,
        uint256 _depositFee,
        uint256 _minExecutionFee
    ) public BasePositionManager(_vault, _router, _weth, _depositFee) {
        minExecutionFee = _minExecutionFee;
    }

    function setPositionKeeper(address _account, bool _isActive) external onlyAdmin {
        isPositionKeeper[_account] = _isActive;
        emit SetPositionKeeper(_account, _isActive);
    }

    function setMinExecutionFee(uint256 _minExecutionFee) external onlyAdmin {
        minExecutionFee = _minExecutionFee;
        emit SetMinExecutionFee(_minExecutionFee);
    }

    function setIsLeverageEnabled(bool _isLeverageEnabled) external onlyAdmin {
        isLeverageEnabled = _isLeverageEnabled;
        emit SetIsLeverageEnabled(_isLeverageEnabled);
    }

    function setDelayValues(uint256 _minBlockDelayKeeper, uint256 _minTimeDelayPublic, uint256 _maxTimeDelay) external onlyAdmin {
        minBlockDelayKeeper = _minBlockDelayKeeper;
        minTimeDelayPublic = _minTimeDelayPublic;
        maxTimeDelay = _maxTimeDelay;
        emit SetDelayValues(_minBlockDelayKeeper, _minTimeDelayPublic, _maxTimeDelay);
    }

    function executeIncreasePositions(uint256 _endIndex, address payable _executionFeeReceiver) external override onlyPositionKeeper {
        uint256 index = increasePositionRequestKeysStart;
        uint256 length = increasePositionRequestKeys.length;

        if (index >= length) { return; }

        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            bytes32 key = increasePositionRequestKeys[index];

            // if the request was executed then delete the key from the array
            // if the request was not executed then break from the loop, this can happen if the
            // minimum number of blocks has not yet passed
            // an error could be thrown if the request is too old or if the slippage is
            // higher than what the user specified, or if there is insufficient liquidity for the position
            // in case an error was thrown, cancel the request
            try this.executeIncreasePosition(key, _executionFeeReceiver) returns (bool _wasExecuted) {
                if (!_wasExecuted) { break; }
            } catch {
                // if executeIncreasePosition raised an error it means that a sufficient number of blocks have passed
                // but the increasePosition call failed, in this case cancelIncreasePosition should always be able to cancel
                // the position without any error
                this.cancelIncreasePosition(key, _executionFeeReceiver);
            }

            delete increasePositionRequestKeys[index];
            index++;
        }

        increasePositionRequestKeysStart = index;
    }

    function executeDecreasePositions(uint256 _endIndex, address payable _executionFeeReceiver) external override onlyPositionKeeper {
        uint256 index = decreasePositionRequestKeysStart;
        uint256 length = decreasePositionRequestKeys.length;

        if (index >= length) { return; }

        if (_endIndex > length) {
            _endIndex = length;
        }

        while (index < _endIndex) {
            bytes32 key = decreasePositionRequestKeys[index];

            // if the request was executed then delete the key from the array
            // if the request was not executed then break from the loop, this can happen if the
            // minimum number of blocks has not yet passed
            // an error could be thrown if the request is too old
            // in case an error was thrown, cancel the request
            try this.executeDecreasePosition(key, _executionFeeReceiver) returns (bool _wasExecuted) {
                if (!_wasExecuted) { break; }
            } catch {
                // if executeDecreasePosition raised an error it means that a sufficient number of blocks have passed
                // but the decreasePosition call failed, in this case cancelIncreasePosition should always be able to cancel
                // the position without any error
                this.cancelDecreasePosition(key, _executionFeeReceiver);
            }

            delete decreasePositionRequestKeys[index];
            index++;
        }

        decreasePositionRequestKeysStart = index;
    }

    function createIncreasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _acceptablePrice,
        uint256 _executionFee,
        bytes32 _referralCode
    ) external payable nonReentrant {
        require(_executionFee >= minExecutionFee, "PositionRouter: invalid executionFee");
        require(msg.value == _executionFee, "PositionRouter: invalid msg.value");

        if (_referralCode != bytes32(0) && referralStorage != address(0)) {
            IReferralStorage(referralStorage).setTraderReferralCode(msg.sender, _referralCode);
        }

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
        require(_executionFee >= minExecutionFee, "PositionRouter: invalid executionFee");
        require(msg.value >= _executionFee, "PositionRouter: invalid msg.value");
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
        require(_executionFee >= minExecutionFee, "PositionRouter: invalid executionFee");
        require(msg.value == _executionFee, "PositionRouter: invalid msg.value");

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

    function getRequestQueueLengths() external view returns (uint256, uint256, uint256, uint256) {
        return (
            increasePositionRequestKeysStart,
            increasePositionRequestKeys.length,
            decreasePositionRequestKeysStart,
            decreasePositionRequestKeys.length
        );
    }

    function executeIncreasePosition(bytes32 _key, address payable _executionFeeReceiver) public nonReentrant returns (bool) {
        IncreasePositionRequest memory request = increasePositionRequests[_key];
        require(request.account != address(0), "PositionRouter: request does not exist");

        bool shouldExecute = _validateExecution(request.blockNumber, request.blockTime, request.account);
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

       _increasePosition(request.account, request.path[request.path.length - 1], request.indexToken, request.sizeDelta, request.isLong, request.acceptablePrice);

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
        require(request.account != address(0), "PositionRouter: request does not exist");

        bool shouldCancel = _validateCancellation(request.blockNumber, request.blockTime, request.account);
        if (!shouldCancel) { return; }

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
        require(request.account != address(0), "PositionRouter: request does not exist");

        bool shouldExecute = _validateExecution(request.blockNumber, request.blockTime, request.account);
        if (!shouldExecute) { return false; }

        delete decreasePositionRequests[_key];

        if (request.withdrawETH) {
           uint256 amountOut = _decreasePosition(request.account, request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, address(this), request.acceptablePrice);
           _transferOutETH(amountOut, payable(request.receiver));
        } else {
           _decreasePosition(request.account, request.collateralToken, request.indexToken, request.collateralDelta, request.sizeDelta, request.isLong, request.receiver, request.acceptablePrice);
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
        require(request.account != address(0), "PositionRouter: request does not exist");

        bool shouldCancel = _validateCancellation(request.blockNumber, request.blockTime, request.account);
        if (!shouldCancel) { return; }

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

    function _validateExecution(uint256 _positionBlockNumber, uint256 _positionBlockTime, address _account) internal view returns (bool) {
        if (_positionBlockTime.add(maxTimeDelay) <= block.timestamp) {
            revert("PositionRouter: request has expired");
        }

        bool isKeeperCall = msg.sender == address(this) || isPositionKeeper[msg.sender];

        if (!isLeverageEnabled && !isKeeperCall) {
            revert("PositionRouter: forbidden");
        }

        if (isKeeperCall) {
            return _positionBlockNumber.add(minBlockDelayKeeper) <= block.number;
        }

        require(msg.sender == _account, "PositionRouter: forbidden");

        return _positionBlockTime.add(minTimeDelayPublic) <= block.timestamp;
    }

    function _validateCancellation(uint256 _positionBlockNumber, uint256 _positionBlockTime, address _account) internal view returns (bool) {
        bool isKeeperCall = msg.sender == address(this) || isPositionKeeper[msg.sender];

        if (!isLeverageEnabled && !isKeeperCall) {
            revert("PositionRouter: forbidden");
        }

        if (isKeeperCall) {
            return _positionBlockNumber.add(minBlockDelayKeeper) <= block.number;
        }

        require(msg.sender == _account, "PositionRouter: forbidden");

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
        require(_path.length == 1 || _path.length == 2, "PositionRouter: invalid _path");

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
}
