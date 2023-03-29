// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../core/PositionRouter.sol";

contract PositionRouterReader {
    function getTransferTokenOfIncreasePositionRequests(
        address _positionRouter,
        uint256 _endIndex
    ) external view returns (uint256[] memory, address[] memory) {
        IPositionRouter positionRouter = IPositionRouter(_positionRouter);

        // increasePositionRequestKeysStart,
        // increasePositionRequestKeys.length,
        // decreasePositionRequestKeysStart,
        // decreasePositionRequestKeys.length
        (uint256 index, uint256 length, ,) = positionRouter.getRequestQueueLengths();

        if (_endIndex > length) { _endIndex = length; }

        uint256[] memory requestIndexes = new uint256[](_endIndex - index);
        address[] memory transferTokens = new address[](_endIndex - index);

        uint256 transferTokenIndex = 0;

        while (index < _endIndex) {
            bytes32 key = positionRouter.increasePositionRequestKeys(index);
            address[] memory path = positionRouter.getIncreasePositionRequestPath(key);
            if (path.length > 0) {
                transferTokens[transferTokenIndex] = path[0];
            }

            requestIndexes[transferTokenIndex] = index;

            transferTokenIndex++;
            index++;
        }

        return (requestIndexes, transferTokens);
    }
}
