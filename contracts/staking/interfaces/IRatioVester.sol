// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRatioVester {
    function issuer() external view returns (address);
    function isHandler(address _account) external view returns (bool);
    function isFrozen(address _account) external view returns (bool);
    function pairAmounts(address _account) external view returns (uint256);
    function getVestingCap(address _account) external view returns (uint256);
    function claimable(address _account) external view returns (uint256);
    function hasOpenSession(address _account) external view returns (bool);
    function isFreshForTransfer(address _account) external view returns (bool);
    function depositForAccount(address _account, uint256 _amount) external;
    function withdrawForAccount(address _account) external;
    function claimForAccount(address _account) external returns (uint256);
    function transferVestingState(address _sender, address _receiver) external;
}
