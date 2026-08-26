// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IEsGmxIssuer.sol";
import "../access/Guardable.sol";

contract EsGmxIssuer is IEsGmxIssuer, ReentrancyGuard, Guardable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Epoch {
        bool finalized;
        uint256 entryCount;
        uint256 totalAmount;
    }

    address public esGmx;
    address public override vester;

    uint256 public totalIssuedAmount;
    uint256 public totalClaimedAmount;

    bool public claimsPaused;

    mapping (address => uint256) public override issuedAmounts;
    mapping (address => uint256) public claimedAmounts;

    mapping (address => bool) public isHandler;
    mapping (address => bool) public isDistributor;

    mapping (uint256 => Epoch) public epochs;
    mapping (uint256 => mapping (uint256 => bool)) public processedBatchIndexes;
    mapping (uint256 => mapping (bytes32 => bool)) public processedBatchHashes;

    event Issue(uint256 epochId, uint256 batchIndex, address account, uint256 amount);
    event BatchDistributed(uint256 epochId, uint256 batchIndex, uint256 entryCount, uint256 totalAmount);
    event EpochFinalized(uint256 epochId, uint256 entryCount, uint256 totalAmount);
    event Claim(address account, uint256 amount);
    event IssuanceReduced(address account, uint256 amount);

    constructor(address _esGmx) public {
        esGmx = _esGmx;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
    }

    function setDistributor(address _distributor, bool _isActive) external onlyCapsAdmin {
        isDistributor[_distributor] = _isActive;
    }

    function setClaimsPaused(bool _claimsPaused) external onlyGuardian {
        claimsPaused = _claimsPaused;
    }

    function setVester(address _vester) external onlyGov {
        require(vester == address(0), "EsGmxIssuer: vester already set");
        require(_vester != address(0), "EsGmxIssuer: invalid vester");
        vester = _vester;
    }

    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        if (_token == esGmx) {
            uint256 balance = IERC20(esGmx).balanceOf(address(this));
            uint256 outstanding = totalIssuedAmount.sub(totalClaimedAmount);
            require(_amount <= balance.sub(outstanding), "EsGmxIssuer: amount exceeds excess balance");
        }
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function distributeEpoch(
        uint256 _epochId,
        uint256 _batchIndex,
        address[] calldata _accounts,
        uint256[] calldata _amounts
    ) external nonReentrant {
        require(isDistributor[msg.sender], "EsGmxIssuer: forbidden");
        require(_accounts.length > 0, "EsGmxIssuer: empty batch");
        require(_accounts.length == _amounts.length, "EsGmxIssuer: invalid input lengths");
        require(!epochs[_epochId].finalized, "EsGmxIssuer: epoch finalized");
        require(!processedBatchIndexes[_epochId][_batchIndex], "EsGmxIssuer: batch index already processed");

        bytes32 batchHash = keccak256(abi.encode(_accounts, _amounts));
        require(!processedBatchHashes[_epochId][batchHash], "EsGmxIssuer: batch content already processed");

        processedBatchIndexes[_epochId][_batchIndex] = true;
        processedBatchHashes[_epochId][batchHash] = true;

        uint256 batchTotal = 0;
        for (uint256 i = 0; i < _accounts.length; i++) {
            // ascending order closes the intra-batch duplicate-account blind spot
            if (i > 0) {
                require(_accounts[i] > _accounts[i - 1], "EsGmxIssuer: accounts not sorted");
            }
            address account = _accounts[i];
            uint256 amount = _amounts[i];
            require(account != address(0), "EsGmxIssuer: invalid account");
            require(amount > 0, "EsGmxIssuer: invalid amount");

            issuedAmounts[account] = issuedAmounts[account].add(amount);
            batchTotal = batchTotal.add(amount);

            emit Issue(_epochId, _batchIndex, account, amount);
        }

        totalIssuedAmount = totalIssuedAmount.add(batchTotal);
        epochs[_epochId].entryCount = epochs[_epochId].entryCount.add(_accounts.length);
        epochs[_epochId].totalAmount = epochs[_epochId].totalAmount.add(batchTotal);

        require(
            totalIssuedAmount.sub(totalClaimedAmount) <= IERC20(esGmx).balanceOf(address(this)),
            "EsGmxIssuer: insufficient esGMX for issuance"
        );

        emit BatchDistributed(_epochId, _batchIndex, _accounts.length, batchTotal);
    }

    function finalizeEpoch(uint256 _epochId, uint256 _expectedEntryCount, uint256 _expectedTotal) external onlyCapsAdmin {
        Epoch storage epoch = epochs[_epochId];
        require(!epoch.finalized, "EsGmxIssuer: epoch finalized");
        require(epoch.entryCount == _expectedEntryCount, "EsGmxIssuer: entry count mismatch");
        require(epoch.totalAmount == _expectedTotal, "EsGmxIssuer: total amount mismatch");
        epoch.finalized = true;
        emit EpochFinalized(_epochId, epoch.entryCount, epoch.totalAmount);
    }

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    function claimForAccount(address _account) external override nonReentrant returns (uint256) {
        require(isHandler[msg.sender], "EsGmxIssuer: forbidden");
        return _claim(_account);
    }

    function reduceIssuedAmount(address _account, uint256 _amount) external onlyCapsAdmin nonReentrant {
        require(_amount <= claimable(_account), "EsGmxIssuer: amount exceeds unclaimed");
        issuedAmounts[_account] = issuedAmounts[_account].sub(_amount);
        totalIssuedAmount = totalIssuedAmount.sub(_amount);
        emit IssuanceReduced(_account, _amount);
    }

    function claimable(address _account) public view override returns (uint256) {
        return issuedAmounts[_account].sub(claimedAmounts[_account]);
    }

    function _claim(address _account) private returns (uint256) {
        require(!claimsPaused, "EsGmxIssuer: claims paused");
        uint256 amount = claimable(_account);
        if (amount == 0) { return 0; }

        claimedAmounts[_account] = claimedAmounts[_account].add(amount);
        totalClaimedAmount = totalClaimedAmount.add(amount);
        IERC20(esGmx).safeTransfer(_account, amount);

        emit Claim(_account, amount);
        return amount;
    }
}
