// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFastPriceFeed {
    function lastUpdatedAt() external view returns (uint256);
    function lastUpdatedBlock() external view returns (uint256);
    function setIsSpreadEnabled(bool _isSpreadEnabled) external;
    function setSigner(address _account, bool _isActive) external;
}
