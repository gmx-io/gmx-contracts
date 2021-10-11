// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../core/interfaces/IGlpManager.sol";

import "./interfaces/IRewardTracker.sol";

contract wGLP is IERC20 {
    using SafeMath for uint256;

    string public constant name = "Wrapped GLP";
    string public constant symbol = "wGLP";
    uint8 public constant decimals = 18;

    address public glp;
    IGlpManager public glpManager;
    address public stakedGlpTracker;
    address public feeGlpTracker;

    mapping (address => mapping (address => uint256)) public allowances;

    constructor(
        address _glp,
        IGlpManager _glpManager,
        address _stakedGlpTracker,
        address _feeGlpTracker
    ) public {
        glp = _glp;
        glpManager = _glpManager;
        stakedGlpTracker = _stakedGlpTracker;
        feeGlpTracker = _feeGlpTracker;
    }

    function totalSupply() external override view returns (uint256) {
        return IERC20(stakedGlpTracker).totalSupply();
    }

    function balanceOf(address _account) external override view returns (uint256) {
        return IERC20(stakedGlpTracker).balanceOf(_account);
    }

    function allowance(address _owner, address _spender) external override view returns (uint256) {
        return allowances[_owner][_spender];
    }

    function approve(address _spender, uint256 _amount) external override returns (bool) {
        _approve(msg.sender, _spender, _amount);
        return true;
    }

    function transfer(address _recipient, uint256 _amount) external override returns (bool) {
        _transfer(msg.sender, _recipient, _amount);
        return true;
    }

    function transferFrom(address _sender, address _recipient, uint256 _amount) external override returns (bool) {
        uint256 nextAllowance = allowances[_sender][msg.sender].sub(_amount, "wGLP: transfer amount exceeds allowance");
        _approve(_sender, msg.sender, nextAllowance);
        _transfer(_sender, _recipient, _amount);
        return true;
    }

    function _approve(address _owner, address _spender, uint256 _amount) private {
        require(_owner != address(0), "wGLP: approve from the zero address");
        require(_spender != address(0), "wGLP: approve to the zero address");

        allowances[_owner][_spender] = _amount;

        emit Approval(_owner, _spender, _amount);
    }

    function _transfer(address _sender, address _recipient, uint256 _amount) private {
        require(_sender != address(0), "wGLP: transfer from the zero address");
        require(_recipient != address(0), "wGLP: transfer to the zero address");

        require(
            glpManager.lastAddedAt(_sender).add(glpManager.cooldownDuration()) <= block.timestamp,
            "wGLP: cooldown duration not yet passed"
        );

        IRewardTracker(stakedGlpTracker).unstakeForAccount(_sender, feeGlpTracker, _amount, _sender);
        IRewardTracker(feeGlpTracker).unstakeForAccount(_sender, glp, _amount, _sender);

        IRewardTracker(feeGlpTracker).stakeForAccount(_sender, _recipient, glp, _amount);
        IRewardTracker(stakedGlpTracker).stakeForAccount(_sender, _recipient, feeGlpTracker, _amount);

        emit Transfer(_sender, _recipient,_amount);
    }
}
