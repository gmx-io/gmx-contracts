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
    IReferralStorage public referralStorage;
    address[] public leaders;
    mapping(address => Team) public teams;
    mapping(string => bool) public teamNames;
    mapping(address => address) public membersToTeam;
    mapping(address => address) public requests;

    event TeamRegistered(address leader, string name, bytes32 referral);
    event JoinRequestCreated(address member, address leader);
    event JoinRequestCanceled(address member);
    event JoinRequestApproved(address member, address leader);
    event MemberRemoved(address leader, address member);
    event TimesChanged(uint start, uint end);

    modifier registrationIsOpen() {
        require(block.timestamp < start, "Registration is closed.");
        _;
    }

    modifier isNotMember() {
        require(membersToTeam[msg.sender] == address(0), "Team members are not allowed.");
        _;
    }

    constructor(
        uint start_,
        uint end_,
        IReferralStorage referralStorage_
    ) public {
        start = start_;
        end = end_;
        referralStorage = referralStorage_;

        emit TimesChanged(start, end);
    }

    function registerTeam(string calldata name, bytes32 referral) external registrationIsOpen isNotMember {
        require(referralStorage.codeOwners(referral) != address(0), "Referral code does not exist.");
        require(teamNames[name] == false, "Team name already registered.");

        Team storage team = teams[msg.sender];
        team.leader = msg.sender;
        team.name = name;
        team.referral = referral;
        team.members.push(msg.sender);

        leaders.push(msg.sender);
        teamNames[name] = true;
        membersToTeam[msg.sender] = msg.sender;

        emit TeamRegistered(msg.sender, name, referral);
    }

    function createJoinRequest(address leaderAddress) external registrationIsOpen isNotMember {
        require(membersToTeam[msg.sender] == address(0), "You can't join multiple teams.");
        require(teams[leaderAddress].leader != address(0), "The team does not exist.");
        require(requests[msg.sender] == address(0), "You already have an active join request.");

        teams[leaderAddress].joinRequests.push(msg.sender);
        requests[msg.sender] = leaderAddress;

        emit JoinRequestCreated(msg.sender, leaderAddress);
    }

    function approveJoinRequest(address memberAddress) external registrationIsOpen {
        require(requests[memberAddress] == msg.sender, "This member did not apply.");
        require(membersToTeam[memberAddress] == address(0), "This member already joined a team.");

        // referralStorage.setTraderReferralCode(memberAddress, teams[msg.sender].referral);
        teams[msg.sender].members.push(memberAddress);
        membersToTeam[memberAddress] = msg.sender;
        requests[memberAddress] = address(0);

        emit JoinRequestApproved(memberAddress, msg.sender);
    }

    function cancelJoinRequest() external registrationIsOpen {
        requests[msg.sender] = address(0);
        emit JoinRequestCanceled(msg.sender);
    }

    function removeMember(address memberAddress) external registrationIsOpen {
        require(membersToTeam[memberAddress] == msg.sender, "This member is not in your team");
        membersToTeam[memberAddress] = address(0);

        for (uint i = 0; i < teams[msg.sender].members.length; i++) {
            if (teams[msg.sender].members[i] == memberAddress) {
                delete teams[msg.sender].members[i];
                break;
            }
        }

        emit MemberRemoved(msg.sender, memberAddress);
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
        emit TimesChanged(start, end);
    }

    function setEnd(uint end_) external onlyGov {
        end = end_;
        emit TimesChanged(start, end);
    }
}
