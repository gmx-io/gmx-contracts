// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IReferralStorage {
    function setReferral(address _account, bytes32 _code) external;
    function getReferral(address _account) external view returns (bytes32, address);
}
