// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

contract UniFactory {
    mapping(address => mapping(address => mapping(uint24 => address))) public getPool;
}
