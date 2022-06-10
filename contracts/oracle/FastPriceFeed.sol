// SPDX-License-Identifier: MIT

import "../libraries/math/SafeMath.sol";

import "./interfaces/ISecondaryPriceFeed.sol";
import "./interfaces/IFastPriceFeed.sol";
import "./interfaces/IFastPriceEvents.sol";
import "../core/interfaces/IVaultPriceFeed.sol";
import "../core/interfaces/IPositionRouter.sol";
import "../access/Governable.sol";

pragma solidity 0.6.12;

contract FastPriceFeed is ISecondaryPriceFeed, IFastPriceFeed, Governable {
    using SafeMath for uint256;

    // fit data in a uint256 slot to save gas costs
    struct PriceDataItem {
        uint160 refPrice; // Chainlink price
        uint32 refTime; // last updated at time
        uint32 cumulativeRefDelta; // cumulative Chainlink price delta
        uint32 cumulativeFastDelta; // cumulative fast price delta
    }

    uint256 public constant PRICE_PRECISION = 10 ** 30;

    uint256 public constant CUMULATIVE_DELTA_PRECISION = 10 * 1000 * 1000;

    uint256 public constant MAX_REF_PRICE = type(uint160).max;
    uint256 public constant MAX_CUMULATIVE_REF_DELTA = type(uint32).max;
    uint256 public constant MAX_CUMULATIVE_FAST_DELTA = type(uint32).max;

    // uint256(~0) is 256 bits of 1s
    // shift the 1s by (256 - 32) to get (256 - 32) 0s followed by 32 1s
    uint256 constant public BITMASK_32 = uint256(~0) >> (256 - 32);

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant MAX_PRICE_DURATION = 30 minutes;

    bool public isInitialized;
    bool public isSpreadEnabled = false;

    address public vaultPriceFeed;
    address public fastPriceEvents;

    address public tokenManager;

    address public positionRouter;

    uint256 public override lastUpdatedAt;
    uint256 public override lastUpdatedBlock;

    uint256 public priceDuration;
    uint256 public maxPriceUpdateDelay;
    uint256 public minBlockInterval;
    uint256 public maxTimeDeviation;

    uint256 public maxCumulativeDeltaDiff;
    uint256 public priceDataInterval;

    // volatility basis points
    uint256 public volBasisPoints;
    // max deviation from primary price
    uint256 public maxDeviationBasisPoints;
    // max deviation from primary price, beyond which an error would be thrown
    uint256 public maxDeviationBasisPointsBeforeError;

    uint256 public minAuthorizations;
    uint256 public disableFastPriceVoteCount = 0;

    mapping (address => bool) public isUpdater;

    mapping (address => uint256) public prices;
    mapping (address => PriceDataItem) public priceData;

    mapping (address => bool) public isSigner;
    mapping (address => bool) public disableFastPriceVotes;

    // array of tokens used in setCompactedPrices, saves L1 calldata gas costs
    address[] public tokens;
    // array of tokenPrecisions used in setCompactedPrices, saves L1 calldata gas costs
    // if the token price will be sent with 3 decimals, then tokenPrecision for that token
    // should be 10 ** 3
    uint256[] public tokenPrecisions;

    event DisableFastPrice(address signer);
    event EnableFastPrice(address signer);
    event PriceData(address token, uint256 refPrice, uint256 fastPrice, uint256 cumulativeRefDelta, uint256 cumulativeFastDelta);
    event MaxCumulativeDeltaDiffExceeded(address token, uint256 refPrice, uint256 fastPrice, uint256 cumulativeRefDelta, uint256 cumulativeFastDelta);

    modifier onlySigner() {
        require(isSigner[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyUpdater() {
        require(isUpdater[msg.sender], "FastPriceFeed: forbidden");
        _;
    }

    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "FastPriceFeed: forbidden");
        _;
    }

    constructor(
      uint256 _priceDuration,
      uint256 _maxPriceUpdateDelay,
      uint256 _minBlockInterval,
      uint256 _maxDeviationBasisPoints,
      uint256 _maxDeviationBasisPointsBeforeError,
      address _fastPriceEvents,
      address _tokenManager,
      address _positionRouter
    ) public {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
        minBlockInterval = _minBlockInterval;
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
        maxDeviationBasisPointsBeforeError = _maxDeviationBasisPointsBeforeError;
        fastPriceEvents = _fastPriceEvents;
        tokenManager = _tokenManager;
        positionRouter = _positionRouter;
    }

    function initialize(uint256 _minAuthorizations, address[] memory _signers, address[] memory _updaters) public onlyGov {
        require(!isInitialized, "FastPriceFeed: already initialized");
        isInitialized = true;

        minAuthorizations = _minAuthorizations;

        for (uint256 i = 0; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = true;
        }

        for (uint256 i = 0; i < _updaters.length; i++) {
            address updater = _updaters[i];
            isUpdater[updater] = true;
        }
    }

    function setTokenManager(address _tokenManager) external onlyGov {
        tokenManager = _tokenManager;
    }

    function setSigner(address _account, bool _isActive) external override onlyGov {
        isSigner[_account] = _isActive;
    }

    function setUpdater(address _account, bool _isActive) external onlyGov {
        isUpdater[_account] = _isActive;
    }

    function setFastPriceEvents(address _fastPriceEvents) external onlyGov {
      fastPriceEvents = _fastPriceEvents;
    }

    function setVaultPriceFeed(address _vaultPriceFeed) external onlyGov {
      vaultPriceFeed = _vaultPriceFeed;
    }

    function setPriceDuration(uint256 _priceDuration) external onlyGov {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
    }

    function setMaxPriceUpdateDelay(uint256 _maxPriceUpdateDelay) external onlyGov {
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
    }

    function setMinBlockInterval(uint256 _minBlockInterval) external onlyGov {
        minBlockInterval = _minBlockInterval;
    }

    function setIsSpreadEnabled(bool _isSpreadEnabled) external override onlyGov {
        isSpreadEnabled = _isSpreadEnabled;
    }

    function setMaxTimeDeviation(uint256 _maxTimeDeviation) external onlyGov {
        maxTimeDeviation = _maxTimeDeviation;
    }

    function setMaxCumulativeDeltaDiff(uint256 _maxCumulativeDeltaDiff) external onlyGov {
        maxCumulativeDeltaDiff = _maxCumulativeDeltaDiff;
    }

    function setPriceDataInterval(uint256 _priceDataInterval) external onlyGov {
        priceDataInterval = _priceDataInterval;
    }

    function setLastUpdatedAt(uint256 _lastUpdatedAt) external onlyGov {
        lastUpdatedAt = _lastUpdatedAt;
    }

    function setVolBasisPoints(uint256 _volBasisPoints) external onlyGov {
        volBasisPoints = _volBasisPoints;
    }

    function setMaxDeviationBasisPoints(uint256 _maxDeviationBasisPoints) external onlyGov {
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
    }

    function setMaxDeviationBasisPointsBeforeError(uint256 _maxDeviationBasisPointsBeforeError) external onlyGov {
        maxDeviationBasisPointsBeforeError = _maxDeviationBasisPointsBeforeError;
    }

    function setMinAuthorizations(uint256 _minAuthorizations) external onlyTokenManager {
        minAuthorizations = _minAuthorizations;
    }

    function setTokens(address[] memory _tokens, uint256[] memory _tokenPrecisions) external onlyGov {
        require(_tokens.length == _tokenPrecisions.length, "FastPriceFeed: invalid lengths");
        tokens = _tokens;
        tokenPrecisions = _tokenPrecisions;
    }

    function setPrices(address[] memory _tokens, uint256[] memory _prices, uint256 _timestamp) external onlyUpdater {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            address _fastPriceEvents = fastPriceEvents;
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 i = 0; i < _tokens.length; i++) {
                address token = _tokens[i];
                _setPrice(token, _prices[i], _vaultPriceFeed, _fastPriceEvents);
            }
        }
    }

    function setCompactedPrices(uint256[] memory _priceBitArray, uint256 _timestamp) external onlyUpdater {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            address _fastPriceEvents = fastPriceEvents;
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 i = 0; i < _priceBitArray.length; i++) {
                uint256 priceBits = _priceBitArray[i];

                for (uint256 j = 0; j < 8; j++) {
                    uint256 index = i * 8 + j;
                    if (index >= tokens.length) { return; }

                    uint256 startBit = 32 * j;
                    uint256 price = (priceBits >> startBit) & BITMASK_32;

                    address token = tokens[i * 8 + j];
                    uint256 tokenPrecision = tokenPrecisions[i * 8 + j];
                    uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                    _setPrice(token, adjustedPrice, _vaultPriceFeed, _fastPriceEvents);
                }
            }
        }
    }

    function setPricesWithBits(uint256 _priceBits, uint256 _timestamp) external onlyUpdater {
        _setPricesWithBits(_priceBits, _timestamp);
    }

    function setPricesWithBitsAndExecute(uint256 _priceBits, uint256 _timestamp, uint256 _endIndexForIncreasePositions, uint256 _endIndexForDecreasePositions) external onlyUpdater {
        _setPricesWithBits(_priceBits, _timestamp);

        IPositionRouter _positionRouter = IPositionRouter(positionRouter);
        _positionRouter.executeIncreasePositions(_endIndexForIncreasePositions, payable(msg.sender));
        _positionRouter.executeDecreasePositions(_endIndexForDecreasePositions, payable(msg.sender));
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

        emit EnableFastPrice(msg.sender);
    }

    function getPrice(address _token, uint256 _refPrice, bool _maximise) external override view returns (uint256) {
        if (lastUpdatedAt > 0 && block.timestamp > lastUpdatedAt.add(maxPriceUpdateDelay)) { revert("Prices are stale"); }
        if (block.timestamp > lastUpdatedAt.add(priceDuration)) { return _refPrice; }

        uint256 fastPrice = prices[_token];
        if (fastPrice == 0) { return _refPrice; }

        uint256 diff = _refPrice > fastPrice ? _refPrice.sub(fastPrice) : fastPrice.sub(_refPrice);
        if (diff.mul(BASIS_POINTS_DIVISOR).div(_refPrice) > maxDeviationBasisPointsBeforeError) {
            revert("Price deviation is too large");
        }

        // regardless of the fastPrice value the price returned cannot exceed a range of (_refPrice - maxDeviation%) to (_refPrice + maxDeviation%)
        uint256 maxPrice = _refPrice.mul(BASIS_POINTS_DIVISOR.add(maxDeviationBasisPoints)).div(BASIS_POINTS_DIVISOR);
        uint256 minPrice = _refPrice.mul(BASIS_POINTS_DIVISOR.sub(maxDeviationBasisPoints)).div(BASIS_POINTS_DIVISOR);

        // force a spread if it has been turned on or if watchers have flagged an issue with the fast price
        // also force a spread if the fastPrice exceeds the allowed range
        bool shouldForceSpread = !favorFastPrice(_token) || fastPrice < minPrice || fastPrice > maxPrice;

        if (shouldForceSpread) {
            // _maximise indicates that this will be used for an operation where it is safer to use the higher price
            if (_maximise) {
                // return the _refPrice if it is the higher price
                if (_refPrice > fastPrice) { return _refPrice; }
                // use the maxPrice if the fastPrice exceeds the max allowed value
                return fastPrice > maxPrice ? maxPrice : fastPrice;
            }

            // return the _refPrice if it is the lower price
            if (_refPrice < fastPrice) { return _refPrice; }
            // use the minPrice if the fastPrice is below the min allowed value
            return fastPrice < minPrice ? minPrice : fastPrice;
        }

        if (_maximise) {
            if (_refPrice > fastPrice) {
                uint256 volPrice = fastPrice.mul(BASIS_POINTS_DIVISOR.add(volBasisPoints)).div(BASIS_POINTS_DIVISOR);
                // if the _refPrice is more than the fastPrice, adjust the price upwards based on volBasisPoints
                // from the fastPrice towards the _refPrice, the volPrice should not be more than _refPrice
                return volPrice > _refPrice ? _refPrice : volPrice;
            }

            return fastPrice;
        }

        if (_refPrice < fastPrice) {
            uint256 volPrice = fastPrice.mul(BASIS_POINTS_DIVISOR.sub(volBasisPoints)).div(BASIS_POINTS_DIVISOR);
            // if the _refPrice is less than the fastPrice, adjust the price downwards based on volBasisPoints
            // from the fastPrice towards the _refPrice, the volPrice should not be less than _refPrice
            return volPrice < _refPrice ? _refPrice : volPrice;
        }

        return fastPrice;
    }

    function favorFastPrice(address _token) public view returns (bool) {
        if (isSpreadEnabled) {
            return false;
        }

        if (disableFastPriceVoteCount >= minAuthorizations) {
            // force a spread if watchers have flagged an issue with the fast price
            return false;
        }

        (/* uint256 prevRefPrice */, /* uint256 refTime */, uint256 cumulativeRefDelta, uint256 cumulativeFastDelta) = getPriceData(_token);
        if (cumulativeFastDelta > cumulativeRefDelta && cumulativeFastDelta.sub(cumulativeRefDelta) > maxCumulativeDeltaDiff) {
            // force a spread if the cumulative delta for the fast price feed exceeds the cumulative delta
            // for the Chainlink price feed by the maxCumulativeDeltaDiff allowed
            return false;
        }

        return true;
    }

    function getPriceData(address _token) public view returns (uint256, uint256, uint256, uint256) {
        PriceDataItem memory data = priceData[_token];
        return (uint256(data.refPrice), uint256(data.refTime), uint256(data.cumulativeRefDelta), uint256(data.cumulativeFastDelta));
    }

    function _setPricesWithBits(uint256 _priceBits, uint256 _timestamp) private {
        bool shouldUpdate = _setLastUpdatedValues(_timestamp);

        if (shouldUpdate) {
            address _fastPriceEvents = fastPriceEvents;
            address _vaultPriceFeed = vaultPriceFeed;

            for (uint256 j = 0; j < 8; j++) {
                uint256 index = j;
                if (index >= tokens.length) { return; }

                uint256 startBit = 32 * j;
                uint256 price = (_priceBits >> startBit) & BITMASK_32;

                address token = tokens[j];
                uint256 tokenPrecision = tokenPrecisions[j];
                uint256 adjustedPrice = price.mul(PRICE_PRECISION).div(tokenPrecision);

                _setPrice(token, adjustedPrice, _vaultPriceFeed, _fastPriceEvents);
            }
        }
    }

    function _setPrice(address _token, uint256 _price, address _vaultPriceFeed, address _fastPriceEvents) private {
        if (_vaultPriceFeed != address(0)) {
            uint256 refPrice = IVaultPriceFeed(_vaultPriceFeed).getLatestPrimaryPrice(_token);
            uint256 fastPrice = prices[_token];

            (uint256 prevRefPrice, uint256 refTime, uint256 cumulativeRefDelta, uint256 cumulativeFastDelta) = getPriceData(_token);

            if (prevRefPrice > 0) {
                uint256 refDeltaAmount = refPrice > prevRefPrice ? refPrice.sub(prevRefPrice) : prevRefPrice.sub(refPrice);
                uint256 fastDeltaAmount = fastPrice > _price ? fastPrice.sub(_price) : _price.sub(fastPrice);

                // reset cumulative delta values if it is a new time window
                if (refTime.div(priceDataInterval) != block.timestamp.div(priceDataInterval)) {
                    cumulativeRefDelta = 0;
                    cumulativeFastDelta = 0;
                }

                cumulativeRefDelta = cumulativeRefDelta.add(refDeltaAmount.mul(CUMULATIVE_DELTA_PRECISION).div(refPrice));
                cumulativeFastDelta = cumulativeFastDelta.add(fastDeltaAmount.mul(CUMULATIVE_DELTA_PRECISION).div(fastPrice));
            }

            if (cumulativeFastDelta > cumulativeRefDelta && cumulativeFastDelta.sub(cumulativeRefDelta) > maxCumulativeDeltaDiff) {
                emit MaxCumulativeDeltaDiffExceeded(_token, refPrice, fastPrice, cumulativeRefDelta, cumulativeFastDelta);
            }

            _setPriceData(_token, refPrice, cumulativeRefDelta, cumulativeFastDelta);
            emit PriceData(_token, refPrice, fastPrice, cumulativeRefDelta, cumulativeFastDelta);
        }

        prices[_token] = _price;
        _emitPriceEvent(_fastPriceEvents, _token, _price);
    }

    function _setPriceData(address _token, uint256 _refPrice, uint256 _cumulativeRefDelta, uint256 _cumulativeFastDelta) private {
        require(_refPrice < MAX_REF_PRICE, "FastPriceFeed: invalid refPrice");
        // skip validation of block.timestamp, it should only be out of range after the year 2100
        require(_cumulativeRefDelta < MAX_CUMULATIVE_REF_DELTA, "FastPriceFeed: invalid cumulativeRefDelta");
        require(_cumulativeFastDelta < MAX_CUMULATIVE_FAST_DELTA, "FastPriceFeed: invalid cumulativeFastDelta");

        priceData[_token] = PriceDataItem(
            uint160(_refPrice),
            uint32(block.timestamp),
            uint32(_cumulativeRefDelta),
            uint32(_cumulativeFastDelta)
        );
    }

    function _emitPriceEvent(address _fastPriceEvents, address _token, uint256 _price) private {
        if (_fastPriceEvents == address(0)) {
            return;
        }

        IFastPriceEvents(_fastPriceEvents).emitPriceEvent(_token, _price);
    }

    function _setLastUpdatedValues(uint256 _timestamp) private returns (bool) {
        if (minBlockInterval > 0) {
            require(block.number.sub(lastUpdatedBlock) >= minBlockInterval, "FastPriceFeed: minBlockInterval not yet passed");
        }

        require(_timestamp > block.timestamp.sub(maxTimeDeviation), "FastPriceFeed: _timestamp below allowed range");
        require(_timestamp < block.timestamp.add(maxTimeDeviation), "FastPriceFeed: _timestamp exceeds allowed range");

        // do not update prices if _timestamp is before the current lastUpdatedAt value
        if (_timestamp < lastUpdatedAt) {
            return false;
        }

        lastUpdatedAt = _timestamp;
        lastUpdatedBlock = block.number;

        return true;
    }
}
