// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "../referrals/interfaces/IReferralStorage.sol";
import "../access/Governable.sol";

contract Competition is Governable
{
    struct Team {
        address leader;
        string name;
        bytes32 referral;
        address[] members;
        address[] joinRequests;
    }

    uint public start;
    uint public end;
    uint public registrationStart;
    uint public registrationEnd;
    IReferralStorage private referralStorage;
    address[] private leaders;
    mapping(address => Team) private teams;
    mapping(string => bool) private teamNames;
    mapping(address => address) private membersToTeam;
    mapping(address => mapping(address => bool)) private requests;

    modifier registrationIsOpen()
    {
        require(block.timestamp >= registrationStart && block.timestamp < registrationEnd, "Registration is closed.");
        _;
    }

    modifier isNotMember()
    {
        require(membersToTeam[msg.sender] == address(0), "Team members are not allowed.");
        _;
    }

    constructor(
        uint start_,
        uint end_,
        uint registrationStart_,
        uint registrationEnd_,
        IReferralStorage referralStorage_
    ) public {
        start = start_;
        end = end_;
        registrationStart = registrationStart_;
        registrationEnd = registrationEnd_;
        referralStorage = referralStorage_;
    }

    function registerTeam(string calldata name, bytes32 referral) external registrationIsOpen {
        require(referralStorage.codeOwners(referral) != address(0), "Referral code does not exist.");
        require(teamNames[name] == false, "Team name already registered.");

        Team storage team;

        team.leader = msg.sender;
        team.name = name;
        team.referral = referral;
        team.members.push(msg.sender);

        teams[msg.sender] = team;
        leaders.push(msg.sender);
        teamNames[name] = true;
    }

    function createJoinRequest(address leaderAddress) external registrationIsOpen isNotMember {
        require(membersToTeam[msg.sender] == address(0), "You can't join multiple teams.");
        require(teams[msg.sender].leader != address(0), "The team does not exist.");
        require(requests[leaderAddress][msg.sender] == false, "You already applied for this team.");

        teams[leaderAddress].joinRequests.push(msg.sender);
        requests[leaderAddress][msg.sender] = true;
    }

    function approveJoinRequest(address memberAddress) external registrationIsOpen isNotMember {
        require(requests[msg.sender][memberAddress] == false, "This member did not apply.");
        require(membersToTeam[memberAddress] == address(0), "This member already joined a team.");

        referralStorage.setTraderReferralCode(memberAddress, teams[msg.sender].referral);
        teams[msg.sender].members.push(msg.sender);
        membersToTeam[memberAddress] = msg.sender;
    }

    function getLeaders(uint start_, uint offset) external view returns (address[] memory) {
        address[] memory res;

        for (uint i = start_; i < leaders.length && i < start_ + offset; i++) {
            res[i] = leaders[i];
        }

        return res;
    }

    function getTeam(address leaderAddr) external view returns (address leader, string memory name, bytes32 referral) {
        Team memory team = teams[leaderAddr];
        return (team.leader, team.name, team.referral);
    }

    function getTeamMembers(address leaderAddr) external view returns (address[] memory) {
        return teams[leaderAddr].members;
    }

    function getTeamJoinRequests(address leaderAddr) external view returns (address[] memory) {
        address[] memory res;

        for (uint i = 0; i < teams[leaderAddr].joinRequests.length; i++) {
            address jr = teams[leaderAddr].joinRequests[i];
            if (membersToTeam[jr] == address(0)) {
                res[i] = jr;
            }
        }

        return res;
    }

    function setStart(uint start_) external onlyGov {
        start = start_;
    }

    function setEnd(uint end_) external onlyGov {
        end = end_;
    }

    function setRegistrationStart(uint registrationStart_) external onlyGov {
        registrationStart = registrationStart_;
    }

    function setRegistrationEnd(uint registrationEnd_) external onlyGov {
        registrationEnd = registrationEnd_;
    }
}
