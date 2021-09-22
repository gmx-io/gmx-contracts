// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

interface IGLP {
    function mint(address _account, uint256 _amount) external;
    function burn(address _account, uint256 _amount) external;
}
