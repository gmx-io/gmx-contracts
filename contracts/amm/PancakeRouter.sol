// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/Token.sol";
import "../libraries/token/IERC20.sol";
import "./interfaces/IPancakeRouter.sol";

contract PancakeRouter is IPancakeRouter {
    address public pair;

    constructor(address _pair) public {
        pair = _pair;
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 /*amountAMin*/,
        uint256 /*amountBMin*/,
        address to,
        uint256 deadline
    ) external override returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        require(deadline >= block.timestamp, 'PancakeRouter: EXPIRED');

        Token(pair).mint(to, 1000);

        IERC20(tokenA).transferFrom(msg.sender, pair, amountADesired);
        IERC20(tokenB).transferFrom(msg.sender, pair, amountBDesired);

        amountA = amountADesired;
        amountB = amountBDesired;
        liquidity = 1000;
    }
}
