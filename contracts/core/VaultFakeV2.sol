// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./Vault.sol";

contract VaultFakeV2 is Vault {
	bool private __VaultFakeV2_isInitialized;
	uint256 public version = 2;

	string public constant newConstant = 'NEW_CONSTANT';

	function VaultFakeV2_initialize() external {
		_onlyGov();
		require(!__VaultFakeV2_isInitialized, "VaultFakeV2: already initialized");
		__VaultFakeV2_isInitialized = true;
		version = 2;
	}
}