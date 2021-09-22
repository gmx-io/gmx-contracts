// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IDistributor {
    function distribute() external returns (uint256);
    function getRewardToken(address _receiver) external view returns (address);
    function getDistributionAmount(address _receiver) external view returns (uint256);
    function tokensPerInterval(address _receiver) external view returns (uint256);
}
