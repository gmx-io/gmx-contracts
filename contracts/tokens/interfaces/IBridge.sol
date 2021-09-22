// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IBridge {
    function wrap(uint256 _amount, address _receiver) external;
    function unwrap(uint256 _amount, address _receiver) external;
}
