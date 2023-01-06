// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../utils/UnstructuredStorage.sol";


contract Pausable {
    using UnstructuredStorage for bytes32;

    event Stopped();
    event Resumed();

    bytes32 internal constant ACTIVE_FLAG_POSITION = keccak256("open.Pausable.activeFlag");

    modifier whenNotStopped() {
        require(ACTIVE_FLAG_POSITION.getStorageBool(), "CONTRACT_IS_STOPPED");
        _;
    }

    modifier whenStopped() {
        require(!ACTIVE_FLAG_POSITION.getStorageBool(), "CONTRACT_IS_ACTIVE");
        _;
    }

    function isStopped() external view returns (bool) {
        return !ACTIVE_FLAG_POSITION.getStorageBool();
    }

    function _stop() internal whenNotStopped {
        ACTIVE_FLAG_POSITION.setStorageBool(false);
        emit Stopped();
    }

    function _resume() internal whenStopped {
        ACTIVE_FLAG_POSITION.setStorageBool(true);
        emit Resumed();
    }
}
