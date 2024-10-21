// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../libraries/math/SafeMath.sol";

import "./interfaces/ISecondaryPriceFeed.sol";
import "./interfaces/IFastPriceFeed.sol";
import "./interfaces/IFastPriceEvents.sol";
import "../core/interfaces/IVaultPriceFeed.sol";
import "../core/interfaces/IPositionRouter.sol";
import "../access/Governable.sol";

import "./interfaces/IPyth.sol";
import "./interfaces/PythStructs.sol";

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

    uint256 public constant BASIS_POINTS_DIVISOR = 10000;

    uint256 public constant MAX_PRICE_DURATION = 30 minutes;

    IPyth public immutable pyth;

    bool public isInitialized;
    bool public isSpreadEnabled = false;

    address public immutable vaultPriceFeed;
    address public immutable fastPriceEvents;

    address public tokenManager;

    uint256 public override lastUpdatedAt;
    uint256 public override lastUpdatedBlock;

    uint256 public priceDuration;
    uint256 public maxPriceUpdateDelay;
    uint256 public spreadBasisPointsIfInactive;
    uint256 public spreadBasisPointsIfChainError;
    uint256 public minBlockInterval;

    uint256 public priceDataInterval;

    // allowed deviation from primary price
    uint256 public maxDeviationBasisPoints;

    uint256 public minAuthorizations;
    uint256 public disableFastPriceVoteCount = 0;

    mapping (address => bool) public isUpdater;

    mapping (address => uint256) public prices;
    mapping (address => bytes32) public priceFeedIds;
    mapping (address => PriceDataItem) public priceData;
    mapping (address => uint256) public maxCumulativeDeltaDiffs;

    mapping (address => bool) public isSigner;
    mapping (address => bool) public disableFastPriceVotes;

    address[] public tokens;

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
      address _pyth,
      uint256 _priceDuration,
      uint256 _maxPriceUpdateDelay,
      uint256 _minBlockInterval,
      uint256 _maxDeviationBasisPoints,
      address _vaultPriceFeed,
      address _fastPriceEvents,
      address _tokenManager
    ) public {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        pyth = IPyth(_pyth);
        priceDuration = _priceDuration;
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
        minBlockInterval = _minBlockInterval;
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
        fastPriceEvents = _fastPriceEvents;
        vaultPriceFeed = _vaultPriceFeed;
        tokenManager = _tokenManager;
    }

    function initialize(
        uint256 _minAuthorizations,
        address[] memory _signers,
        address[] memory _updaters,
        address[] memory _tokens,
        bytes32[] memory _priceFeedIds
    ) public onlyGov {
        require(!isInitialized, "FastPriceFeed: already initialized");
        require(_tokens.length == _priceFeedIds.length, "FastPriceFeed: invalid lengths");

        isInitialized = true;

        minAuthorizations = _minAuthorizations;

        for (uint256 i; i < _signers.length; i++) {
            address signer = _signers[i];
            isSigner[signer] = true;
        }

        for (uint256 i; i < _updaters.length; i++) {
            address updater = _updaters[i];
            isUpdater[updater] = true;
        }

        tokens = _tokens;

        for (uint256 i; i < _tokens.length; i++) {
            address token = _tokens[i];
            priceFeedIds[token] = _priceFeedIds[i];
        }
    }

    function setSigner(address _account, bool _isActive) external override onlyGov {
        isSigner[_account] = _isActive;
    }

    function setUpdater(address _account, bool _isActive) external override onlyGov {
        isUpdater[_account] = _isActive;
    }

    function setPriceDuration(uint256 _priceDuration) external override onlyGov {
        require(_priceDuration <= MAX_PRICE_DURATION, "FastPriceFeed: invalid _priceDuration");
        priceDuration = _priceDuration;
    }

    function setMaxPriceUpdateDelay(uint256 _maxPriceUpdateDelay) external override onlyGov {
        maxPriceUpdateDelay = _maxPriceUpdateDelay;
    }

    function setSpreadBasisPointsIfInactive(uint256 _spreadBasisPointsIfInactive) external override onlyGov {
        spreadBasisPointsIfInactive = _spreadBasisPointsIfInactive;
    }

    function setSpreadBasisPointsIfChainError(uint256 _spreadBasisPointsIfChainError) external override onlyGov {
        spreadBasisPointsIfChainError = _spreadBasisPointsIfChainError;
    }

    function setMinBlockInterval(uint256 _minBlockInterval) external override onlyGov {
        minBlockInterval = _minBlockInterval;
    }

    function setIsSpreadEnabled(bool _isSpreadEnabled) external override onlyGov {
        isSpreadEnabled = _isSpreadEnabled;
    }

    function setLastUpdatedAt(uint256 _lastUpdatedAt) external onlyGov {
        lastUpdatedAt = _lastUpdatedAt;
    }

    function setTokenManager(address _tokenManager) external onlyTokenManager {
        tokenManager = _tokenManager;
    }

    function setMaxDeviationBasisPoints(uint256 _maxDeviationBasisPoints) external override onlyTokenManager {
        maxDeviationBasisPoints = _maxDeviationBasisPoints;
    }

    function setMaxCumulativeDeltaDiffs(address[] memory _tokens,  uint256[] memory _maxCumulativeDeltaDiffs) external override onlyTokenManager {
        require (_tokens.length == _maxCumulativeDeltaDiffs.length, "FastPriceFeed: mismatched lengths");

        for (uint256 i; i < _tokens.length; i++) {
            address token = _tokens[i];
            maxCumulativeDeltaDiffs[token] = _maxCumulativeDeltaDiffs[i];
        }
    }

    function setPriceDataInterval(uint256 _priceDataInterval) external override onlyTokenManager {
        priceDataInterval = _priceDataInterval;
    }

    function setMinAuthorizations(uint256 _minAuthorizations) external onlyTokenManager {
        minAuthorizations = _minAuthorizations;
    }

    function setPricesWithData(bytes[] calldata priceUpdateData) external payable onlyUpdater {
        _setPricesWithData(priceUpdateData);
    }

    function setPricesWithDataAndExecute(
        address _positionRouter,
        bytes[] calldata priceUpdateData,
        uint256 _endIndexForIncreasePositions,
        uint256 _endIndexForDecreasePositions,
        uint256 _maxIncreasePositions,
        uint256 _maxDecreasePositions
    ) external payable onlyUpdater {
        _setPricesWithData(priceUpdateData);

        IPositionRouter positionRouter = IPositionRouter(_positionRouter);
        uint256 maxEndIndexForIncrease = positionRouter.increasePositionRequestKeysStart().add(_maxIncreasePositions);
        uint256 maxEndIndexForDecrease = positionRouter.decreasePositionRequestKeysStart().add(_maxDecreasePositions);

        if (_endIndexForIncreasePositions > maxEndIndexForIncrease) {
            _endIndexForIncreasePositions = maxEndIndexForIncrease;
        }

        if (_endIndexForDecreasePositions > maxEndIndexForDecrease) {
            _endIndexForDecreasePositions = maxEndIndexForDecrease;
        }

        positionRouter.executeIncreasePositions(_endIndexForIncreasePositions, payable(msg.sender));
        positionRouter.executeDecreasePositions(_endIndexForDecreasePositions, payable(msg.sender));
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

    // under regular operation, the fastPrice (prices[token]) is returned and there is no spread returned from this function,
    // though VaultPriceFeed might apply its own spread
    //
    // if the fastPrice has not been updated within priceDuration then it is ignored and only _refPrice with a spread is used (spread: spreadBasisPointsIfInactive)
    // in case the fastPrice has not been updated for maxPriceUpdateDelay then the _refPrice with a larger spread is used (spread: spreadBasisPointsIfChainError)
    //
    // there will be a spread from the _refPrice to the fastPrice in the following cases:
    // - in case isSpreadEnabled is set to true
    // - in case the maxDeviationBasisPoints between _refPrice and fastPrice is exceeded
    // - in case watchers flag an issue
    // - in case the cumulativeFastDelta exceeds the cumulativeRefDelta by the maxCumulativeDeltaDiff
    function getPrice(address _token, uint256 _refPrice, bool _maximise) external override view returns (uint256) {
        if (block.timestamp > lastUpdatedAt.add(maxPriceUpdateDelay)) {
            if (_maximise) {
                return _refPrice.mul(BASIS_POINTS_DIVISOR.add(spreadBasisPointsIfChainError)).div(BASIS_POINTS_DIVISOR);
            }

            return _refPrice.mul(BASIS_POINTS_DIVISOR.sub(spreadBasisPointsIfChainError)).div(BASIS_POINTS_DIVISOR);
        }

        if (block.timestamp > lastUpdatedAt.add(priceDuration)) {
            if (_maximise) {
                return _refPrice.mul(BASIS_POINTS_DIVISOR.add(spreadBasisPointsIfInactive)).div(BASIS_POINTS_DIVISOR);
            }

            return _refPrice.mul(BASIS_POINTS_DIVISOR.sub(spreadBasisPointsIfInactive)).div(BASIS_POINTS_DIVISOR);
        }

        uint256 fastPrice = prices[_token];
        if (fastPrice == 0) { return _refPrice; }

        uint256 diffBasisPoints = _refPrice > fastPrice ? _refPrice.sub(fastPrice) : fastPrice.sub(_refPrice);
        diffBasisPoints = diffBasisPoints.mul(BASIS_POINTS_DIVISOR).div(_refPrice);

        // create a spread between the _refPrice and the fastPrice if the maxDeviationBasisPoints is exceeded
        // or if watchers have flagged an issue with the fast price
        bool hasSpread = !favorFastPrice(_token) || diffBasisPoints > maxDeviationBasisPoints;

        if (hasSpread) {
            // return the higher of the two prices
            if (_maximise) {
                return _refPrice > fastPrice ? _refPrice : fastPrice;
            }

            // return the lower of the two prices
            return _refPrice < fastPrice ? _refPrice : fastPrice;
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
        if (cumulativeFastDelta > cumulativeRefDelta && cumulativeFastDelta.sub(cumulativeRefDelta) > maxCumulativeDeltaDiffs[_token]) {
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

    function _setPricesWithData(bytes[] calldata priceUpdateData) private {
        _setLastUpdatedValues();

        uint256 fee = pyth.getUpdateFee(priceUpdateData);
        require(msg.value >= fee, "insufficient value");
        pyth.updatePriceFeeds{ value: fee }(priceUpdateData);

        uint256 tokenCount = tokens.length;
        uint256 _priceDuration = priceDuration;

        for (uint256 i; i < tokenCount; i++) {
            address token = tokens[i];
            bytes32 priceFeedId = priceFeedIds[token];
            PythStructs.Price memory pythPrice = pyth.getPrice(priceFeedId);
            require(pythPrice.price > 0, "pyth price <= 0");
            // require that pythPrice publishTime is recent
            require(pythPrice.publishTime > block.timestamp - _priceDuration, "stale pyth price");

            // the confidence interval is not considered here
            // the manually configured spread is assumed to be sufficient
            uint256 price = uint256(pythPrice.price);

            // adjust price to have 30 decimals of precision
            if (pythPrice.expo < 0) {
                uint256 divisor = 10 ** uint256(-pythPrice.expo);
                // if divisor < PRICE_PRECISION there would be some rounding of price
                // it is assumed that rounding of precision after 30 decimals should
                // not cause significant differences in price calculations
                price = price * PRICE_PRECISION / divisor;
            } else {
                uint256 multiplier = 10 ** uint256(pythPrice.expo);
                price = price * PRICE_PRECISION * multiplier;
            }

            _setPrice(token, price);
        }
    }

    function _setPrice(address _token, uint256 _price) private {
        uint256 refPrice = IVaultPriceFeed(vaultPriceFeed).getLatestPrimaryPrice(_token);
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

            cumulativeRefDelta = cumulativeRefDelta.add(refDeltaAmount.mul(CUMULATIVE_DELTA_PRECISION).div(prevRefPrice));
            cumulativeFastDelta = cumulativeFastDelta.add(fastDeltaAmount.mul(CUMULATIVE_DELTA_PRECISION).div(fastPrice));
        }

        if (cumulativeFastDelta > cumulativeRefDelta && cumulativeFastDelta.sub(cumulativeRefDelta) > maxCumulativeDeltaDiffs[_token]) {
            emit MaxCumulativeDeltaDiffExceeded(_token, refPrice, fastPrice, cumulativeRefDelta, cumulativeFastDelta);
        }

        _setPriceData(_token, refPrice, cumulativeRefDelta, cumulativeFastDelta);
        emit PriceData(_token, refPrice, fastPrice, cumulativeRefDelta, cumulativeFastDelta);

        prices[_token] = _price;
        _emitPriceEvent(_token, _price);
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

    function _emitPriceEvent(address _token, uint256 _price) private {
        IFastPriceEvents(fastPriceEvents).emitPriceEvent(_token, _price);
    }

    function _setLastUpdatedValues() private {
        if (minBlockInterval > 0) {
            require(block.number.sub(lastUpdatedBlock) >= minBlockInterval, "FastPriceFeed: minBlockInterval not yet passed");
        }

        lastUpdatedAt = block.timestamp;
        lastUpdatedBlock = block.number;
    }
}
