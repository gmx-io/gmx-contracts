// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import './Position.sol';

contract Pool {
    using Position for mapping(bytes32 => Position.Info);
    using Position for Position.Info;

    mapping (bytes32 => Position.Info) public positions;

    function getPosition(
        address account,
        address collateralToken,
        uint256 marketId,
        bool isLong
    ) external view returns (Position.Info memory) {
        return positions.get(account, collateralToken, marketId, isLong);
    }

    function increasePosition(
        address account,
        address collateralToken,
        uint256 marketId,
        bool isLong,
        uint256 sizeDelta,
        uint256 collateralDelta
    ) external {
        Position.Info storage position = positions.get(account, collateralToken, marketId, isLong);
        position.increase(sizeDelta, collateralDelta);
    }
}
