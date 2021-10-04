// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface ITimelock {
    function setAdmin(address _admin) external;
    function managedSetHandler(address _target, address _handler, bool _isActive) external;
    function managedSetMinter(address _target, address _minter, bool _isActive) external;
}
