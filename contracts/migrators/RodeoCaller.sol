// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IRodeoInvestor {
    function setStrategy(uint256 idx, address str) external;
}

contract RodeoCaller {
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

    function completeMigration() external {
        require(msg.sender == parent, "forbidden");

        IRodeoInvestor(0x8accf43Dd31DfCd4919cc7d65912A475BfA60369).setStrategy(12, 0x9fbe74E4B3F7268836F7321743c75AADca6B7864);
    }
}
