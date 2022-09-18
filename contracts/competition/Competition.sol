// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "../referrals/interfaces/IReferralStorage.sol";
import "../access/Governable.sol";

contract Competition is Governable {
    struct Team {
        address leader;
        string name;
        address[] members;
    }

    struct Competition {
        uint start;
        uint end;
        uint maxTeamSize;
        mapping(address => Team) teams;
        mapping(string => bool) teamNames;
        mapping(address => address) memberTeams;
        mapping(address => address) joinRequests;
        mapping(address => mapping(address => bytes32)) joinRequestsReferralCodes;
    }

    Competition[] public competitions;
    IReferralStorage public referralStorage;

    event TeamCreated(uint index, address leader, string name);
    event JoinRequestCreated(uint index, address member, address leader, bytes32 referralCode);
    event JoinRequestCanceled(uint index, address member);
    event JoinRequestApproved(uint index, address member, address leader);
    event MemberRemoved(uint index, address leader, address member);
    event CompetitionCreated(uint index, uint start, uint end, uint maxTeamSize);
    event CompetitionUpdated(uint index, uint start, uint end, uint maxTeamSize);
    event CompetitionRemoved(uint index);

    modifier registrationIsOpen(uint competitionIndex) {
        require(competitions[competitionIndex].start > block.timestamp, "Competition: Registration is closed.");
        _;
    }

    modifier isNotMember(uint competitionIndex) {
        require(competitions[competitionIndex].memberTeams[msg.sender] == address(0), "Competition: Team members are not allowed.");
        _;
    }

    modifier competitionExists(uint index) {
        require(competitions.length > index && competitions[index].start > 0, "Competition: The competition does not exist.");
        _;
    }

    constructor(IReferralStorage _referralStorage) public {
        referralStorage = _referralStorage;
    }

    function createCompetition(uint start, uint end, uint maxTeamSize) external onlyGov {
        _validateCompetitionParameters(start, end, maxTeamSize);

        competitions.push(Competition(start, end, maxTeamSize));

        emit CompetitionCreated(competitions.length - 1, start, end, maxTeamSize);
    }

    function updateCompetition(uint index, uint start, uint end, uint maxTeamSize) external onlyGov competitionExists(index) {
        _validateCompetitionParameters(start, end, maxTeamSize);

        competitions[index] = Competition(start, end, maxTeamSize);

        emit CompetitionUpdated(index, start, end, maxTeamSize);
    }

    function removeCompetition(uint index) external onlyGov competitionExists(index) {
        require(competitions[index].start > block.timestamp, "Competition: Competition is active.");

        delete competitions[index];

        emit CompetitionRemoved(index);
    }

    function createTeam(uint competitionIndex, string calldata name) external registrationIsOpen(competitionIndex) isNotMember(competitionIndex) {
        Competition storage competition = competitions[competitionIndex];

        require(!competition.teamNames[name], "Competition: Team name already registered.");

        Team storage team = competition.teams[msg.sender];
        team.leader = msg.sender;
        team.name = name;
        team.members.push(msg.sender);

        competition.teamNames[name] = true;
        competition.memberTeams[msg.sender] = msg.sender;

        emit TeamCreated(competitionIndex, msg.sender, name);
    }

    function createJoinRequest(uint competitionIndex, address leaderAddress, bytes32 referralCode) external registrationIsOpen(competitionIndex) isNotMember(competitionIndex) {
        Competition storage competition = competitions[competitionIndex];

        require(competition.memberTeams[msg.sender] == address(0), "Competition: You can't join multiple teams.");
        require(competition.teams[leaderAddress].leader != address(0), "Competition: The team does not exist.");

        if (referralCode != bytes32(0)) {
            require(referralStorage.codeOwners(referralCode) != address(0), "Competition: The referral code does not exist.");
        }

        competition.joinRequests[msg.sender] = leaderAddress;
        competition.joinRequestsReferralCodes[msg.sender][leaderAddress] = referralCode;

        emit JoinRequestCreated(competitionIndex, msg.sender, leaderAddress, referralCode);
    }

    function approveJoinRequest(uint competitionIndex, address[] calldata memberAddresses) external registrationIsOpen(competitionIndex) {
        Competition storage competition = competitions[competitionIndex];

        for (uint i = 0; i < memberAddresses.length; i++) {
            address memberAddress = memberAddresses[i];
            require(competition.joinRequests[memberAddress] == msg.sender, "Competition: Member did not apply.");
            require(competition.memberTeams[memberAddress] == address(0), "Competition: Member already joined a team.");
            require(competition.teams[msg.sender].members.length < competition.maxTeamSize, "Competition: Team is full.");

            if (competition.joinRequestsReferralCodes[memberAddress][msg.sender] != bytes32(0)) {
                referralStorage.setTraderReferralCode(memberAddress, competition.joinRequestsReferralCodes[memberAddress][msg.sender]);
            }

            competition.teams[msg.sender].members.push(memberAddress);
            competition.memberTeams[memberAddress] = msg.sender;
            competition.joinRequests[memberAddress] = address(0);

            emit JoinRequestApproved(competitionIndex, memberAddress, msg.sender);
        }
    }

    function cancelJoinRequest(uint competitionIndex) external registrationIsOpen(competitionIndex) {
        competitions[competitionIndex].joinRequests[msg.sender] = address(0);
        emit JoinRequestCanceled(competitionIndex, msg.sender);
    }

    function removeMember(uint competitionIndex, address leaderAddress, address memberAddress) external registrationIsOpen(competitionIndex) {
        Competition storage competition = competitions[competitionIndex];

        require(competition.memberTeams[memberAddress] == msg.sender || memberAddress == msg.sender, "Competition: You are not allowed to remove this member.");

        address[] memory oldMembers = competition.teams[leaderAddress].members;
        address[] memory newMembers = new address[](oldMembers.length - 1);
        for (uint i = 0; i < oldMembers.length; i++) {
            if (oldMembers[i] != memberAddress) {
                newMembers[i] = oldMembers[i];
            }
        }

        competition.teams[leaderAddress].members = newMembers;
        competition.memberTeams[memberAddress] = address(0);

        emit MemberRemoved(competitionIndex, leaderAddress, memberAddress);
    }

    function getTeam(uint competitionIndex, address _leaderAddress) external view returns (address leaderAddress, string memory name) {
        Team memory team = competitions[competitionIndex].teams[_leaderAddress];
        return (team.leader, team.name);
    }

    function getTeamMembers(uint competitionIndex, address leaderAddress, uint start, uint offset) external view returns (address[] memory members) {
        address[] memory members = competitions[competitionIndex].teams[leaderAddress].members;
        address[] memory result = new address[](offset);

        for (uint i = start; i < start + offset && i < members.length; i++) {
            result[i] = members[i];
        }

        return result;
    }

    function getMemberTeam(uint competitionIndex, address memberAddress) external view returns (address leaderAddress) {
        return competitions[competitionIndex].memberTeams[memberAddress];
    }

    function getJoinRequest(uint competitionIndex, address memberAddress) external view returns (address leaderAddress) {
        return competitions[competitionIndex].joinRequests[memberAddress];
    }

    function validateName(uint competitionIndex, string calldata name) external view returns (bool isValid) {
        return !competitions[competitionIndex].teamNames[name];
    }

    function _validateCompetitionParameters(uint start, uint end, uint maxTeamSize) internal {
        require(start > block.timestamp, "Competition: Start time must be in the future.");
        require(end > start, "Competition: End time must be greater than start time.");
        require(maxTeamSize > 0, "Competition: Max team size must be greater than zero.");
    }
}
