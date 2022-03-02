// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";

import "./interfaces/ISecondaryPriceFeed.sol";
import "./interfaces/IFastPriceFeed.sol";
import "./interfaces/IFastPriceEvents.sol";
import "../access/Governable.sol";

pragma solidity 0.6.12;

contract FastPriceFeed is ISecondaryPriceFeed, IFastPriceFeed, Governable {
    using SafeMath for uint256;

    uint256 public constant PRICE_PRECISION = 10 ** 30;

    // uint256(~0) is 256 bits of 1s
    // shift the 1s by (256 - 32) to get (256 - 32) 0s followed by 32 1s
    uint256 constant public PRICE_BITMASK = uint256(~0) >> (256 - 32);

    bool public isInitialized;
    bool public isSpreadEnabled = false;
    address public fastPriceEvents;

    address public tokenManager;

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant MAX_PRICE_DURATION = 30 minutes;

    uint256 public override lastUpdatedAt;
    uint256 public override lastUpdatedBlock;

    uint256 public priceDuration;
    uint256 public minBlockInterval;

    // volatility basis points
    uint256 public volBasisPoints;
    // max deviation from primary price
    uint256 public maxDeviationBasisPoints;

    uint256 public minAuthorizations;
    uint256 public disableFastPriceVoteCount = 0;

    mapping (address => bool) public isAdmin;

    mapping (address => uint256) public prices;

    mapping (address => bool) public isSigner;
    mapping (address => bool) public disableFastPriceVotes;

    // array of tokens used in setCompactedPrices, saves L1 calldata gas costs
    address[] public tokens;
    // array of tokenPrecisions used in setCompactedPrices, saves L1 calldata gas costs
    // if the token price will be sent with 3 decimals, then tokenPrecision for that token
    // should be 10 ** 3
    uint256[] public tokenPrecisions;

    event DisableFastPrice(address signer);

    modifier onlySigner() {
        require(isSigner[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyAdmin() {
        require(isAdmin[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "FastPriceFeed: forbidden");
        _;
    }

    constructor(
      uint256 _priceDuration,
      uint256 _minBlockInterval,
      uint256 _maxDeviationBasisPoints,
      address _fastPriceEvents,
      address _tokenManager
    ) public {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
        minBlockInterval = _minBlockInterval;
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
        fastPriceEvents = _fastPriceEvents;
        tokenManager = _tokenManager;
    }

    function initialize(uint256 _minAuthorizations, address[] memory _signers, address[] memory _admins) public onlyGov {
        require(!isInitialized, "FastPriceFeed: already initialized");
        isInitialized = true;

        minAuthorizations = _minAuthorizations;

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = true;
        }

        for (uint256 i = 0; i < _admins.length; i++) {
            address admin = _admins[i];
            isAdmin[admin] = true;
        }
    }

    function setAdmin(address _account, bool _isActive) external onlyTokenManager {
        isAdmin[_account] = _isActive;
    }

    function setFastPriceEvents(address _fastPriceEvents) external onlyGov {
      fastPriceEvents = _fastPriceEvents;
    }

    function setPriceDuration(uint256 _priceDuration) external onlyGov {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
    }

    function setIsSpreadEnabled(bool _isSpreadEnabled) external onlyGov {
        isSpreadEnabled = _isSpreadEnabled;
    }

    function setVolBasisPoints(uint256 _volBasisPoints) external onlyGov {
        volBasisPoints = _volBasisPoints;
    }

    function setTokens(address[] memory _tokens, uint256[] memory _tokenPrecisions) external onlyGov {
        require(_tokens.length == _tokenPrecisions.length, "FastPriceFeed: invalid lengths");
        tokens = _tokens;
        tokenPrecisions = _tokenPrecisions;
    }

    // do not call setLastUpdatedAt, if the fast price submitter is not updating then
    // the Chainlink price should be used instead since this function does not update all token prices
    function setPrice(address _token, uint256 _price) external override onlyAdmin {
        prices[_token] = _price;
        IFastPriceEvents(fastPriceEvents).emitPriceEvent(_token, _price);
    }

    function setPrices(address[] memory _tokens, uint256[] memory _prices) external onlyAdmin {
        setLastUpdatedAt();

        for (uint256 i = 0; i < _tokens.length; i++) {
            address token = _tokens[i];
            prices[token] = _prices[i];
            if (fastPriceEvents != address(0)) {
              IFastPriceEvents(fastPriceEvents).emitPriceEvent(token, _prices[i]);
            }
        }
    }

    function setPricesWithBits(uint256 _priceBits) external onlyAdmin {
        setLastUpdatedAt();

        for (uint256 j = 0; j < 8; j++) {
            uint256 index = j;
            if (index >= tokens.length) { return; }

            uint256 startBit = 32 * j;
            uint256 price = (_priceBits >> startBit) & PRICE_BITMASK;

            address token = tokens[j];
            uint256 tokenPrecision = tokenPrecisions[j];
            uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);
            prices[token] = adjustedPrice;

            if (fastPriceEvents != address(0)) {
              IFastPriceEvents(fastPriceEvents).emitPriceEvent(token, adjustedPrice);
            }
        }
    }

    function setCompactedPrices(uint256[] memory _priceBitArray) external onlyAdmin {
        setLastUpdatedAt();

        for (uint256 i = 0; i < _priceBitArray.length; i++) {
            uint256 priceBits = _priceBitArray[i];

            for (uint256 j = 0; j < 8; j++) {
                uint256 index = i * 8 + j;
                if (index >= tokens.length) { return; }

                uint256 startBit = 32 * j;
                uint256 price = (priceBits >> startBit) & PRICE_BITMASK;

                address token = tokens[i * 8 + j];
                uint256 tokenPrecision = tokenPrecisions[i * 8 + j];
                uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);
                prices[token] = adjustedPrice;

                if (fastPriceEvents != address(0)) {
                  IFastPriceEvents(fastPriceEvents).emitPriceEvent(token, adjustedPrice);
                }
            }
        }
    }

    function disableFastPrice() external onlySigner {
        require(!disableFastPriceVotes[msg.sender], "FastPriceFeed: already voted");
        disableFastPriceVotes[msg.sender] = true;
        disableFastPriceVoteCount = disableFastPriceVoteCount.add(1);

        emit DisableFastPrice(msg.sender);
    }

    function enableFastPrice() external onlySigner {
        require(disableFastPriceVotes[msg.sender], "FastPriceFeed: already enabled");
        disableFastPriceVotes[msg.sender] = false;
        disableFastPriceVoteCount = disableFastPriceVoteCount.sub(1);
    }

    function favorFastPrice() public view returns (bool) {
        if (isSpreadEnabled) {
            return false;
        }

        if (disableFastPriceVoteCount >= minAuthorizations) {
            return false;
        }

        return true;
    }

    function getPrice(address _token, uint256 _refPrice, bool _maximise) external override view returns (uint256) {
        if (block.timestamp > lastUpdatedAt.add(priceDuration)) { return _refPrice; }

        uint256 fastPrice = prices[_token];
        if (fastPrice == 0) { return _refPrice; }

        uint256 maxPrice = _refPrice.mul(BASIS_POINTS_DIVISOR.add(maxDeviationBasisPoints)).div(BASIS_POINTS_DIVISOR);
        uint256 minPrice = _refPrice.mul(BASIS_POINTS_DIVISOR.sub(maxDeviationBasisPoints)).div(BASIS_POINTS_DIVISOR);

        if (favorFastPrice()) {
            if (fastPrice >= minPrice && fastPrice <= maxPrice) {
                if (_maximise) {
                    if (_refPrice > fastPrice) {
                        uint256 volPrice = fastPrice.mul(BASIS_POINTS_DIVISOR.add(volBasisPoints)).div(BASIS_POINTS_DIVISOR);
                        // the volPrice should not be more than _refPrice
                        return volPrice > _refPrice ? _refPrice : volPrice;
                    }
                    return fastPrice;
                }

                if (_refPrice < fastPrice) {
                    uint256 volPrice = fastPrice.mul(BASIS_POINTS_DIVISOR.sub(volBasisPoints)).div(BASIS_POINTS_DIVISOR);
                    // the volPrice should not be less than _refPrice
                    return volPrice < _refPrice ? _refPrice : volPrice;
                }

                return fastPrice;
            }
        }

        if (_maximise) {
            if (_refPrice > fastPrice) { return _refPrice; }
            return fastPrice > maxPrice ? maxPrice : fastPrice;
        }

        if (_refPrice < fastPrice) { return _refPrice; }
        return fastPrice < minPrice ? minPrice : fastPrice;
    }

    function setLastUpdatedAt() private {
        require(block.number.sub(lastUpdatedBlock) >= minBlockInterval, "FastPriceFeed: minBlockInterval not yet passed");
        lastUpdatedAt = block.timestamp;
        lastUpdatedBlock = block.number;
    }
}
