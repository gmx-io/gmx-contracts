//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}
