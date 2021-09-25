// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IHandlerTarget {
    function setHandler(address _handler, bool _isActive) external;
}
