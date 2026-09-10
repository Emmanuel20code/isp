
const todayCashVouchers = [
    { id: '1', packages: [{ price_kes: 100 }] },
    { id: '2', packages: { price_kes: 50 } }
];

const sumCashVouchers = (vouchers: any[] | null, txns: any[] | null) => {
    if (!vouchers) return 0;
    const linkedVoucherIds = new Set((txns ?? []).map((t) => t.voucher_id).filter(Boolean));
    return vouchers.reduce((acc, v) => {
        if (linkedVoucherIds.has(v.id)) return acc;
        // If v.packages is an array, this is undefined
        const pkg = Array.isArray(v.packages) ? v.packages[0] : v.packages;
        const price = pkg?.price_kes ?? 0;
        console.log(`Voucher ${v.id} price: ${price} (raw packages: ${JSON.stringify(v.packages)})`);
        return acc + price;
    }, 0);
};

console.log("Total:", sumCashVouchers(todayCashVouchers, []));

const badVouchers = [
    { id: '3', packages: [{ price_kes: 100 }] }
];
const oldSum = (vouchers: any[] | null) => {
    if (!vouchers) return 0;
    return vouchers.reduce((acc, v) => {
        const price = v.packages?.price_kes ?? 0;
        console.log(`Old sum - price: ${price}`);
        return acc + price;
    }, 0);
};
console.log("Old sum total with array:", oldSum(badVouchers));
