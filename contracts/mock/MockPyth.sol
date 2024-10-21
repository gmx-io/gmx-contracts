//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../oracle/interfaces/IPyth.sol";

contract MockPyth {
    mapping (bytes32 => int64) public prices;
    mapping (bytes32 => int32) public exponents;
    mapping (bytes32 => uint256) public publishTimes;

    function getPrice(
        bytes32 id
    ) external view returns (PythStructs.Price memory price) {
        price = PythStructs.Price({
            price: prices[id],
            conf: 0,
            expo: exponents[id],
            publishTime: publishTimes[id]
        });
    }

    function setPrice(bytes32 id, int64 price, int32 expo, uint256 publishTime) external {
        prices[id] = price;
        exponents[id] = expo;
        publishTimes[id] = publishTime;
    }

    function updatePriceFeeds(bytes[] calldata /* updateData */) external payable {}

    function getUpdateFee(
        bytes[] calldata /* updateData */
    ) external pure returns (uint feeAmount) {
        return 1000000000000; // 0.000001 ETH
    }
}
