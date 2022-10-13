// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../interfaces/IPositionRouterCallbackReceiver.sol";

contract PositionRouterCallbackReceiverTest is IPositionRouterCallbackReceiver {
    event CallbackCalled(
        bytes32 positionKey,
        bool isExecuted,
        bool isIncrease
    );

    function gmxPositionCallback(bytes32 positionKey, bool isExecuted, bool isIncrease) override external {
        emit CallbackCalled(positionKey, isExecuted, isIncrease);
    }
}
