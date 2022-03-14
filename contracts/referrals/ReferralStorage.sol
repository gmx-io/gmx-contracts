// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../libraries/math/SafeMath.sol";

import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

import "./interfaces/IReferralStorage.sol";

contract ReferralStorage is Governable, IReferralStorage {
    using SafeMath for uint256;

    mapping (address => bool) public isHandler;

    mapping (bytes32 => address) public codeOwners;
    mapping (bytes32 => bool) public isCodeActive;

    mapping (address => bytes32) public traderReferralCodes;

    event SetHandler(address handler, bool isActive);
    event SetIsCodeActive(bytes32 code, bool isActive);
    event SetTraderReferralCode(address account, bytes32 code);
    event Register(address account, bytes32 code);
    event SetCodeOwner(address account, address newAccount, bytes32 code);
    event GovSetCodeOwner(bytes32 code, address newAccount);

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

    function setTraderReferralCode(address _account, bytes32 _code) external override onlyHandler {
        traderReferralCodes[_account] = _code;
        emit SetTraderReferralCode(_account, _code);
    }

    function register(bytes32 _code) external {
        require(codeOwners[_code] == address(0), "ReferralStorage: code already exists");

        codeOwners[_code] = msg.sender;
        emit Register(msg.sender, _code);
    }

    function setCodeOwner(bytes32 _code, address _newAccount) external {
        address account = codeOwners[_code];
        require(msg.sender == account, "ReferralStorage: forbidden");

        codeOwners[_code] = _newAccount;
        emit SetCodeOwner(msg.sender, _newAccount, _code);
    }

    function govSetCodeOwner(bytes32 _code, address _newAccount) external onlyGov {
        codeOwners[_code] = _newAccount;
        emit GovSetCodeOwner(_code, _newAccount);
    }

    function getTraderReferralInfo(address _account) external override view returns (bytes32, address) {
        bytes32 code = traderReferralCodes[_account];
        address referrer;

        if (isCodeActive[code]) {
            referrer = codeOwners[code];
        }

        return (code, referrer);
    }
}
