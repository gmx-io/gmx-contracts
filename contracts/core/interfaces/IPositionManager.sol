// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IPositionManager {
    function executeIncreasePositions(uint256 _count) external;
    function executeDecreasePositions(uint256 _count) external;
}
