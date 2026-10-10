// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "../tokens/interfaces/IMintable.sol";
import "../access/Governable.sol";

// SCDEV-316 PoC: season-scoped Vester sharing one esGMX token across seasons. Deltas
// from the legacy Vester: the cap is an issuance ledger written by the season's reward
// distributor (not tracker cumulativeRewards), withdraw() keeps cumulativeClaimAmounts
// so converted amounts consume the cap permanently, and the pair requirement is a fixed
// ratio of the tracker's receipt token (which sums GMX + esGMX staked 1:1)
contract SeasonVester is IERC20, ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    string public name;
    string public symbol;
    uint8 public decimals = 18;

    uint256 public vestingDuration;
    uint256 public pairRatio;

    address public esToken;
    address public pairToken;
    address public claimableToken;

    uint256 public override totalSupply;
    uint256 public pairSupply;

    mapping (address => uint256) public balances;
    mapping (address => uint256) public pairAmounts;
    mapping (address => uint256) public cumulativeClaimAmounts;
    mapping (address => uint256) public claimedAmounts;
    mapping (address => uint256) public lastVestingTimes;

    // esGMX distributed to the account this season; written by a handler, never decreased
    mapping (address => uint256) public issuedAmounts;

    mapping (address => bool) public isHandler;

    event Claim(address receiver, uint256 amount);
    event Deposit(address account, uint256 amount);
    event Withdraw(address account, uint256 claimedAmount, uint256 balance);
    event PairTransfer(address indexed from, address indexed to, uint256 value);
    event IssuanceIncrease(address account, uint256 amount);
    event SeasonStateTransfer(address sender, address receiver, uint256 issuedAmount, uint256 usedAmount);

    constructor (
        string memory _name,
        string memory _symbol,
        uint256 _vestingDuration,
        uint256 _pairRatio,
        address _esToken,
        address _pairToken,
        address _claimableToken
    ) public {
        name = _name;
        symbol = _symbol;

        vestingDuration = _vestingDuration;
        pairRatio = _pairRatio;

        esToken = _esToken;
        pairToken = _pairToken;
        claimableToken = _claimableToken;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        isHandler[_handler] = _isActive;
    }

    function increaseIssuedAmounts(address _account, uint256 _amount) external nonReentrant {
        _validateHandler();
        issuedAmounts[_account] = issuedAmounts[_account].add(_amount);
        emit IssuanceIncrease(_account, _amount);
    }

    // the cap moves together with its used amount so remaining headroom is conserved;
    // moving only the cap (as legacy transferStakeValues does) re-opens it at the receiver
    function transferSeasonState(address _sender, address _receiver) external nonReentrant {
        _validateHandler();
        // a self-transfer would zero the account's state after the additive write
        require(_sender != _receiver, "SeasonVester: self transfer");
        require(balances[_sender] == 0, "SeasonVester: sender has active vesting balance");
        require(pairAmounts[_sender] == 0, "SeasonVester: sender has pair amount in custody");

        uint256 issuedAmount = issuedAmounts[_sender];
        uint256 usedAmount = cumulativeClaimAmounts[_sender];

        issuedAmounts[_receiver] = issuedAmounts[_receiver].add(issuedAmount);
        cumulativeClaimAmounts[_receiver] = cumulativeClaimAmounts[_receiver].add(usedAmount);
        claimedAmounts[_receiver] = claimedAmounts[_receiver].add(claimedAmounts[_sender]);

        issuedAmounts[_sender] = 0;
        cumulativeClaimAmounts[_sender] = 0;
        claimedAmounts[_sender] = 0;

        emit SeasonStateTransfer(_sender, _receiver, issuedAmount, usedAmount);
    }

    function deposit(uint256 _amount) external nonReentrant {
        _deposit(msg.sender, _amount);
    }

    function depositForAccount(address _account, uint256 _amount) external nonReentrant {
        _validateHandler();
        _deposit(_account, _amount);
    }

    function claim() external nonReentrant returns (uint256) {
        return _claim(msg.sender, msg.sender);
    }

    function claimForAccount(address _account, address _receiver) external nonReentrant returns (uint256) {
        _validateHandler();
        return _claim(_account, _receiver);
    }

    // to help users who accidentally send their tokens to this contract
    function withdrawToken(address _token, address _account, uint256 _amount) external onlyGov {
        IERC20(_token).safeTransfer(_account, _amount);
    }

    function withdraw() external nonReentrant {
        address account = msg.sender;
        address _receiver = account;
        _claim(account, _receiver);

        uint256 claimedAmount = cumulativeClaimAmounts[account];
        uint256 balance = balances[account];
        uint256 totalVested = balance.add(claimedAmount);
        require(totalVested > 0, "SeasonVester: vested amount is zero");

        if (hasPairToken()) {
            uint256 pairAmount = pairAmounts[account];
            _burnPair(account, pairAmount);
            IERC20(pairToken).safeTransfer(_receiver, pairAmount);
        }

        IERC20(esToken).safeTransfer(_receiver, balance);
        _burn(account, balance);

        // unlike the legacy Vester, cumulativeClaimAmounts/claimedAmounts are kept:
        // converted amounts consume the season cap permanently
        delete lastVestingTimes[account];

        emit Withdraw(account, claimedAmount, balance);
    }

    function claimable(address _account) public view returns (uint256) {
        uint256 amount = cumulativeClaimAmounts[_account].sub(claimedAmounts[_account]);
        uint256 nextClaimable = _getNextClaimableAmount(_account);
        return amount.add(nextClaimable);
    }

    function getMaxVestableAmount(address _account) public view returns (uint256) {
        return issuedAmounts[_account];
    }

    function getPairAmount(uint256 _esAmount) public view returns (uint256) {
        return _esAmount.mul(pairRatio);
    }

    function hasPairToken() public view returns (bool) {
        return pairToken != address(0);
    }

    function getTotalVested(address _account) public view returns (uint256) {
        return balances[_account].add(cumulativeClaimAmounts[_account]);
    }

    function balanceOf(address _account) public view override returns (uint256) {
        return balances[_account];
    }

    // empty implementation, tokens are non-transferrable
    function transfer(address /* recipient */, uint256 /* amount */) public override returns (bool) {
        revert("SeasonVester: non-transferrable");
    }

    // empty implementation, tokens are non-transferrable
    function allowance(address /* owner */, address /* spender */) public view virtual override returns (uint256) {
        return 0;
    }

    // empty implementation, tokens are non-transferrable
    function approve(address /* spender */, uint256 /* amount */) public virtual override returns (bool) {
        revert("SeasonVester: non-transferrable");
    }

    // empty implementation, tokens are non-transferrable
    function transferFrom(address /* sender */, address /* recipient */, uint256 /* amount */) public virtual override returns (bool) {
        revert("SeasonVester: non-transferrable");
    }

    function getVestedAmount(address _account) public view returns (uint256) {
        return balances[_account].add(cumulativeClaimAmounts[_account]);
    }

    function _mint(address _account, uint256 _amount) private {
        require(_account != address(0), "SeasonVester: mint to the zero address");

        totalSupply = totalSupply.add(_amount);
        balances[_account] = balances[_account].add(_amount);

        emit Transfer(address(0), _account, _amount);
    }

    function _mintPair(address _account, uint256 _amount) private {
        require(_account != address(0), "SeasonVester: mint to the zero address");

        pairSupply = pairSupply.add(_amount);
        pairAmounts[_account] = pairAmounts[_account].add(_amount);

        emit PairTransfer(address(0), _account, _amount);
    }

    function _burn(address _account, uint256 _amount) private {
        require(_account != address(0), "SeasonVester: burn from the zero address");

        balances[_account] = balances[_account].sub(_amount, "SeasonVester: burn amount exceeds balance");
        totalSupply = totalSupply.sub(_amount);

        emit Transfer(_account, address(0), _amount);
    }

    function _burnPair(address _account, uint256 _amount) private {
        require(_account != address(0), "SeasonVester: burn from the zero address");

        pairAmounts[_account] = pairAmounts[_account].sub(_amount, "SeasonVester: burn amount exceeds balance");
        pairSupply = pairSupply.sub(_amount);

        emit PairTransfer(_account, address(0), _amount);
    }

    function _deposit(address _account, uint256 _amount) private {
        require(_amount > 0, "SeasonVester: invalid _amount");

        _updateVesting(_account);

        IERC20(esToken).safeTransferFrom(_account, address(this), _amount);

        _mint(_account, _amount);

        if (hasPairToken()) {
            uint256 pairAmount = pairAmounts[_account];
            uint256 nextPairAmount = getPairAmount(balances[_account]);
            if (nextPairAmount > pairAmount) {
                uint256 pairAmountDiff = nextPairAmount.sub(pairAmount);
                IERC20(pairToken).safeTransferFrom(_account, address(this), pairAmountDiff);
                _mintPair(_account, pairAmountDiff);
            }
        }

        uint256 maxAmount = getMaxVestableAmount(_account);
        require(getTotalVested(_account) <= maxAmount, "SeasonVester: max vestable amount exceeded");

        emit Deposit(_account, _amount);
    }

    function _updateVesting(address _account) private {
        uint256 amount = _getNextClaimableAmount(_account);
        lastVestingTimes[_account] = block.timestamp;

        if (amount == 0) {
            return;
        }

        // transfer claimableAmount from balances to cumulativeClaimAmounts
        _burn(_account, amount);
        cumulativeClaimAmounts[_account] = cumulativeClaimAmounts[_account].add(amount);

        IMintable(esToken).burn(address(this), amount);
    }

    function _getNextClaimableAmount(address _account) private view returns (uint256) {
        uint256 timeDiff = block.timestamp.sub(lastVestingTimes[_account]);

        uint256 balance = balances[_account];
        if (balance == 0) { return 0; }

        uint256 vestedAmount = getVestedAmount(_account);
        uint256 claimableAmount = vestedAmount.mul(timeDiff).div(vestingDuration);

        if (claimableAmount < balance) {
            return claimableAmount;
        }

        return balance;
    }

    function _claim(address _account, address _receiver) private returns (uint256) {
        _updateVesting(_account);
        uint256 amount = claimable(_account);
        claimedAmounts[_account] = claimedAmounts[_account].add(amount);
        IERC20(claimableToken).safeTransfer(_receiver, amount);
        emit Claim(_account, amount);
        return amount;
    }

    function _validateHandler() private view {
        require(isHandler[msg.sender], "SeasonVester: forbidden");
    }
}
