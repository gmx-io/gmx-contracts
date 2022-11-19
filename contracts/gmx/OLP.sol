// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract OLP is MintableBaseToken {
    constructor() public MintableBaseToken("OPEN LP", "OLP", 0) {}

    function id() external pure returns (string memory _name) {
        return "OLP";
    }
}
