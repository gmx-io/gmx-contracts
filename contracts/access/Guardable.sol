// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./Governable.sol";

contract Guardable is Governable {
    address public capsAdmin;
    address public guardian;

    modifier onlyCapsAdmin() {
        require(msg.sender == capsAdmin, "Guardable: forbidden");
        _;
    }

    modifier onlyGuardian() {
        require(msg.sender == guardian, "Guardable: forbidden");
        _;
    }

    function setCapsAdmin(address _capsAdmin) external onlyGov {
        capsAdmin = _capsAdmin;
    }

    function setGuardian(address _guardian) external onlyGov {
        guardian = _guardian;
    }
}
