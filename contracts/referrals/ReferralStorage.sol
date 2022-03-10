// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../libraries/math/SafeMath.sol";

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

import "./interfaces/IReferralStorage.sol";

contract ReferralStorage is Governable, IReferralStorage {
    using SafeMath for uint256;

    mapping (address => bool) public isHandler;

    mapping (address => bool) public isRegistered;
    mapping (bytes32 => address) public referralCodeOwners;
    mapping (bytes32 => bool) public isCodeActive;

    mapping (address => bytes32) public referrals;

    event SetHandler(address handler, bool isActive);
    event SetIsCodeActive(bytes32 code, bool isActive);
    event SetReferral(address account, bytes32 code);
    event Register(address account, bytes32 code);
    event UpdateAddress(address account, address newAccount, bytes32 code);

    modifier onlyHandler() {
        require(isHandler[msg.sender], "ReferralStorage: forbidden");
        _;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
        emit SetHandler(_handler, _isActive);
    }

    function setIsCodeActive(bytes32 _code, bool _isActive) external onlyGov {
        isCodeActive[_code] = _isActive;
        emit SetIsCodeActive(_code, _isActive);
    }

    function setReferral(address _account, bytes32 _code) external override onlyHandler {
        referrals[_account] = _code;
        emit SetReferral(_account, _code);
    }

    function register(bytes32 _code) external {
        require(!isRegistered[msg.sender], "ReferralStorage: already registered");
        referralCodeOwners[_code] = msg.sender;
        isRegistered[msg.sender] = true;
        emit Register(msg.sender, _code);
    }

    function updateAddress(bytes32 _code, address _newAccount) external {
        address account = referralCodeOwners[_code];
        require(msg.sender == account, "ReferralStorage: forbidden");

        referralCodeOwners[_code] = _newAccount;
        emit UpdateAddress(msg.sender, _newAccount, _code);
    }

    function getReferral(address _account) external override view returns (bytes32, address) {
        bytes32 code = referrals[_account];
        address referrer;

        if (isCodeActive[code]) {
            referrer = referralCodeOwners[code];
        }

        return (code, referrer);
    }
}
