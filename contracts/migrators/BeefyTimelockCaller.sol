// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "./interfaces/ITimelockController.sol";

pragma experimental ABIEncoderV2;

contract BeefyTimelockCaller {
    bool public isInitialized;
    address public parent;
    address public gov;
    uint256 public chainId;

    constructor() public {
        gov = msg.sender;
    }

    function initialize(
        uint256 _chainId,
        address _parent
    ) external {
        require(msg.sender == gov, "forbidden");
        require(!isInitialized, "already initialized");
        isInitialized = true;

        chainId = _chainId;
        parent = _parent;
    }

    function executeProposals() external {
        require(msg.sender == parent, "forbidden");

        if (chainId == 42161) {
            ITimelockController timelock = ITimelockController(0x9A94784264AaAE397441c1e47fA132BE4e61BdaD);

            address[] memory targets = new address[](2);
            targets[0] = 0x5B904f19fb9ccf493b623e5c8cE91603665788b0;
            targets[1] = 0x9dbbBaecACEDf53d5Caa295b8293c1def2055Adc;

            uint256[] memory values = new uint256[](2);
            values[0] = 0;
            values[1] = 0;

            bytes[] memory payloads = new bytes[](2);
            payloads[0] = hex"e6685244";
            payloads[1] = hex"e6685244";

            bytes32 predecessor = 0x0000000000000000000000000000000000000000000000000000000000000000;
            bytes32 salt = 0x0000000000000000000000000000000000000000000000000000000000000000;

            timelock.executeBatch(
                targets,
                values,
                payloads,
                predecessor,
                salt
            );
        }

        if (chainId == 43114) {
            ITimelockController timelock = ITimelockController(0x690216f462615b749bEEB5AA3f1d89a2BEc45Ecf);

            address[] memory targets = new address[](2);
            targets[0] = 0x408835a5616baE0ECE4d3eF821C1D1CC88a2179E;
            targets[1] = 0x22EafB9C7E2858cfDA712940896464DdAA83d053;

            uint256[] memory values = new uint256[](2);
            values[0] = 0;
            values[1] = 0;

            bytes[] memory payloads = new bytes[](2);
            payloads[0] = hex"e6685244";
            payloads[1] = hex"e6685244";

            bytes32 predecessor = 0x0000000000000000000000000000000000000000000000000000000000000000;
            bytes32 salt = 0x0000000000000000000000000000000000000000000000000000000000000000;

            timelock.executeBatch(
                targets,
                values,
                payloads,
                predecessor,
                salt
            );
        }
    }
}
