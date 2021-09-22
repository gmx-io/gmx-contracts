const { expect } = require("chai")

function getDefault(obj, name, defaultValue) {
    return (name in obj) ? obj[name] : defaultValue;
}

function validateOrderFields(order, fields) {
    for (const [key, value] of Object.entries(fields)) {
        if (key === 'path') {
            order.path.forEach((item, index) => {
                expect(item, key).to.be.equal(value[index]);
            });
            return;
        }
        if (value === true) return expect(order[key], key).to.be.true;
        if (value === false) return expect(order[key], key).to.be.false;
        expect(order[key], key).to.be.equal(value);
    }
}

async function getTxFees(provider, tx) {
    const receipt = await provider.getTransactionReceipt(tx.hash);
    // use receipt.effectiveGasPrice for newer versions of hardhat
    return receipt.effectiveGasPrice.mul(receipt.gasUsed);
}

function positionWrapper(position) {
    return {
        size: position[0],
        collateral: position[1],
        averagePrice: position[2],
        entryFundingRate: position[3],
        reserveAmount: position[4]
    };
}

module.exports = {
	getDefault,
	validateOrderFields,
	getTxFees,
	positionWrapper
};
