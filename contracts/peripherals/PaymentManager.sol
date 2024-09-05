// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import "./BasicMulticall.sol";
import "../access/Governable.sol";

contract PaymentManager is BasicMulticall, Governable {
    struct GetPaymentsResult {
        address account;
        uint256 gmxAmount;
        uint256 usdcAmount;
    }

    bool public isInitialized;

    address public admin;

    address[] public accounts;
    mapping (address => uint256) public gmxAmounts;
    mapping (address => uint256) public usdcAmounts;

    modifier onlyAdmin() {
        require(msg.sender == admin, "forbidden");
        _;
    }

    constructor() public {
        admin = msg.sender;
    }

    function setAdmin(address _admin) public onlyGov {
        admin = _admin;
    }

    function getPaymentsCount() public view returns (uint256) {
        return accounts.length;
    }

    function getPayments(uint256 start, uint256 end) public view returns (GetPaymentsResult memory) {
        uint256 max = accounts.length;
        if (end > max) { end = max; }

        GetPaymentsResult[] memory results = new GetPaymentsResult[](end - start);

        for (uint256 i = start; i < end; i++) {
            address account = accounts[i];

            results[i] = GetPaymentsResult({
                account: account,
                gmxAmount: gmxAmounts[account];
                usdcAmount: usdcAmounts[account];
            });
        }

        return results;
    }

    function initialize(
        address[] memory _accounts,
        uint256[] memory _gmxAmounts,
        uint256[] memory usdcAmounts
    ) public onlyAdmin {
        require(!isInitialized, "already initialized");
        isInitialized = true;

    }

    function _setPayments(
        address[] memory _accounts,
        uint256[] memory _gmxAmounts,
        uint256[] memory usdcAmounts
    ) internal {
        uint256 length;

        for (uint256 i = start; i < end; i++) {
            address account = accounts[i];

            results[i] = GetPaymentsResult({
                account: account,
                gmxAmount: gmxAmounts[account];
                usdcAmount: usdcAmounts[account];
            });
        }

    }


}
