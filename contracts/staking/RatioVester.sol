// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IEsGmxIssuer.sol";
import "./interfaces/IRatioVester.sol";
import "../tokens/interfaces/IMintable.sol";
import "../access/Guardable.sol";

contract RatioVester is IRatioVester, IERC20, ReentrancyGuard, Guardable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    struct Tranche {
        uint256 startTime;
        uint256 totalAmount;
        uint256 convertedAmount;
    }

    uint256 public constant PAIR_RATIO_PRECISION = 10 ** 30;
    uint256 public constant EPOCH_DURATION = 7 days;
    // unix epoch day zero is a Thursday; the offset aligns epoch boundaries to Wednesday 00:00 UTC
    uint256 public constant EPOCH_OFFSET = 1 days;
    uint256 public constant MIN_DEACTIVATION_NOTICE = 7 days;

    string public name;
    string public symbol;
    uint8 public decimals = 18;

    uint256 public vestingDuration;

    address public esToken;
    address public pairToken;
    address public claimableToken;
    address public override issuer;

    uint256 public pairRatioFactor;
    bool public isUncapped;

    bool public isIssuerBindingConfirmed;
    bool public provisioningComplete;
    bool public depositPaused;
    bool public transferPaused;
    uint256 public deactivatedAt;

    uint256 public override totalSupply;
    uint256 public pairSupply;
    uint256 public totalConverted;
    uint256 public totalGmxClaimed;

    mapping (address => uint256) public balances;
    mapping (address => uint256) public override pairAmounts;
    mapping (address => uint256) public cumulativeClaimAmounts;
    mapping (address => uint256) public claimedAmounts;
    mapping (address => uint256) public unpaidClaimAmounts;
    mapping (address => uint256) public totalConvertedAmounts;

    mapping (address => uint256) public provisionCaps;
    mapping (address => uint256) public transferredCaps;
    mapping (address => uint256) public transferredCapDeductions;
    mapping (address => uint256) public govCapDeductions;

    mapping (address => Tranche[]) public tranches;
    mapping (address => uint256) public trancheStartIndex;

    mapping (address => bool) public override isHandler;
    mapping (address => bool) public override isFrozen;

    event Deposit(address account, uint256 amount, uint256 pairShortfall);
    event Withdraw(address account, uint256 esAmount, uint256 pairAmount, uint256 unpaidCarried);
    event Claim(address receiver, uint256 amount);
    event Convert(address account, uint256 amount);
    event PairTransfer(address indexed from, address indexed to, uint256 value);
    event ProvisionCapSet(address account, uint256 cap);
    event CapDeductionIncreased(address account, uint256 amount);
    event CapDeductionDecreased(address account, uint256 amount);
    event AccountFrozenSet(address account, bool isFrozen);
    event DeactivatedAtSet(uint256 deactivatedAt);
    event VestingStateTransferred(address sender, address receiver, uint256 cap, uint256 usage, uint256 unpaid);

    constructor (
        string memory _name,
        string memory _symbol,
        uint256 _vestingDuration,
        address _esToken,
        address _pairToken,
        address _claimableToken,
        address _issuer,
        uint256 _pairRatioFactor,
        bool _isUncapped
    ) public {
        name = _name;
        symbol = _symbol;

        vestingDuration = _vestingDuration;

        esToken = _esToken;
        pairToken = _pairToken;
        claimableToken = _claimableToken;
        issuer = _issuer;

        pairRatioFactor = _pairRatioFactor;
        isUncapped = _isUncapped;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
    }

    function setDepositPaused(bool _depositPaused) external onlyGuardian {
        depositPaused = _depositPaused;
    }

    function setTransferPaused(bool _transferPaused) external onlyGuardian {
        transferPaused = _transferPaused;
    }

    function setAccountFrozen(address _account, bool _isFrozen) external onlyGuardian {
        isFrozen[_account] = _isFrozen;
        emit AccountFrozenSet(_account, _isFrozen);
    }

    function increaseCapDeduction(address _account, uint256 _amount) external onlyGuardian {
        govCapDeductions[_account] = govCapDeductions[_account].add(_amount);
        emit CapDeductionIncreased(_account, _amount);
    }

    function decreaseCapDeduction(address _account, uint256 _amount) external onlyGov {
        govCapDeductions[_account] = govCapDeductions[_account].sub(_amount);
        emit CapDeductionDecreased(_account, _amount);
    }

    function setDeactivatedAt(uint256 _deactivatedAt) external onlyGov {
        require(deactivatedAt == 0 || block.timestamp < deactivatedAt, "RatioVester: already deactivated");
        if (deactivatedAt == 0) {
            require(_deactivatedAt >= block.timestamp.add(MIN_DEACTIVATION_NOTICE), "RatioVester: notice period too short");
        } else {
            require(_deactivatedAt > deactivatedAt, "RatioVester: can only push out");
        }
        deactivatedAt = _deactivatedAt;
        emit DeactivatedAtSet(_deactivatedAt);
    }

    function confirmIssuerBinding() external {
        require(issuer != address(0), "RatioVester: no issuer");
        require(IEsGmxIssuer(issuer).vester() == address(this), "RatioVester: issuer not bound");
        isIssuerBindingConfirmed = true;
    }

    function setProvisionCaps(address[] calldata _accounts, uint256[] calldata _caps) external onlyCapsAdmin {
        require(!provisioningComplete, "RatioVester: provisioning complete");
        require(_accounts.length == _caps.length, "RatioVester: invalid input lengths");
        for (uint256 i = 0; i < _accounts.length; i++) {
            provisionCaps[_accounts[i]] = _caps[i];
            emit ProvisionCapSet(_accounts[i], _caps[i]);
        }
    }

    function setProvisioningComplete() external onlyCapsAdmin {
        provisioningComplete = true;
    }

    function withdrawToken(address _token, address _receiver, uint256 _amount) external onlyGov {
        uint256 balance = IERC20(_token).balanceOf(address(this));
        if (_token == pairToken) {
            require(_amount <= balance.sub(pairSupply), "RatioVester: amount exceeds excess balance");
        } else if (_token == esToken) {
            require(_amount <= balance.sub(totalSupply), "RatioVester: amount exceeds excess balance");
        } else if (_token == claimableToken) {
            uint256 obligations = totalSupply.add(totalConverted.sub(totalGmxClaimed));
            require(_amount <= balance.sub(obligations), "RatioVester: amount exceeds excess balance");
        }
        IERC20(_token).safeTransfer(_receiver, _amount);
    }

    function deposit(uint256 _amount) external nonReentrant {
        _deposit(msg.sender, _amount);
    }

    function depositForAccount(address _account, uint256 _amount) external override nonReentrant {
        _validateHandler();
        _deposit(_account, _amount);
    }

    function withdraw() external nonReentrant {
        _withdraw(msg.sender);
    }

    function withdrawForAccount(address _account) external override nonReentrant {
        _validateHandler();
        _withdraw(_account);
    }

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender);
    }

    function claimForAccount(address _account) external override nonReentrant returns (uint256) {
        _validateHandler();
        return _claim(_account);
    }

    function settleTranches(address _account, uint256 _maxTranches) external nonReentrant {
        _settle(_account, _maxTranches);
    }

    function transferVestingState(address _sender, address _receiver) external override nonReentrant {
        _validateHandler();
        require(provisioningComplete, "RatioVester: provisioning not complete");
        require(!transferPaused, "RatioVester: transfers paused");
        require(_sender != _receiver, "RatioVester: self transfer");
        require(!isFrozen[_sender] && !isFrozen[_receiver], "RatioVester: account frozen");

        _settle(_sender, uint256(-1));
        require(!hasOpenSession(_sender), "RatioVester: sender has open session");
        require(isFreshForTransfer(_receiver), "RatioVester: receiver not fresh");

        uint256 cap = getVestingCap(_sender);
        uint256 usageMoved = 0;
        if (cap > 0 && !(issuer == address(0) && isUncapped)) {
            transferredCaps[_receiver] = transferredCaps[_receiver].add(cap);
            transferredCapDeductions[_sender] = transferredCapDeductions[_sender].add(cap);
            usageMoved = totalConvertedAmounts[_sender] < cap ? totalConvertedAmounts[_sender] : cap;
            totalConvertedAmounts[_sender] = totalConvertedAmounts[_sender].sub(usageMoved);
            totalConvertedAmounts[_receiver] = totalConvertedAmounts[_receiver].add(usageMoved);
        }

        uint256 unpaid = unpaidClaimAmounts[_sender];
        if (unpaid > 0) {
            unpaidClaimAmounts[_sender] = 0;
            unpaidClaimAmounts[_receiver] = unpaidClaimAmounts[_receiver].add(unpaid);
        }

        emit VestingStateTransferred(_sender, _receiver, cap, usageMoved, unpaid);
    }

    function getVestingCap(address _account) public view override returns (uint256) {
        if (issuer == address(0) && isUncapped) { return uint256(-1); }

        uint256 cap = provisionCaps[_account].add(transferredCaps[_account]);
        if (issuer != address(0)) {
            cap = cap.add(IEsGmxIssuer(issuer).issuedAmounts(_account));
        }

        // subtract each deduction with saturation so an oversized deduction can never brick settlement or withdrawal
        uint256 transferredDeduction = transferredCapDeductions[_account];
        cap = cap > transferredDeduction ? cap - transferredDeduction : 0;
        uint256 govDeduction = govCapDeductions[_account];
        return cap > govDeduction ? cap - govDeduction : 0;
    }

    function getTotalVested(address _account) public view returns (uint256) {
        return balances[_account].add(totalConvertedAmounts[_account]);
    }

    function getPairRequirement(uint256 _balance) public view returns (uint256) {
        return _balance.mul(pairRatioFactor).add(PAIR_RATIO_PRECISION.sub(1)).div(PAIR_RATIO_PRECISION);
    }

    function currentEpoch() public view returns (uint256) {
        return block.timestamp.add(EPOCH_OFFSET).div(EPOCH_DURATION);
    }

    function isDeactivated() public view returns (bool) {
        return deactivatedAt != 0 && block.timestamp >= deactivatedAt;
    }

    function tranchesLength(address _account) external view returns (uint256) {
        return tranches[_account].length;
    }

    function hasOpenSession(address _account) public view override returns (bool) {
        return balances[_account] > 0 || pairAmounts[_account] > 0 || cumulativeClaimAmounts[_account] > 0;
    }

    function isFreshForTransfer(address _account) public view override returns (bool) {
        return balances[_account] == 0
            && pairAmounts[_account] == 0
            && cumulativeClaimAmounts[_account] == 0
            && claimedAmounts[_account] == 0
            && unpaidClaimAmounts[_account] == 0
            && totalConvertedAmounts[_account] == 0
            && transferredCaps[_account] == 0
            && transferredCapDeductions[_account] == 0
            && govCapDeductions[_account] == 0
            && tranches[_account].length == trancheStartIndex[_account];
    }

    function claimable(address _account) public view override returns (uint256) {
        uint256 amount = cumulativeClaimAmounts[_account].sub(claimedAmounts[_account]).add(unpaidClaimAmounts[_account]);
        return amount.add(_pendingConversion(_account));
    }

    function balanceOf(address _account) external view override returns (uint256) {
        return balances[_account];
    }

    // the vester receipt is non-transferable, matching the legacy Vester
    function transfer(address, uint256) external override returns (bool) {
        revert("RatioVester: non-transferrable");
    }

    function allowance(address, address) external view override returns (uint256) {
        return 0;
    }

    function approve(address, uint256) external override returns (bool) {
        revert("RatioVester: non-transferrable");
    }

    function transferFrom(address, address, uint256) external override returns (bool) {
        revert("RatioVester: non-transferrable");
    }

    function _deposit(address _account, uint256 _amount) private {
        require(!depositPaused, "RatioVester: deposits paused");
        require(!isDeactivated(), "RatioVester: deactivated");
        require(_amount > 0, "RatioVester: invalid amount");
        if (issuer != address(0)) {
            require(isIssuerBindingConfirmed, "RatioVester: issuer binding not confirmed");
        }

        _settle(_account, uint256(-1));

        uint256 cap = getVestingCap(_account);
        if (cap != uint256(-1)) {
            require(getTotalVested(_account).add(_amount) <= cap, "RatioVester: cap exceeded");
        }

        uint256 obligations = totalSupply.add(_amount).add(totalConverted.sub(totalGmxClaimed));
        require(obligations <= IERC20(claimableToken).balanceOf(address(this)), "RatioVester: insufficient backing");

        IERC20(esToken).safeTransferFrom(_account, address(this), _amount);

        Tranche[] storage list = tranches[_account];
        uint256 epoch = currentEpoch();
        bool merged = false;
        if (list.length > trancheStartIndex[_account]) {
            Tranche storage last = list[list.length - 1];
            if (last.startTime.add(EPOCH_OFFSET).div(EPOCH_DURATION) == epoch) {
                last.totalAmount = last.totalAmount.add(_amount);
                merged = true;
            }
        }
        if (!merged) {
            list.push(Tranche({
                startTime: block.timestamp,
                totalAmount: _amount,
                convertedAmount: 0
            }));
        }

        balances[_account] = balances[_account].add(_amount);
        totalSupply = totalSupply.add(_amount);
        emit Transfer(address(0), _account, _amount);

        uint256 requirement = getPairRequirement(balances[_account]);
        uint256 shortfall = 0;
        if (requirement > pairAmounts[_account]) {
            shortfall = requirement.sub(pairAmounts[_account]);
            IERC20(pairToken).safeTransferFrom(_account, address(this), shortfall);
            pairAmounts[_account] = pairAmounts[_account].add(shortfall);
            pairSupply = pairSupply.add(shortfall);
            emit PairTransfer(_account, address(this), shortfall);
        }

        emit Deposit(_account, _amount, shortfall);
    }

    function _withdraw(address _account) private {
        _settle(_account, uint256(-1));

        uint256 balance = balances[_account];
        uint256 pairAmount = pairAmounts[_account];
        require(balance > 0 || pairAmount > 0 || cumulativeClaimAmounts[_account] > 0, "RatioVester: nothing to withdraw");

        uint256 unpaid = cumulativeClaimAmounts[_account].sub(claimedAmounts[_account]);
        if (unpaid > 0) {
            unpaidClaimAmounts[_account] = unpaidClaimAmounts[_account].add(unpaid);
        }
        delete cumulativeClaimAmounts[_account];
        delete claimedAmounts[_account];

        trancheStartIndex[_account] = tranches[_account].length;

        if (balance > 0) {
            balances[_account] = 0;
            totalSupply = totalSupply.sub(balance);
            IERC20(esToken).safeTransfer(_account, balance);
            emit Transfer(_account, address(0), balance);
        }

        if (pairAmount > 0) {
            pairAmounts[_account] = 0;
            pairSupply = pairSupply.sub(pairAmount);
            IERC20(pairToken).safeTransfer(_account, pairAmount);
            emit PairTransfer(address(this), _account, pairAmount);
        }

        emit Withdraw(_account, balance, pairAmount, unpaid);
    }

    function _claim(address _account) private returns (uint256) {
        require(!isFrozen[_account], "RatioVester: account frozen");
        _settle(_account, uint256(-1));

        uint256 amount = cumulativeClaimAmounts[_account].sub(claimedAmounts[_account]).add(unpaidClaimAmounts[_account]);
        if (amount == 0) { return 0; }

        claimedAmounts[_account] = cumulativeClaimAmounts[_account];
        unpaidClaimAmounts[_account] = 0;
        totalGmxClaimed = totalGmxClaimed.add(amount);

        IERC20(claimableToken).safeTransfer(_account, amount);
        emit Claim(_account, amount);
        return amount;
    }

    function _settle(address _account, uint256 _maxTranches) private {
        if (isFrozen[_account]) { return; }

        Tranche[] storage list = tranches[_account];
        uint256 start = trancheStartIndex[_account];
        uint256 endTime = block.timestamp;
        if (deactivatedAt != 0 && endTime > deactivatedAt) { endTime = deactivatedAt; }

        uint256 headroom = _capHeadroom(_account);
        uint256 totalDelta = 0;
        uint256 processed = 0;

        for (uint256 i = start; i < list.length; i++) {
            if (processed >= _maxTranches) { break; }
            processed = processed.add(1);

            Tranche storage tranche = list[i];
            uint256 elapsed = endTime > tranche.startTime ? endTime.sub(tranche.startTime) : 0;
            if (elapsed > vestingDuration) { elapsed = vestingDuration; }

            uint256 target = tranche.totalAmount.mul(elapsed).div(vestingDuration);
            if (target > tranche.convertedAmount) {
                uint256 delta = target.sub(tranche.convertedAmount);
                if (headroom != uint256(-1) && delta > headroom) { delta = headroom; }
                if (delta > 0) {
                    tranche.convertedAmount = tranche.convertedAmount.add(delta);
                    totalDelta = totalDelta.add(delta);
                    if (headroom != uint256(-1)) { headroom = headroom.sub(delta); }
                }
            }

            if (tranche.convertedAmount == tranche.totalAmount && i == start) {
                start = start.add(1);
            }

            if (headroom == 0) { break; }
        }

        if (start != trancheStartIndex[_account]) {
            trancheStartIndex[_account] = start;
        }

        if (totalDelta > 0) {
            balances[_account] = balances[_account].sub(totalDelta);
            totalSupply = totalSupply.sub(totalDelta);
            cumulativeClaimAmounts[_account] = cumulativeClaimAmounts[_account].add(totalDelta);
            totalConvertedAmounts[_account] = totalConvertedAmounts[_account].add(totalDelta);
            totalConverted = totalConverted.add(totalDelta);

            IMintable(esToken).burn(address(this), totalDelta);
            emit Transfer(_account, address(0), totalDelta);
            emit Convert(_account, totalDelta);
        }
    }

    function _pendingConversion(address _account) private view returns (uint256) {
        if (isFrozen[_account]) { return 0; }

        Tranche[] storage list = tranches[_account];
        uint256 endTime = block.timestamp;
        if (deactivatedAt != 0 && endTime > deactivatedAt) { endTime = deactivatedAt; }

        uint256 headroom = _capHeadroom(_account);
        uint256 totalDelta = 0;

        for (uint256 i = trancheStartIndex[_account]; i < list.length; i++) {
            Tranche storage tranche = list[i];
            uint256 elapsed = endTime > tranche.startTime ? endTime.sub(tranche.startTime) : 0;
            if (elapsed > vestingDuration) { elapsed = vestingDuration; }

            uint256 target = tranche.totalAmount.mul(elapsed).div(vestingDuration);
            if (target > tranche.convertedAmount) {
                uint256 delta = target.sub(tranche.convertedAmount);
                if (headroom != uint256(-1)) {
                    if (delta > headroom) { delta = headroom; }
                    headroom = headroom.sub(delta);
                }
                totalDelta = totalDelta.add(delta);
            }

            if (headroom == 0) { break; }
        }

        return totalDelta;
    }

    function _capHeadroom(address _account) private view returns (uint256) {
        uint256 cap = getVestingCap(_account);
        if (cap == uint256(-1)) { return uint256(-1); }
        uint256 used = totalConvertedAmounts[_account];
        if (cap <= used) { return 0; }
        return cap.sub(used);
    }

    function _validateHandler() private view {
        require(isHandler[msg.sender], "RatioVester: forbidden");
    }
}
