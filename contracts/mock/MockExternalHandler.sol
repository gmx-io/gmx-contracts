// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/utils/Address.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../staking/interfaces/IExternalHandler.sol";

// contracts with a CONTROLLER role or other roles may need to call external
// contracts, since these roles may be able to directly change DataStore values
// or perform other sensitive operations, these contracts should make these calls
// through ExternalHandler instead
//
// note that anyone can make this contract call any function, this should be noted
// to avoid assumptions of the contract's state in any protocol
//
// e.g. some tokens require the approved amount to be zero before the approved amount
// can be changed, this should be taken into account if calling approve is required for
// these tokens
contract MockExternalHandler is IExternalHandler, ReentrancyGuard {
    using Address for address;
    using SafeERC20 for IERC20;

    // @notice refundTokens should be unique, this is because the refund loop
    // sends the full refund token balance on each iteration, so if there are
    // duplicate refund token addresses, then only the first refundReceiver
    // for that token would receive the tokens
    function makeExternalCalls(
        address[] memory targets,
        bytes[] memory dataList,
        address[] memory refundTokens,
        address[] memory refundReceivers
    ) external override nonReentrant {
        if (targets.length != dataList.length) {
            revert("Invalid External Call Input");
        }

        if (refundTokens.length != refundReceivers.length) {
            revert("Invalid External Receivers Input");
        }

        for (uint256 i; i < targets.length; i++) {
            _makeExternalCall(
                targets[i],
                dataList[i]
            );
        }

        for (uint256 i; i < refundTokens.length; i++) {
            IERC20 refundToken = IERC20(refundTokens[i]);
            uint256 balance = refundToken.balanceOf(address(this));
            if (balance > 0) {
                refundToken.safeTransfer(refundReceivers[i], balance);
            }
        }
    }

    function _makeExternalCall(
        address target,
        bytes memory data
    ) internal {
        if (!target.isContract()) {
            revert("Invalid External Call Target");
        }

        (bool success, ) = target.call(data);

        if (!success) {
            revert("External Call Failed");
        }
    }
}