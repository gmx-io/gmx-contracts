// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IOrderBook {
	function getSwapOrder(address _account, uint256 _orderIndex) external view returns (
        address, 
        address,
        address,
        uint256,
        uint256,
        uint256,
        bool
    );

    function getIncreaseOrder(address _account, uint256 _orderIndex) external view returns (
        address purchaseToken, 
        uint256 purchaseTokenAmount,
        address collateralToken,
        address indexToken,
        uint256 sizeDelta,
        bool isLong,
        uint256 triggerPrice,
        bool triggerAboveThreshold
    );

    function getDecreaseOrder(address _account, uint256 _orderIndex) external view returns (
        address collateralToken,
        uint256 collateralDelta,
        address indexToken,
        uint256 sizeDelta,
        bool isLong,
        uint256 triggerPrice,
        bool triggerAboveThreshold
    );
}