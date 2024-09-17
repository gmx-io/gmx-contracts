// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface IExchangeRouter {
    function multicall(bytes[] calldata data) external;
}
