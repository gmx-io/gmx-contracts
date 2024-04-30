// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./interfaces/IStabilizeStrategy.sol";

contract StabilizeCaller {
    bool public isInitialized;
    address public parent;
    address public gov;

    constructor() public {
        gov = msg.sender;
    }

    function initialize(
        address _parent
    ) external {
        require(msg.sender == gov, "forbidden");
        require(!isInitialized, "already initialized");
        isInitialized = true;

        parent = _parent;
    }

    function completeMove() external {
        require(msg.sender == parent, "forbidden");

        IStabilizeStrategy strategy = IStabilizeStrategy(0xcD28C22d3c270477b841D1E6868b334DEFa4F0C7);
        strategy.governanceFinishMoveEsGMXFromDeprecatedRouter(address(1));
    }
}
