// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "./interfaces/IVault.sol";
import "./interfaces/IOrderBook.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract OrderExecutor {
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
        address timelock = IVault(vault).gov();
        ITimelock(timelock).setIsLeverageEnabled(vault, true);
        IOrderBook(orderBook).executeIncreaseOrder(_address, _orderIndex, _feeReceiver);
        ITimelock(timelock).setIsLeverageEnabled(vault, false);
    }

    function executeDecreaseOrder(address _address, uint256 _orderIndex, address payable _feeReceiver) external {
        IOrderBook(orderBook).executeDecreaseOrder(_address, _orderIndex, _feeReceiver);
    }
}
