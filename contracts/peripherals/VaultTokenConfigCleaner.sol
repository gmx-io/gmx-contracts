// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../access/interfaces/IGovRequester.sol";

import "./interfaces/ITimelock.sol";

interface IVaultTokenConfig {
    function whitelistedTokens(address _token) external view returns (bool);
    function clearTokenConfig(address _token) external;
}

// Helper to remove tokens from a Vault whitelist when the Vault gov is a Timelock.
//
// Vault.clearTokenConfig is onlyGov, and the Timelock does not expose a passthrough
// for it, so we use the requestGov / IGovRequester flow (same pattern as BaseMigrator):
// the Timelock temporarily hands Vault gov to this contract, we clear the tokens, then
// gov is handed straight back to the Timelock - all in a single atomic transaction.
//
// Prerequisite: this contract must be registered on the Timelock as a gov requester via
// Timelock.signalSetGovRequester(this, true) + (after buffer) setGovRequester(this, true).
contract VaultTokenConfigCleaner is IGovRequester {
    address public immutable admin;
    address public immutable vault;

    address[] public tokens;
    address public expectedGovGrantedCaller;

    modifier onlyAdmin() {
        require(msg.sender == admin, "VaultTokenConfigCleaner: forbidden");
        _;
    }

    constructor(address _admin, address _vault, address[] memory _tokens) public {
        admin = _admin;
        vault = _vault;
        tokens = _tokens;
    }

    function tokensLength() external view returns (uint256) {
        return tokens.length;
    }

    function run() external onlyAdmin {
        address gov = Governable(vault).gov();
        expectedGovGrantedCaller = gov;

        address[] memory targets = new address[](1);
        targets[0] = vault;

        // gov is handed to this contract, afterGovGranted is invoked, then the Timelock
        // validates that gov has been handed back to it
        ITimelock(gov).requestGov(targets);
    }

    function afterGovGranted() external override {
        require(msg.sender == expectedGovGrantedCaller, "VaultTokenConfigCleaner: forbidden");

        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            // clearTokenConfig reverts if the token is not whitelisted, so guard it to keep
            // the batch idempotent if a token was already removed
            if (IVaultTokenConfig(vault).whitelistedTokens(token)) {
                IVaultTokenConfig(vault).clearTokenConfig(token);
            }
        }

        // hand gov back to the Timelock
        Governable(vault).setGov(msg.sender);

        expectedGovGrantedCaller = address(0);
    }
}
