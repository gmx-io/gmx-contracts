// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRewardRouterV2 {
    function feeOapTracker() external view returns (address);
    function stakedOapTracker() external view returns (address);
}
