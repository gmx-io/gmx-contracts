// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/utils/UnstructuredStorage.sol";
import "./StOPEN.sol";
import "../libraries/utils/ReentrancyGuard.sol";

contract OpenStaking is StOPEN, ReentrancyGuard {
    using SafeMath for uint256;
    using UnstructuredStorage for bytes32;

    uint256 public constant FEE_DECIMALS = 10000;

    mapping(address => bool) public operators;
    mapping(address => uint256) public lastClaimTimestamp;
    mapping(address => uint256) public stakedAmounts;
    address public depositToken;
    uint256 public unstakingFee = 25; // 0.25%

    uint256 public unstakingThreshold = 2 * 24 * 60 * 60; // 1 day

    event Submitted(address indexed sender, uint256 amount, address referral);

    modifier isOperator(address _sender) {
        require(operators[_sender], "OpenStaking: forbidden");
        _;
    }

    constructor(address _depositToken) public {
        depositToken = _depositToken;
        operators[msg.sender] = true;
    }

    /**
     * @notice Send funds to the pool with optional _referral parameter
     * @dev This function is alternative way to submit funds. Supports optional referral address.
     * @return Amount of StETH shares generated
     */
    function submit(address _referral, uint256 _amount)
        external
        nonReentrant
        returns (uint256)
    {
        return _submit(_referral, _amount);
    }

    /**
     * @dev Gets the total amount of Ether controlled by the system
     * @return total balance in wei
     */
    function _getTotalPooledOpen() internal view override returns (uint256) {
        return IERC20(depositToken).balanceOf(address(this));
    }

    /**
     * @dev Process user deposit, mints liquid tokens and increase the pool buffer
     * @param _referral address of referral.
     * @return amount of StETH shares generated
     */
    function _submit(address _referral, uint256 _amount)
        internal
        returns (uint256)
    {
        address account = msg.sender;
        require(_amount != 0, "ZERO_DEPOSIT");
        require(
            IERC20(depositToken).balanceOf(account) >= _amount,
            "OpenStaking: exceed amounts"
        );
        uint256 sharesAmount = getSharesByPooledEth(_amount);
        IERC20(depositToken).transferFrom(account, address(this), _amount);
        stakedAmounts[account] += _amount;

        if (sharesAmount == 0) {
            // totalControlledEther is 0: either the first-ever deposit or complete slashing
            // assume that shares correspond to Ether 1-to-1
            sharesAmount = _amount;
        }

        _mintShares(account, sharesAmount);

        lastClaimTimestamp[account] = block.timestamp;

        emit Submitted(account, _amount, _referral);

        _emitTransferAfterMintingShares(account, sharesAmount);
        return sharesAmount;
    }

    function unstake() external nonReentrant returns (uint256) {
        return _unstake();
    }

    function _unstake() internal returns (uint256) {
        address account = msg.sender;
        require(
            lastClaimTimestamp[account].add(unstakingThreshold) <=
                block.timestamp,
            "OpenStaking: threshold time not reach"
        );

        uint256 shareAmount = sharesOf(account);
        stakedAmounts[account] = 0;
        uint256 amountAfterFee = getAmountAfterFee(
            getPooledEthByShares(shareAmount)
        );
        IERC20(depositToken).transfer(account, amountAfterFee);
        return _burnShares(account, shareAmount);
    }

    function addOperator(address _account) public isOperator(msg.sender) {
        require(!operators[_account], "OpenStaking: existed operator");
        operators[_account] = true;
    }

    function removeOperator(address _account) public isOperator(msg.sender) {
        require(operators[_account], "OpenStaking: not operator");
        operators[_account] = false;
    }

    function setUnstakingFee(uint256 _fee) public isOperator(msg.sender) {
        require(_fee <= 2000, "OpenStaking: max fee is 20%");
        unstakingFee = _fee;
    }

    function setUnstakingThreshold(uint256 _threshold)
        public
        isOperator(msg.sender)
    {
        require(_threshold != 0, "OpenStaking: invalid threshold");
        unstakingThreshold = _threshold;
    }

    function getStakedAmount(address _account) public view returns (uint256) {
        return stakedAmounts[_account];
    }

    function getStakeInfo(address _account)
        public
        view
        returns (uint256[] memory)
    {
        uint256[] memory result = new uint256[](8);
        result[0] = getTotalPooledEther();
        result[1] = getTotalShares();
        result[2] = sharesOf(_account);
        result[3] = getStakedAmount(_account);
        result[4] = balanceOf(_account);
        result[5] = lastClaimTimestamp[_account];
        result[6] = unstakingFee;
        result[7] = unstakingThreshold;
        return result;
    }

    function getAmountAfterFee(uint256 _amount) public view returns (uint256) {
        uint256 fee = _amount.mul(unstakingFee).div(FEE_DECIMALS);
        return _amount.sub(fee);
    }

    /**
     * @dev Emits {Transfer} and {TransferShares} events where `from` is 0 address. Indicates mint events.
     */
    function _emitTransferAfterMintingShares(address _to, uint256 _sharesAmount)
        internal
    {
        emit Transfer(address(0), _to, getPooledEthByShares(_sharesAmount));
        emit TransferShares(address(0), _to, _sharesAmount);
    }

    function emergencyWithdraw(address _token) external isOperator(msg.sender) {
        IERC20(_token).transfer(
            msg.sender,
            IERC20(_token).balanceOf(address(this))
        );
    }
}
