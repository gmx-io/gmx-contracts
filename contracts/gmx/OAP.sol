// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";

contract OAP is MintableBaseToken {
    constructor() public MintableBaseToken("OpenWorld Asset Pool", "OAP", 0) {}

    function id() external pure returns (string memory _name) {
        return "OAP";
    }
}
