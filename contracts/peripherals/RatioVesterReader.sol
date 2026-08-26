// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../staking/RatioVester.sol";
import "../staking/EsGmxIssuer.sol";

contract RatioVesterReader {
    uint256 public constant VESTING_INFO_PROPS_LENGTH = 12;

    function getVestingInfo(address[] memory _vesters, address _account) public view returns (uint256[] memory) {
        uint256[] memory amounts = new uint256[](_vesters.length * VESTING_INFO_PROPS_LENGTH);
        for (uint256 i = 0; i < _vesters.length; i++) {
            RatioVester vester = RatioVester(_vesters[i]);
            uint256 offset = i * VESTING_INFO_PROPS_LENGTH;
            amounts[offset] = vester.balances(_account);
            amounts[offset + 1] = vester.pairAmounts(_account);
            amounts[offset + 2] = vester.claimable(_account);
            amounts[offset + 3] = vester.cumulativeClaimAmounts(_account);
            amounts[offset + 4] = vester.claimedAmounts(_account);
            amounts[offset + 5] = vester.unpaidClaimAmounts(_account);
            amounts[offset + 6] = vester.totalConvertedAmounts(_account);
            amounts[offset + 7] = vester.getVestingCap(_account);
            amounts[offset + 8] = vester.tranchesLength(_account) - vester.trancheStartIndex(_account);
            amounts[offset + 9] = vester.vestingDuration();
            amounts[offset + 10] = vester.deactivatedAt();
            amounts[offset + 11] = vester.pairRatioFactor();
        }
        return amounts;
    }

    function getTranches(address _vester, address _account) public view returns (
        uint256[] memory startTimes,
        uint256[] memory totalAmounts,
        uint256[] memory convertedAmounts
    ) {
        RatioVester vester = RatioVester(_vester);
        uint256 startIndex = vester.trancheStartIndex(_account);
        uint256 length = vester.tranchesLength(_account);
        uint256 liveCount = length - startIndex;

        startTimes = new uint256[](liveCount);
        totalAmounts = new uint256[](liveCount);
        convertedAmounts = new uint256[](liveCount);

        for (uint256 i = 0; i < liveCount; i++) {
            (uint256 startTime, uint256 totalAmount, uint256 convertedAmount) = vester.tranches(_account, startIndex + i);
            startTimes[i] = startTime;
            totalAmounts[i] = totalAmount;
            convertedAmounts[i] = convertedAmount;
        }
    }

    function getIssuerInfo(address _issuer, address _account) public view returns (uint256[] memory) {
        EsGmxIssuer issuer = EsGmxIssuer(_issuer);
        uint256[] memory amounts = new uint256[](5);
        amounts[0] = issuer.issuedAmounts(_account);
        amounts[1] = issuer.claimedAmounts(_account);
        amounts[2] = issuer.claimable(_account);
        amounts[3] = issuer.totalIssuedAmount();
        amounts[4] = issuer.totalClaimedAmount();
        return amounts;
    }
}
