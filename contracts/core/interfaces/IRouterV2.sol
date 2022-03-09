// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRouterV2 {
    function executeIncreasePositions(uint256 _count, address payable _executionFeeReceiver) external;
    function executeDecreasePositions(uint256 _count, address payable _executionFeeReceiver) external;
}
