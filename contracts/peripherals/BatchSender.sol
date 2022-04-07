// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/token/IERC20.sol";
import "../libraries/math/SafeMath.sol";

contract BatchSender {
    using SafeMath for uint256;

    address public admin;

    event BatchSend(
        uint256 indexed typeId,
        address indexed token,
        address[] accounts,
        uint256[] amounts
    );

    constructor() public {
        admin = msg.sender;
    }

    function send(IERC20 _token, address[] memory _accounts, uint256[] memory _amounts) public {
        _send(_token, _accounts, _amounts, 0);
    }

    function sendAndEmit(IERC20 _token, address[] memory _accounts, uint256[] memory _amounts, uint256 _typeId) public {
        _send(_token, _accounts, _amounts, _typeId);
    }

    function _send(IERC20 _token, address[] memory _accounts, uint256[] memory _amounts, uint256 _typeId) private {
        require(msg.sender == admin, "BatchSender: forbidden");

        for (uint256 i = 0; i < _accounts.length; i++) {
            address account = _accounts[i];
            uint256 amount = _amounts[i];
            _token.transferFrom(msg.sender, account, amount);
        }
        emit BatchSend(_typeId, address(_token), _accounts, _amounts);
    }
}
