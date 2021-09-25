// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IVester {
    function transferredAverageStakedAmounts(address _account) external view returns (uint256);
    function transferredCumulativeRewards(address _account) external view returns (uint256);
    function bonusRewards(address _account) external view returns (uint256);

    function setTransferredAverageStakedAmounts(address _account, uint256 _amount) external;
    function setTransferredCumulativeRewards(address _account, uint256 _amount) external;
    function setBonusRewards(address _account, uint256 _amount) external;

    function getMaxVestableAmount(address _account) external view returns (uint256);
    function getCombinedAveragedStakedAmount(address _account) external view returns (uint256);
}
