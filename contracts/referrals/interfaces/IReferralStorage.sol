// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IReferralStorage {
    function setTraderReferralCode(address _account, bytes32 _code) external;
    function getTraderReferralInfo(address _account) external view returns (bytes32, address);
}
