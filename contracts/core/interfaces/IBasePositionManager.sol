// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IBasePositionManager {
    function maxGlobalLongSizes(address _token) external view returns (uint256);
    function maxGlobalShortSizes(address _token) external view returns (uint256);
}
