// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

interface IExternalHandler {
    function makeExternalCalls(
        address[] memory targets,
        bytes[] memory dataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external;
}