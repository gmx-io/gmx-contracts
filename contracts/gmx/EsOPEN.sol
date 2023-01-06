// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract EsOPEN is MintableBaseToken {
    constructor() public MintableBaseToken("esOPEN", "esOPEN", 0) {}

    function id() external pure returns (string memory _name) {
        return "esOPEN";
    }
}
