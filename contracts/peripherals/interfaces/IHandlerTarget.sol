// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IHandlerTarget {
    function isHandler(address _account) external returns (bool);
    function setHandler(address _handler, bool _isActive) external;
    function setDepositToken(address _depositToken, bool _isDepositToken) external;
}
