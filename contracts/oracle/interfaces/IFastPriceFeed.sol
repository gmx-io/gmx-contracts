// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IFastPriceFeed {
    function lastUpdatedAt() external view returns (uint256);
    function lastUpdatedBlock() external view returns (uint256);
    function setPrice(address _token, uint256 _price) external;
}
