// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../access/Governable.sol";
import "../tokens/interfaces/IMintable.sol";

interface ISeasonVester {
    function increaseIssuedAmounts(address _account, uint256 _amount) external;
}

// SCDEV-316 PoC stand-in for the epoch reward manager: mints esGMX and credits the same
// amount to the season Vester's ledger (needs esToken minter + vester handler roles)
contract SeasonIssuer is Governable {
    address public esToken;
    address public seasonVester;

    constructor (address _esToken, address _seasonVester) public {
        esToken = _esToken;
        seasonVester = _seasonVester;
    }

    function issue(address[] calldata _accounts, uint256[] calldata _amounts) external onlyGov {
        require(_accounts.length == _amounts.length, "SeasonIssuer: length mismatch");
        for (uint256 i = 0; i < _accounts.length; i++) {
            IMintable(esToken).mint(_accounts[i], _amounts[i]);
            ISeasonVester(seasonVester).increaseIssuedAmounts(_accounts[i], _amounts[i]);
        }
    }
}
