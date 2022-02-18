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

contract PositionManager is ReentrancyGuard, Governable {
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

    function _getAfterFeeAmount(uint256 _amount, bool _isDeposit) internal view returns (uint256) {
        if (!_isDeposit) {
            return _amount;
        }
        return _amount.mul(BASIS_POINTS_DIVISOR.sub(depositFee)).div(BASIS_POINTS_DIVISOR);
    }

    function _checkIfDeposit(
        address _account,
        address _collateralToken,
        uint256 _collateralDeltaToken,
        address _indexToken,
        bool _isLong,
        uint256 _sizeDelta
    ) internal view returns (bool) {
        // _collateralDeltaToken is always > 0 inside this function
        if (_sizeDelta == 0) return true;

        IVault _vault = IVault(vault);
        (uint256 size, uint256 collateral, , , , , , ) = _vault.getPosition(_account, _collateralToken, _indexToken, _isLong);
        if (size == 0) return false;

        uint256 nextSize = size.add(_sizeDelta);
        uint256 collateralDelta = _vault.tokenToUsdMin(_collateralToken, _collateralDeltaToken);
        uint256 nextCollateral = collateral.add(collateralDelta);

        uint256 leverage = size.mul(BASIS_POINTS_DIVISOR).div(collateral);
        uint256 nextLeverage = nextSize.mul(BASIS_POINTS_DIVISOR + 1).div(nextCollateral);
        return nextLeverage < leverage;
    }

    function increasePosition(
        address[] memory _path,
        address _indexToken,
        uint256 _amountIn,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price
    ) external nonReentrant {
        if (_amountIn > 0) {
            if (_path.length > 1) {
                IRouter(router).pluginTransfer(_path[0], msg.sender, vault, _amountIn);
                _amountIn = _swap(_path, _minOut, address(this));
            } else {
                IRouter(router).pluginTransfer(_path[0], msg.sender, address(this), _amountIn);
            }
            bool isDeposit = _checkIfDeposit(msg.sender, _path[_path.length - 1], _amountIn, _indexToken, _isLong, _sizeDelta);
            uint256 afterFeeAmount = _getAfterFeeAmount(_amountIn, isDeposit);
            IERC20(_path[_path.length - 1]).safeTransfer(vault, afterFeeAmount);
        }
        _increasePosition(_path[_path.length - 1], _indexToken, _sizeDelta, _isLong, _price);
    }

    function increasePositionETH(
        address[] memory _path,
        address _indexToken,
        uint256 _minOut,
        uint256 _sizeDelta,
        bool _isLong,
        uint256 _price
    ) external payable nonReentrant {
        require(_path[0] == weth, "PositionManager: invalid _path");
        if (msg.value > 0) {
            uint256 _amountIn = msg.value;
            if (_path.length > 1) {
                IWETH(weth).depositTo{value: msg.value}(vault);
                _amountIn = _swap(_path, _minOut, address(this));
            } else {
                IWETH(weth).deposit{value: msg.value}();
            }
            bool isDeposit = _checkIfDeposit(msg.sender, _path[_path.length - 1], _amountIn, _indexToken, _isLong, _sizeDelta);
            uint256 afterFeeAmount = _getAfterFeeAmount(_amountIn, isDeposit);
            IERC20(_path[_path.length - 1]).safeTransfer(vault, afterFeeAmount);
        }
        _increasePosition(_path[_path.length - 1], _indexToken, _sizeDelta, _isLong, _price);
    }

    function _increasePosition(address _collateralToken, address _indexToken, uint256 _sizeDelta, bool _isLong, uint256 _price) private {
        if (_isLong) {
            require(IVault(vault).getMaxPrice(_indexToken) <= _price, "PositionManager: mark price higher than limit");
        } else {
            require(IVault(vault).getMinPrice(_indexToken) >= _price, "PositionManager: mark price lower than limit");
        }

        address timelock = IVault(vault).gov();
        ITimelock(timelock).setIsLeverageEnabled(vault, true);
        IRouter(router).pluginIncreasePosition(msg.sender, _collateralToken, _indexToken, _sizeDelta, _isLong);
        ITimelock(timelock).setIsLeverageEnabled(vault, false);
    }

    function _swap(address[] memory _path, uint256 _minOut, address _receiver) private returns (uint256) {
        if (_path.length == 2) {
            return _vaultSwap(_path[0], _path[1], _minOut, _receiver);
        }
        revert("PositionManager: invalid _path.length");
    }

    function _vaultSwap(address _tokenIn, address _tokenOut, uint256 _minOut, address _receiver) private returns (uint256) {
        uint256 amountOut = IVault(vault).swap(_tokenIn, _tokenOut, _receiver);
        require(amountOut >= _minOut, "PositionManager: insufficient amountOut");
        return amountOut;
    }
}
