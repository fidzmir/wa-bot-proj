// Master Spreadsheet Rule Book (Hanya digunakan sebagai validasi awal ketikan operator di WA)
const ITEM_RULES = {
    "30G161": /\b\d{4,5}\b/, "33G198": /\b\d{4,5}\b/, "36G161": /\b\d{4,5}\b/, "36G198": /\b\d{4,5}\b/,
    "30H160": /\b\d{14}\b/, "33F161": /\b\d{6}A\d{9}\b/, "33F198": /\b\d{6}A\d{9}\b/, "36F161": /\b\d{6}A\d{9}\b/,
    "33P160": /\b\d{6}-[A-Z0-9]+-\d-\d{2}-\d{2}\b/, "33P150": /\b\d{6}-?[A-Z0-9]?-?\d?-?\d{2,4}-?\d{0,2}\b/,
    "30R061": /\b\d{5}-[A-Z]\d\b/, "35I161": /\b(HT\d{10}|\d{9,10})\b/, "35O190": /\b\d[A-Z]\d{6}\b/
};

module.exports = { ITEM_RULES };
