// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../libraries/math/SafeMath.sol";

import "./interfaces/IVault.sol";
import "./interfaces/IOrderBook.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract OrderExecutor {
    using SafeMath for uint256;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    address public vault;
    address public orderBook;

    constructor(address _vault, address _orderBook) public {
        require(_vault != address(0) && _orderBook != address(0), "OrderExecutor: invalid address");
        vault = _vault;
        orderBook = _orderBook;
    }

    function executeSwapOrder(address _account, uint256 _orderIndex, address payable _feeReceiver) external {
        IOrderBook(orderBook).executeSwapOrder(_account, _orderIndex, _feeReceiver);
    }

    function executeIncreaseOrder(address _address, uint256 _orderIndex, address payable _feeReceiver) external {
        _validateIncreaseOrder(_address, _orderIndex);
        address timelock = IVault(vault).gov();
        ITimelock(timelock).setIsLeverageEnabled(vault, true);
        IOrderBook(orderBook).executeIncreaseOrder(_address, _orderIndex, _feeReceiver);
        ITimelock(timelock).setIsLeverageEnabled(vault, false);
    }

    function executeDecreaseOrder(address _address, uint256 _orderIndex, address payable _feeReceiver) external {
        IOrderBook(orderBook).executeDecreaseOrder(_address, _orderIndex, _feeReceiver);
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
}
