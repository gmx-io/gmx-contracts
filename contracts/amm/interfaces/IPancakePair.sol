// SPDX-License-Identifier: MIT

pragma solidity >=0.5.0;

interface IPancakePair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
}
