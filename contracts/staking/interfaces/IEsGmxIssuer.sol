// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IEsGmxIssuer {
    function vester() external view returns (address);
    function issuedAmounts(address _account) external view returns (uint256);
    function claimable(address _account) external view returns (uint256);
    function claimForAccount(address _account) external returns (uint256);
}
