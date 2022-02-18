// SPDX-License-Identifier: MIT

pragma solidity ^0.6.0;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";
import "../tokens/interfaces/IWETH.sol";
import "../libraries/token/SafeERC20.sol";
import "../libraries/utils/Address.sol";
import "../libraries/utils/ReentrancyGuard.sol";

import "./interfaces/IRouter.sol";
import "./interfaces/IVault.sol";
import "../access/Governable.sol";
import "../peripherals/interfaces/ITimelock.sol";

contract CollateralDepositor is ReentrancyGuard, Governable {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Address for address payable;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    address public router;
    address public vault;
    address public weth;
    uint256 public depositFee; // 0.5%

    bool public isInitialized = false;

    constructor(
        address _router,
        address _vault,
        address _weth,
        uint256 _depositFee
    ) public {
        router = _router;
        vault = _vault;
        weth = _weth;
        depositFee = _depositFee;
    }

    function setDepositFee(uint256 _depositFee) external onlyGov {
        depositFee = _depositFee;
    }

    function approve(address _token, address _spender, uint256 _amount) external onlyGov {
        IERC20(_token).approve(_spender, _amount);
    }

    function depositCollateral(address _collateralToken, address _indexToken, bool _isLong, uint256 _amount) external nonReentrant {
        require(_amount > 0, "CollateralDepositor: invalid _amount");

        uint256 afterFeeAmount = _amount.mul(BASIS_POINTS_DIVISOR.sub(depositFee)).div(BASIS_POINTS_DIVISOR);
        uint256 feeAmount = _amount.sub(afterFeeAmount);

        IRouter(router).pluginTransfer(_collateralToken, msg.sender, address(this), feeAmount);
        IRouter(router).pluginTransfer(_collateralToken, msg.sender, vault, afterFeeAmount);

        _depositCollateral(msg.sender, _collateralToken, _indexToken, _isLong);
    }

    function depositCollateralETH() external payable nonReentrant {
        require(msg.value > 0, "CollateralDepositor: invalid msg.value");

        IWETH(weth).deposit{value: msg.value}();

        uint256 afterFeeAmount = msg.value.mul(BASIS_POINTS_DIVISOR.sub(depositFee)).div(BASIS_POINTS_DIVISOR);
        IERC20(weth).safeTransfer(vault, afterFeeAmount);

        _depositCollateral(msg.sender, weth, weth, true);
    }

    function _depositCollateral(address _account, address _collateralToken, address _indexToken, bool _isLong) private {
        address timelock = IVault(vault).gov();
        ITimelock(timelock).setIsLeverageEnabled(vault, true);
        IRouter(router).pluginIncreasePosition(_account, _collateralToken, _indexToken, 0, _isLong);
        ITimelock(timelock).setIsLeverageEnabled(vault, false);
    }
}
