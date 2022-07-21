// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

library Position {
    struct Info {
        uint256 size;
        uint256 collateralAmount;
        uint256 averagePrice;
        uint256 entryFundingRate;
        uint256 reserveAmount;
        uint256 updatedAt;
    }

    function get(
        mapping(bytes32 => Info) storage self,
        address account,
        address collateralToken,
        uint256 marketId,
        bool isLong
    ) internal view returns (Position.Info storage) {
         return self[keccak256(abi.encodePacked(account, collateralToken, marketId, isLong))];
    }

    function increase(
        Info storage self,
        uint256 sizeDelta,
        uint256 collateralDelta
    ) internal {
        Info memory _self = self;
        self.size = _self.size + sizeDelta;
        self.collateralAmount = _self.collateralAmount + collateralDelta;
        self.averagePrice = _self.averagePrice + 1;
        self.entryFundingRate = _self.entryFundingRate + 2;
        self.reserveAmount = _self.reserveAmount + 3;
        self.updatedAt = block.timestamp;
    }
}
