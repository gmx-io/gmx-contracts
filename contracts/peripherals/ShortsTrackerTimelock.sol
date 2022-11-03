// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";
import "../access/Governable.sol";
import "../core/interfaces/IShortsTracker.sol";

pragma solidity 0.6.12;

contract ShortsTrackerTimelock is Governable {
    using SafeMath for uint256;

    event GlobalShortAveragePriceUpdated(address indexed token, uint256 oldAveragePrice, uint256 newAveragePrice);
    event SetHandler(address indexed handler, bool isHandler);
    event SetMaxAveragePriceChange(address token, uint256 maxAveragePriceChange);
    event SetUpdateDelay(uint256 updateDelay);
    event SetIsGlobalShortDataReady(bool isGlobalShortDataReady);

    mapping (address => bool) public isHandler;
    mapping (address => uint256) public lastUpdated;
    mapping (address => uint256) public maxAveragePriceChange;
    uint256 public updateDelay;

    constructor(uint256 _updateDelay) public {
        updateDelay = _updateDelay;
    }

    modifier onlyHandler() {
        require(isHandler[msg.sender] || msg.sender == gov, "ShortsTrackerTimelock: forbidden");
        _;
    }

    function setHandler(address _handler, bool _isActive) external onlyGov {
        require(_handler != address(0), "ShortsTrackerTimelock: invalid _handler");
        isHandler[_handler] = _isActive;

        emit SetHandler(_handler, _isActive);
    }

    function setUpdateDelay(uint256 _updateDelay) external onlyGov {
        updateDelay = _updateDelay;

        emit SetUpdateDelay(_updateDelay);
    }

    function setMaxAveragePriceChange(address _token, uint256 _maxAveragePriceChange) external onlyGov {
        require(_maxAveragePriceChange <= 10000, "ShortsTrackerTimelock: invalid _maxAveragePriceChange");
        maxAveragePriceChange[_token] = _maxAveragePriceChange;

        emit SetMaxAveragePriceChange(_token, _maxAveragePriceChange);
    }

    function setIsGlobalShortDataReady(IShortsTracker _shortsTracker, bool value) external onlyGov {
        _shortsTracker.setIsGlobalShortDataReady(value);

        emit SetIsGlobalShortDataReady(value);
    }

    function setGlobalShortAveragePrices(IShortsTracker _shortsTracker, address[] calldata _tokens, uint256[] calldata _averagePrices) external onlyHandler {
        _shortsTracker.setIsGlobalShortDataReady(false);

        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            uint256 oldAveragePrice = _shortsTracker.globalShortAveragePrices(token);
            uint256 newAveragePrice = _averagePrices[i];
            uint256 diff = newAveragePrice > oldAveragePrice ? newAveragePrice.sub(oldAveragePrice) : oldAveragePrice.sub(newAveragePrice);
            require(diff.mul(10000).div(oldAveragePrice) < maxAveragePriceChange[token], "ShortsTrackerTimelock: too big change");

            require(block.timestamp >= lastUpdated[token].add(updateDelay), "ShortsTrackerTimelock: too early");
            lastUpdated[token] = block.timestamp;

            emit GlobalShortAveragePriceUpdated(token, oldAveragePrice, newAveragePrice);
        }

        _shortsTracker.setInitData(_tokens, _averagePrices);
    }

    function setShortsTrackerGov(IShortsTracker _shortsTracker, address _gov) external onlyGov {
        Governable(address(_shortsTracker)).setGov(_gov);
    }
}
